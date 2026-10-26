// 作用机制链：把"政策文本"翻译成"工具 → 中间变量 → 主体行为 → 宏观结果"的四段可核查推理。
// 每条链都必须给出时滞、方向、证据句和失效条件，否则不予展示。
import type { Policy } from '../types';
import { CHANNEL_META, detectPolarity, policyChannels, type ChannelId } from './province';

export type MechanismLayer = 'tool' | 'variable' | 'behavior' | 'outcome';

export interface MechanismLink {
  layer: MechanismLayer;
  layerLabel: string;
  label: string;
  detail: string;
  direction: 1 | -1 | 0;
  strength: 1 | 2 | 3;
}

export interface MechanismChain {
  id: string;
  policyId: string;
  channelId: ChannelId;
  channelName: string;
  polarity: 1 | -1 | 0;
  directionLabel: string;
  latency: string;
  links: MechanismLink[];
  evidence: string;
  summary: string;
  risks: string[];
}

interface ChannelPath {
  variable: { up: string; down: string };
  behavior: { up: string; down: string };
  outcome: { up: string; down: string };
  latency: string;
  risk: string;
  keywords: string[];
}

const CHANNEL_PATH: Record<ChannelId, ChannelPath> = {
  fiscal: {
    variable: { up: '财政支出强度与项目资本金增加', down: '财政支出节奏放缓、项目资本金收紧' },
    behavior: { up: '地方开工提速、企业订单与用工回升', down: '项目开工延后、企业订单缩减' },
    outcome: { up: '基建投资与总需求扩张', down: '基建投资与总需求降温' },
    latency: '1—2 个季度',
    risk: '受项目储备与地方配套能力制约，资金下达后未必立即形成实物工作量',
    keywords: ['财政支出', '预算', '专项债', '投资', '基建', '债券', '资金'],
  },
  transfer: {
    variable: { up: '地方可用财力与化债资源改善', down: '地方可用财力收紧' },
    behavior: { up: '基层三保压力缓解、拖欠款清偿加快', down: '支出压减、在建项目延后' },
    outcome: { up: '县域消费与投资修复', down: '基层需求走弱' },
    latency: '1—2 个季度',
    risk: '财力下沉到市县需要时间，省级统筹环节可能改变实际投向',
    keywords: ['转移支付', '化债', '置换', '清欠', '三保', '财力', '债务'],
  },
  credit: {
    variable: { up: '融资成本下行、信贷可得性上升', down: '融资成本上升、信贷额度收紧' },
    behavior: { up: '银行放贷意愿回升，企业与居民加杠杆', down: '银行审慎放贷、企业推迟扩产' },
    outcome: { up: '投资与耐用品消费扩张', down: '投资与消费降温' },
    latency: '即时—1 个季度',
    risk: '若实体融资需求不足，宽货币可能滞留银行间市场而不进入实体',
    keywords: ['降准', '降息', '利率', '贷款', '信贷', '再贷款', '流动性', '逆回购'],
  },
  consumption: {
    variable: { up: '居民实际购买力上升、置换成本下降', down: '补贴退坡、置换成本上升' },
    behavior: { up: '耐用品更新与服务消费提前释放', down: '大额消费延后' },
    outcome: { up: '社会消费品零售与消费倾向回升', down: '社会消费品零售增速回落' },
    latency: '1 个季度内',
    risk: '补贴会形成需求前置，退坡后可能出现反向拖累',
    keywords: ['消费', '以旧换新', '补贴', '零售', '服务消费', '消费券', '内需'],
  },
  property: {
    variable: { up: '购房成本与库存压力下降', down: '购房与开发融资条件收紧' },
    behavior: { up: '居民购房意愿与房企拿地边际改善', down: '观望加深、拿地收缩' },
    outcome: { up: '地产投资与地方土地收入企稳', down: '地产投资与土地收入承压' },
    latency: '2—4 个季度',
    risk: '居民收入预期未稳时，利率下调对成交的弹性会明显减弱',
    keywords: ['房地产', '住房', '房贷', '收储', '城中村', '保交房', '土地', '商品房'],
  },
  trade: {
    variable: { up: '外需条件与出口成本改善', down: '关税与合规成本上升' },
    behavior: { up: '外贸企业接单与产能利用率上升', down: '订单转移、产能外迁' },
    outcome: { up: '出口与制造业景气回升', down: '出口与制造业景气承压' },
    latency: '1—2 个季度',
    risk: '外部需求、汇率与贸易伙伴政策不在国内政策控制范围内',
    keywords: ['出口', '关税', '外贸', '跨境', '外资', '海关', '贸易'],
  },
  private: {
    variable: { up: '民营融资门槛与隐性壁垒下降', down: '准入与合规成本上升' },
    behavior: { up: '民间资本扩产、雇佣回升', down: '民间投资转为观望' },
    outcome: { up: '制造业投资与就业改善', down: '制造业投资与就业走弱' },
    latency: '2—4 个季度',
    risk: '预期修复慢于政策落地，需要连续一致信号才能改变投资决策',
    keywords: ['民营', '中小企业', '个体工商户', '公平竞争', '准入', '清欠', '账款'],
  },
  welfare: {
    variable: { up: '居民保障性收入增加、预防性储蓄下降', down: '保障水平压减' },
    behavior: { up: '家庭消费与劳动供给回升', down: '预防性储蓄上升' },
    outcome: { up: '消费倾向与社会稳定性改善', down: '消费倾向走弱' },
    latency: '1—3 个季度',
    risk: '补贴规模相对收入基数偏小，对总需求的乘数有限',
    keywords: ['就业', '社保', '育儿', '托育', '医疗', '养老金', '补贴', '失业保险'],
  },
  industry: {
    variable: { up: '设备投资成本下降、技改门槛降低', down: '技改成本与产能约束上升' },
    behavior: { up: '企业设备更新与产线改造加快', down: '扩产计划推迟' },
    outcome: { up: '制造业投资与生产率提升', down: '制造业投资放缓' },
    latency: '2—4 个季度',
    risk: '贴息与补贴依赖企业自有资金配套，中小企业受益分布不均',
    keywords: ['设备更新', '技改', '制造', '产业', '智能', '产能', '贴息', '改造'],
  },
};

