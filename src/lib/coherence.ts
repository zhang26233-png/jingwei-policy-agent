// 政策一致性指数（PCI）：衡量同一渠道上多项政策是否朝同一方向使劲。
//
// 三个分项都由已有文本字段推出，每一步都能追到具体政策与具体表述，不引入模型打分——
// 这是能被复算、被质疑、被复现的前提。口径见 method 字段，页面上要原样展示。
import type { Policy } from '../types';
import { CHANNEL_META, detectPolarity, policyChannels, type ChannelId } from './province';

export type Polarity = 1 | -1 | 0;

export interface ChannelMember {
  id: string;
  short: string;
  title: string;
  date: string;
  issuer: string;
  polarity: Polarity;
  weight: number;
}

export interface CoherencePart {
  id: 'horizontal' | 'temporal' | 'alignment';
  label: string;
  // null 表示样本不足（如同渠道仅一条政策），该分项不参与加权，也不显示为 0 分
  score: number | null;
  weight: number;
  detail: string;
}

export interface ChannelCoherence {
  id: ChannelId;
  name: string;
  short: string;
  desc: string;
  policyCount: number;
  directionalCount: number;
  pci: number;
  grade: '高' | '中' | '低';
  confidence: 'high' | 'medium' | 'low';
  parts: CoherencePart[];
  mix: { expansion: number; restriction: number; neutral: number };
  members: ChannelMember[];
  // 方向相反的两组文件。只做并列展示，不断言两份文件互相冲突——
  // 仅凭方向词判定"甲和乙打架"，一旦被追问对象是否相同就答不上来。
  opposing: { expansion: ChannelMember[]; restriction: ChannelMember[] };
  notes: string[];
}

export interface CoherenceResult {
  channels: ChannelCoherence[];
  overall: {
    pci: number;
    channelCount: number;
    policyCount: number;
    judgedChannels: number;
    weakest: ChannelCoherence | null;
    strongest: ChannelCoherence | null;
  };
  narrative: string[];
  caveats: string[];
  method: { id: string; label: string; weight: number; how: string }[];
}

// 目标语义 → 渠道。用来判断"政策说要用力的地方"和"政策实际动用的工具"是否对得上。
const GOAL_CHANNEL: { pattern: RegExp; id: ChannelId }[] = [
  { pattern: /(消费|内需|以旧换新|零售|服务消费)/, id: 'consumption' },
  { pattern: /(投资|项目|基建|专项债|政府投资|超长期)/, id: 'fiscal' },
  { pattern: /(就业|社保|养老|育儿|医疗|救助|民生|收入)/, id: 'welfare' },
  { pattern: /(出口|外贸|外资|跨境|关税|开放)/, id: 'trade' },
  { pattern: /(房地产|住房|保障房|收储|城中村|楼市)/, id: 'property' },
  { pattern: /(民营|中小企业|个体工商户|清欠|账款|公平竞争)/, id: 'private' },
  { pattern: /(制造|设备更新|技改|产业|新质|产能|集群)/, id: 'industry' },
  { pattern: /(融资|信贷|贷款|利率|降准|降息|再贷款)/, id: 'credit' },
  { pattern: /(转移支付|财力|化债|基层三保|县域)/, id: 'transfer' },
];

// 上游关系：转移支付的目标常常写成"扩大消费""稳就业"，工具本身不在消费渠道上，
// 但它正是通往消费的合理环节。不认这层关系，会把正常的传导链误判成"目标与工具对不上"。
const UPSTREAM: Partial<Record<ChannelId, ChannelId[]>> = {
  transfer: ['fiscal', 'welfare', 'consumption', 'industry', 'private', 'property'],
  fiscal: ['industry', 'consumption', 'property', 'welfare', 'trade', 'private'],
  credit: ['industry', 'property', 'private', 'consumption'],
  industry: ['trade'],
};

const PART_WEIGHT = { horizontal: 0.45, temporal: 0.3, alignment: 0.25 } as const;