const TOOL_VERB = /(补贴|贴息|降准|降息|专项债|债券|转移支付|投资|减税|退税|减免|贷款|再贷款|补助|奖励|试点|更新|改造|建设|发行|下达|扩大|提高|降低|支持|新增|设立|安排|取消|下调)/;
const TOOL_NOISE = /(源头到|末端|有关|原则上|机制|工作|情况|问题|通知|附件)/;
const TOOL_START = /^(安排|下达|实施|开展|扩大|提高|降低|调整|给予|新增|设立|取消|下调|发行|减免|免征|试点|支持|推动|加强|完善|建立|延长|放宽|拓宽|增加)/;
const TOOL_TAIL = /(比例|标准|范围|额度|上限|要素)$/;
const EVIDENCE_NOISE = /^(现印发|现将|请遵照|请认真|特此|附件|各省|国务院有关|抄送|财[金预税]〔|.{0,10}〔\d{4}〕)/;

// 工具抽取为空时，用工具类型翻译成人话，避免出现"财政、法治、货币政策工具"这种拼接标签。
const TYPE_TOOL: Record<string, string> = {
  财政: '财政补贴与预算安排',
  货币: '信贷与利率工具',
  消费: '消费激励与补贴',
  民生: '民生保障支出',
  法治: '制度规范与准入管理',
  产业: '产业支持与项目安排',
};

function pickTools(policy: Policy): string[] {
  const raw = (policy.instruments ?? []).filter((item) => item.length >= 5 && item.length <= 42 && !TOOL_NOISE.test(item));
  const scored = raw
    .map((item) => {
      let score = 0;
      if (/\d/.test(item)) score += 3;
      if (TOOL_VERB.test(item)) score += 2;
      // 以动词开头的短语更像"工具"，以比例／标准结尾的更像"统计口径"。
      if (TOOL_START.test(item)) score += 2;
      if (TOOL_TAIL.test(item)) score -= 2;
      if (item.length <= 20) score += 1;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.item);
  if (scored.length > 0) return scored;
  const mapped = (policy.instrumentTypes ?? []).map((type) => TYPE_TOOL[type]).filter(Boolean);
  return mapped.length > 0 ? mapped.slice(0, 2) : ['政策工具'];
}

// 正文开头常把发文机关和成文日期粘在一句里，展示时剥掉，只留可引用的内容。
const stripPreamble = (text: string) => {
  const match = text.match(/^.{0,60}?\d{4}年\d{1,2}月\d{1,2}日/);
  return match ? text.slice(match[0].length).trim() : text;
};

function findEvidence(policy: Policy, keywords: string[]): string {
  // 条款优先：它们是抽取阶段筛过的"像条款"的句子，比截断摘要更具引用价值。
  const clauses = (policy.clauses ?? []).map((item) => item.text);
  const body = `${policy.excerpt || ''}${policy.summary || ''}`;
  const sentences = body
    .split(/[。；!?]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .concat(clauses)
    .filter((item) => item.length >= 14 && item.length <= 120 && !EVIDENCE_NOISE.test(item));
  const hit = sentences.find((sentence) => keywords.some((keyword) => sentence.includes(keyword)));
  return stripPreamble(hit ?? clauses[0] ?? sentences[0] ?? '');
}

const strengthOf = (weight: number): 1 | 2 | 3 => (weight >= 0.34 ? 3 : weight >= 0.2 ? 2 : 1);

export function buildMechanism(policy: Policy): MechanismChain[] {
  const polarity = detectPolarity(policy) as 1 | -1 | 0;
  const channels = policyChannels(policy)
    .slice()
    .sort((a, b) => b.weight - a.weight);
  const primary = channels.filter((item) => item.weight >= 0.18).slice(0, 2);
  const selected = primary.length > 0 ? primary : channels.slice(0, 1);
  const tools = pickTools(policy);

  return selected.map((channel) => {
    const path = CHANNEL_PATH[channel.id];
    const meta = CHANNEL_META[channel.id];
    const key = polarity === -1 ? 'down' : 'up';
    const direction = polarity;
    const strength = strengthOf(channel.weight);
    const directionLabel =
      polarity === 1 ? '扩张／支持' : polarity === -1 ? '收紧／约束' : '方向待定（原文未明确）';
    const evidence = findEvidence(policy, path.keywords);

    const links: MechanismLink[] = [
      {
        layer: 'tool',
        layerLabel: '政策工具',
        label: tools[0] ?? '政策工具',
        detail:
          tools.length > 1
            ? `配套工具：${tools.slice(1).join('；')}`
            : `发文主体：${policy.issuer}｜${policy.docType ?? '政策文件'}`,
        direction,
        strength,
      },
      {
        layer: 'variable',
        layerLabel: '中间变量',
        label: path.variable[key],
        detail: `主要传导渠道：${meta.name}`,
        direction,
        strength,
      },
      {
        layer: 'behavior',
        layerLabel: '主体行为',
        label: path.behavior[key],
        detail: `作用对象：${(policy.targets ?? []).slice(0, 3).join('、') || '待识别'}`,
        direction,
        strength,
      },
      {
        layer: 'outcome',
        layerLabel: '宏观结果',
        label: path.outcome[key],
        detail: `预计时滞 ${path.latency}`,
        direction,
        strength,
      },
    ];

    const summary = `以「${links[0].label}」为起点，作用于「${path.variable[key]}」，推动主体行为转向「${path.behavior[key]}」，最终体现为「${path.outcome[key]}」；方向判定为${directionLabel}，预计时滞 ${path.latency}。`;

    return {
      id: `${policy.id}-${channel.id}`,
      policyId: policy.id,
      channelId: channel.id,
      channelName: meta.name,
      polarity,
      directionLabel,
      latency: path.latency,
      links,
      evidence,
      summary,
      risks:
        polarity === 0
          ? ['原文以程序性、倡导性表述为主，方向不明确时不应计入受益或承压', path.risk]
          : [path.risk],
    };
  });
}

export function combineDirection(chains: MechanismChain[]): string {
  if (chains.length === 0) return '无可用的机制链';
  const up = chains.filter((chain) => chain.polarity === 1).length;
  const down = chains.filter((chain) => chain.polarity === -1).length;
  const neutral = chains.length - up - down;
  if (up > 0 && down === 0) return `主渠道以扩张为主（${up} 条扩张链${neutral > 0 ? `、${neutral} 条方向未定` : ''}）`;
  if (down > 0 && up === 0) return `主渠道以约束为主（${down} 条收紧链${neutral > 0 ? `、${neutral} 条方向未定` : ''}）`;
  if (up > 0 && down > 0) return '同一政策在不同渠道上方向相反，需按渠道分别判断';
  return '方向未定，只能作为背景信息使用';
}