const shortLabel = (policy: Policy) => {
  const text = policy.shortTitle || policy.title;
  return text.length > 10 ? `${text.slice(0, 9)}…` : text;
};

/** 把政策按渠道切开。一条政策可同时进入多个渠道，权重为渠道占比。 */
export function groupByChannel(policies: Policy[]): Map<ChannelId, ChannelMember[]> {
  const map = new Map<ChannelId, ChannelMember[]>();
  for (const policy of policies) {
    const polarity = detectPolarity(policy) as Polarity;
    for (const channel of policyChannels(policy)) {
      const id = channel.id as ChannelId;
      const list = map.get(id) ?? [];
      list.push({
        id: policy.id,
        short: shortLabel(policy),
        title: policy.shortTitle || policy.title,
        date: policy.date ?? '',
        issuer: policy.issuer ?? '',
        polarity,
        weight: channel.weight,
      });
      map.set(id, list);
    }
  }
  return map;
}

/** 政策声明的目标落在哪些渠道。取量化目标、目标类义务与主题标签三处线索。 */
function goalChannels(policy: Policy): Set<ChannelId> {
  const texts: string[] = [];
  for (const target of policy.quantTargets ?? []) texts.push(target.text);
  for (const obligation of policy.obligations ?? []) {
    if (obligation.kind === '目标') texts.push(...obligation.items);
  }
  texts.push(...(policy.goals ?? []));
  texts.push(policy.title);
  const blob = texts.join('｜');
  const hits = new Set<ChannelId>();
  for (const rule of GOAL_CHANNEL) {
    if (rule.pattern.test(blob)) hits.add(rule.id);
  }
  return hits;
}

/** 横向一致性：有明确方向的政策里，方向是否一致。 */
function horizontalPart(members: ChannelMember[]): CoherencePart {
  const directional = members.filter((item) => item.polarity !== 0);
  const base = { id: 'horizontal' as const, label: '横向一致', weight: PART_WEIGHT.horizontal };
  if (directional.length === 0) {
    return { ...base, score: null, detail: '本渠道政策均未判定出明确方向，无法计算' };
  }
  const totalWeight = directional.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return { ...base, score: null, detail: '权重缺失，无法计算' };
  const signed = directional.reduce((sum, item) => sum + item.weight * item.polarity, 0) / totalWeight;
  const score = Math.round(Math.abs(signed) * 100);
  const expansion = directional.filter((item) => item.polarity === 1).length;
  const restriction = directional.length - expansion;
  return {
    ...base,
    score,
    detail:
      `可判方向 ${directional.length} 项：扩张 ${expansion} 项、收紧 ${restriction} 项，` +
      `方向净值 ${signed >= 0 ? '+' : ''}${signed.toFixed(2)}`,
  };
}

/** 时序一致性：同一渠道上政策方向前后翻转的次数。翻转越多，跨期取向越不稳。 */
function temporalPart(members: ChannelMember[]): CoherencePart {
  const base = { id: 'temporal' as const, label: '时序一致', weight: PART_WEIGHT.temporal };
  const dated = members
    .filter((item) => item.polarity !== 0 && item.date)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  if (dated.length < 2) {
    return { ...base, score: null, detail: '同渠道可判方向的政策不足两条，无法考察跨期变化' };
  }
  let flips = 0;
  const flipPoints: string[] = [];
  for (let i = 1; i < dated.length; i += 1) {
    if (dated[i].polarity !== dated[i - 1].polarity) {
      flips += 1;
      flipPoints.push(`${dated[i - 1].short} → ${dated[i].short}`);
    }
  }
  const pairs = dated.length - 1;
  const score = Math.round((1 - flips / pairs) * 100);
  return {
    ...base,
    score,
    detail:
      flips === 0
        ? `按发文时间排列 ${dated.length} 项，方向未出现翻转`
        : `按发文时间排列 ${dated.length} 项，出现 ${flips} 次方向翻转（${flipPoints.slice(0, 2).join('；')}${flips > 2 ? ' 等' : ''}）`,
  };
}

/** 目标—工具一致：政策声称要发力的渠道，和它实际动用的工具渠道，是否有交集。 */
function alignmentPart(members: ChannelMember[], policies: Map<string, Policy>, channelId: ChannelId): CoherencePart {
  const base = { id: 'alignment' as const, label: '目标—工具', weight: PART_WEIGHT.alignment };
  let judged = 0;
  let matched = 0;
  const mismatch: string[] = [];
  const reachable = new Set<ChannelId>([channelId, ...(UPSTREAM[channelId] ?? [])]);
  for (const member of members) {
    const policy = policies.get(member.id);
    if (!policy) continue;
    const goals = goalChannels(policy);
    // 目标里没提任何具体渠道的文件不参与判定，避免"没有目标"被算成"目标错位"
    if (goals.size === 0) continue;
    judged += 1;
    if ([...goals].some((goal) => reachable.has(goal))) matched += 1;
    else mismatch.push(member.short);
  }
  if (judged === 0) {
    return { ...base, score: null, detail: '本渠道政策均未在文本中写明目标落点，无法判定匹配' };
  }
  const score = Math.round((matched / judged) * 100);
  return {
    ...base,
    score,
    detail:
      mismatch.length === 0
        ? `${judged} 项目标都能由本渠道（含其下游）承接`
        : `${judged} 项政策中 ${mismatch.length} 项目标落在本渠道够不着的地方（${mismatch.slice(0, 2).join('、')}${mismatch.length > 2 ? ' 等' : ''}）`,
  };
}

const gradeOf = (score: number): '高' | '中' | '低' => (score >= 70 ? '高' : score >= 45 ? '中' : '低');

export function buildCoherence(policies: Policy[]): CoherenceResult {
  // 只统计政策文件：发布会实录和监管动态没有政策工具，混进来会稀释方向一致性
  const docs = policies.filter((policy) => (policy.docType ?? '政策文件') === '政策文件');
  const byId = new Map(docs.map((policy) => [policy.id, policy]));
  const grouped = groupByChannel(docs);

  const channels: ChannelCoherence[] = (Object.keys(CHANNEL_META) as ChannelId[])
    .map((id) => {
      const members = (grouped.get(id) ?? []).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
      const parts = [horizontalPart(members), temporalPart(members), alignmentPart(members, byId, id)];
      const usable = parts.filter((part): part is CoherencePart & { score: number } => part.score !== null);
      const weightSum = usable.reduce((sum, part) => sum + part.weight, 0);
      const pci =
        weightSum > 0
          ? Math.round(usable.reduce((sum, part) => sum + part.score * part.weight, 0) / weightSum)
          : 0;

      const expansion = members.filter((item) => item.polarity === 1).length;
      const restriction = members.filter((item) => item.polarity === -1).length;

      const ups = members.filter((item) => item.polarity === 1);
      const downs = members.filter((item) => item.polarity === -1);
      const opposing = { expansion: ups.slice(0, 3), restriction: downs.slice(0, 3) };

      const notes: string[] = [];
      if (members.length < 2) notes.push('该渠道本期只有 1 项政策，谈不上协同与否，指标仅供参考');
      if (expansion > 0 && restriction > 0) {
        notes.push('同渠道内扩张与收紧并存，净效应需按政策力度再加权；是否真冲突需人工比对两份文件针对的对象');
      }
      if (members.length >= 3 && parts[1].score === null) notes.push('方向可判的政策太少，跨期稳定性无法考察');

      return {
        id,
        name: CHANNEL_META[id].name,
        short: CHANNEL_META[id].short,
        desc: CHANNEL_META[id].desc,
        policyCount: members.length,
        directionalCount: expansion + restriction,
        pci,
        grade: gradeOf(pci),
        confidence: members.length >= 3 ? 'high' : members.length === 2 ? 'medium' : 'low',
        parts,
        mix: { expansion, restriction, neutral: members.length - expansion - restriction },
        members,
        opposing,
        notes,
      } satisfies ChannelCoherence;
    })
    .filter((channel) => channel.policyCount > 0)
    .sort((a, b) => b.policyCount - a.policyCount);

  // 总体一致性按渠道政策数加权：只有一两项政策的渠道不该和十项政策的渠道等权
  const totalPolicies = channels.reduce((sum, channel) => sum + channel.policyCount, 0);
  const overallPci =
    totalPolicies > 0
      ? Math.round(channels.reduce((sum, channel) => sum + channel.pci * channel.policyCount, 0) / totalPolicies)
      : 0;
  const judged = channels
    .filter((channel) => channel.policyCount >= 2)
    .sort((a, b) => a.pci - b.pci);

  const weak = judged.slice(0, 2);
  const narrative: string[] = [];
  narrative.push(
    `本期 ${docs.length} 份政策文件分布在 ${channels.length} 个渠道上，按政策数加权的总体一致性为 ${overallPci} 分。`,
  );
  if (weak.length > 0) {
    narrative.push(
      `一致性最低的是「${weak.map((item) => item.short).join('」「')}」——` +
        `${weak[0].mix.expansion > 0 && weak[0].mix.restriction > 0 ? `其中扩张方向 ${weak[0].mix.expansion} 份、收紧方向 ${weak[0].mix.restriction} 份同时出现` : '主要问题是方向未定，读者无法从文件本身判断取向'}。`,
    );
  }
  const flipChannels = channels.filter((channel) => channel.parts[1].score !== null && (channel.parts[1].score ?? 100) < 70);
  if (flipChannels.length > 0) {
    narrative.push(
      `「${flipChannels.map((item) => item.short).join('」「')}」在三个月内出现过方向翻转，跨期一致性弱于同期一致性——这类反复会削弱政策信号的可信度。`,
    );
  }
  const alignWeak = channels.filter((channel) => (channel.parts[2].score ?? 100) < 50);
  if (alignWeak.length > 0) {
    narrative.push(
      `「${alignWeak.slice(0, 3).map((item) => item.short).join('」「')}」的目标与工具对不上：文件写了要在这个方向发力，但本期该渠道上没有对应的工具。`,
    );
  }

  return {
    channels,
    overall: {
      pci: overallPci,
      channelCount: channels.length,
      policyCount: docs.length,
      judgedChannels: judged.length,
      weakest: judged[0] ?? null,
      strongest: judged[judged.length - 1] ?? null,
    },
    narrative,
    caveats: [
      '一致性是"文本取向"的一致性，衡量文件之间是否同向，不代表执行层面已经协同。',
      '方向判定由关键词规则给出（扩张词／约束词），非常规表述可能判错；结论须经人工抽检。',
      '政策数少于 2 的渠道不参与排序，其分数只作留档。',
      '同一政策可同时作用于多个渠道，各渠道政策数相加大于文件总数。',
    ],
    method: [
      {
        id: 'horizontal',
        label: '横向一致',
        weight: PART_WEIGHT.horizontal,
        how: '同一渠道内，有明确方向的政策按"扩张 +1／收紧 −1"加权求和，取净值绝对值。0 分表示同渠道政策方向互相抵消。',
      },
      {
        id: 'temporal',
        label: '时序一致',
        weight: PART_WEIGHT.temporal,
        how: '同渠道政策按发文时间排序，统计相邻两项方向是否翻转。翻转率越高，跨期取向越不稳定。',
      },
      {
        id: 'alignment',
        label: '目标—工具',
        weight: PART_WEIGHT.alignment,
        how: '从量化目标与目标类条款中识别政策声称要发力的渠道，检查本渠道（含其下游渠道，如转移支付→消费）能否承接，能承接即计匹配。',
      },
    ],
  };
}
