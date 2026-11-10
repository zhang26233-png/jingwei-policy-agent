// 协同测度：把「一致性」与「可执行性」两个指数合到同一张四象限图上。
//
// 一个渠道落在哪个象限，比任何单项得分更有解释力：
// 方向一致但没抓手 = 齐声喊；各自能落地但互相抵消 = 各干各的。
import type { Policy } from '../types';
import { buildCoherence, type ChannelCoherence, type CoherenceResult } from './coherence';
import {
  MAX_PER_ITEM,
  aggregateEffectiveness,
  assessEffectiveness,
  type ChannelEffectiveness,
  type EffectivenessResult,
} from './effectiveness';

export type Quadrant = 'synergy' | 'single' | 'idle' | 'conflict';

// 象限名称只描述"位置"，不描述"好坏"：本期 PEI 普遍偏低，
// 若把相对靠前的渠道直接叫"协同有效"，读者会以为执行条件已经合格。
export const QUADRANT_META: Record<Quadrant, { label: string; desc: string; tone: 'good' | 'warn' | 'bad' }> = {
  synergy: { label: '双高协同', desc: '方向一致，执行条件在本期相对最完备', tone: 'good' },
  idle: { label: '一致但缺条件', desc: '方向一致，但目标刻度、责任主体、资金来源或考核方式不完备', tone: 'warn' },
  single: { label: '各自为战', desc: '单个文件具备落地条件，但同一渠道内方向相互抵消', tone: 'warn' },
  conflict: { label: '双向偏弱', desc: '方向不一致，执行条件亦不完备，落地难度最大', tone: 'bad' },
};

export interface ChannelSynergy {
  id: string;
  name: string;
  short: string;
  desc: string;
  policyCount: number;
  pci: number;
  pei: number;
  quadrant: Quadrant;
  coherence: ChannelCoherence;
  effectiveness: ChannelEffectiveness;
}

export interface SynergyResult {
  channels: ChannelSynergy[];
  overall: {
    pci: number;
    pei: number;
    quadrant: Quadrant;
    policyCount: number;
    channelCount: number;
    gradedPolicies: EffectivenessResult[];
  };
  // 四象限的分界线：取本期渠道分布的中位数，而不是拍一个固定值
  split: { pci: number; pei: number };
  // 样本构成：说明有多少条内置示例被排除，避免出现"页面上 65 份、体检页 57 份"的疑问
  sample: { total: number; excluded: number; seedOnly: boolean };
  narrative: string[];
  caveats: string[];
  method: { id: string; label: string; weight: number; how: string }[];
}

const median = (values: number[]) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]);
};

const quadrantOf = (pci: number, pei: number, split: { pci: number; pei: number }): Quadrant => {
  if (pci >= split.pci && pei >= split.pei) return 'synergy';
  if (pci >= split.pci) return 'idle';
  if (pei >= split.pei) return 'single';
  return 'conflict';
};

export function buildSynergy(policies: Policy[]): SynergyResult {
  // 只测自动采集的语料。内置示例条目（2025 年存量、手工录入）若混进来，
  // 一是把"本期"口径拉歪，二是样本数会与「质量体检」页（服务端只统计采集语料）对不上。
  const collected = policies.filter((policy) => policy.origin === 'auto');
  const sample = collected.length > 0 ? collected : policies;
  const excluded = policies.length - sample.length;

  const coherence: CoherenceResult = buildCoherence(sample);
  const byChannel = new Map(coherence.channels.map((channel) => [channel.id, channel]));

  // 逐份政策先算可执行性，再按渠道聚合；同一政策进入多渠道时各自计入
  const graded = new Map<string, EffectivenessResult>();
  for (const policy of sample) {
    if ((policy.docType ?? '政策文件') !== '政策文件') continue;
    graded.set(policy.id, assessEffectiveness(policy));
  }

  const base = coherence.channels.map((channel) => {
    const list = channel.members
      .map((member) => graded.get(member.id))
      .filter((item): item is EffectivenessResult => Boolean(item));
    const effectiveness = aggregateEffectiveness(list);
    return {
      id: channel.id,
      name: channel.name,
      short: channel.short,
      desc: channel.desc,
      policyCount: channel.policyCount,
      pci: channel.pci,
      pei: effectiveness.pei,
      effectiveness,
      coherence: byChannel.get(channel.id) ?? channel,
    };
  });

  // 分界线用中位数：固定切 55 分会让整批渠道全部落到下半区，四象限退化成两行
  const split = { pci: median(base.map((item) => item.pci)), pei: median(base.map((item) => item.pei)) };
  const channels: ChannelSynergy[] = base.map((item) => ({
    ...item,
    quadrant: quadrantOf(item.pci, item.pei, split),
  }));

  const totalPolicies = channels.reduce((sum, channel) => sum + channel.policyCount, 0);
  const pci =
    totalPolicies > 0
      ? Math.round(channels.reduce((sum, channel) => sum + channel.pci * channel.policyCount, 0) / totalPolicies)
      : 0;
  const allGraded = [...graded.values()];
  const pei =
    allGraded.length > 0
      ? Math.round(allGraded.reduce((sum, item) => sum + item.pei, 0) / allGraded.length)
      : 0;

  const counts: Record<Quadrant, number> = { synergy: 0, idle: 0, single: 0, conflict: 0 };
  for (const channel of channels) counts[channel.quadrant] += 1;

  const narrative: string[] = [];
  const lead = [...channels].sort((a, b) => b.policyCount - a.policyCount)[0];
  narrative.push(
    `本期 ${allGraded.length} 份政策文件的总体一致性指数为 ${pci} 分，可执行性指数为 ${pei} 分。` +
      `九条渠道中，${counts.synergy} 条属"${QUADRANT_META.synergy.label}"、${counts.idle} 条属"${QUADRANT_META.idle.label}"、` +
      `${counts.single} 条属"${QUADRANT_META.single.label}"、${counts.conflict} 条属"${QUADRANT_META.conflict.label}"。`,
  );
  if (lead) {
    narrative.push(
      `政策文本最集中的渠道为「${lead.name}」，共 ${lead.policyCount} 项，一致性 ${lead.pci} 分、可执行性 ${lead.pei} 分，属${
        QUADRANT_META[lead.quadrant].label
      }，即${QUADRANT_META[lead.quadrant].desc}。`,
    );
  }
  const weakestPei = [...allGraded].sort((a, b) => a.pei - b.pei)[0];
  if (weakestPei) {
    narrative.push(
      `执行条件缺口最大的是《${weakestPei.short}》，可执行性 ${weakestPei.pei} 分，主要缺口为${weakestPei.gaps.slice(0, 2).join('、') || '文本信息不足'}。`,
    );
  }
  const flipped = channels.filter((channel) => (channel.coherence.parts[1].score ?? 100) < 70);
  if (flipped.length > 0) {
    narrative.push(
      `「${flipped.map((item) => item.short).join('」「')}」在观察期内出现方向变化，属跨期不一致，其政策信号弱于同期取向一致的情形。`,
    );
  }

  // 五项里"资源有保障"几乎全渠道垫底，必须点明这是文件本身的写法而不是抽取漏了：
  // 对照体检页，资金来源的缺失里有 46 处是原文未写，只有 2 处疑似漏抽。
  const fundingFull = allGraded.filter(
    (item) => item.items.find((part) => part.id === 'funding')?.score === MAX_PER_ITEM,
  ).length;
  if (allGraded.length > 0 && fundingFull / allGraded.length <= 0.2) {
    narrative.push(
      `可执行性五项中，"资源有保障"为普遍短板：${allGraded.length} 份文件中仅 ${fundingFull} 份写明资金来源或规模。` +
        `此项缺失源于原文未作规定，中央文件通常不附带资金安排，落实依赖后续配套文件与地方财力。`,
    );
  }

  return {
    channels,
    overall: {
      pci,
      pei,
      quadrant: quadrantOf(pci, pei, split),
      policyCount: allGraded.length,
      channelCount: channels.length,
      gradedPolicies: allGraded,
    },
    split,
    sample: { total: sample.length, excluded, seedOnly: collected.length === 0 },
    narrative,
    caveats: [
      collected.length === 0
        ? '当前未获取自动采集语料，以下结果基于内置校订条目，仅用于查看功能，不作为分析结论。'
        : excluded > 0
          ? `测算样本为自动采集的 ${allGraded.length} 份政策文件（采集语料共 ${sample.length} 条，非政策类已剔除）；另有 ${excluded} 条内置校订条目（2025 年存量、手工录入）未计入，以避免与近三个月口径混用。`
          : `测算样本为自动采集的 ${allGraded.length} 份政策文件。`,
      '两个指数衡量政策文本的明确程度，不衡量政策实施后的实际效果；效果评估需另行接入统计数据。',
      '一致性判断依据关键词规则识别扩张与收紧表述，属编码判断。',
      '渠道归属按正文关键词密度判定，一份文件可同时进入多条渠道；个别文件因正文提及出口、口岸等词被归入外贸渠道，属已知误差。',
      '可执行性五项中有三项依赖抽取字段，字段覆盖不足将低估得分。',
      `四象限分界线取九条渠道的中位数（一致性 ${split.pci} 分、可执行性 ${split.pei} 分），表示相对位置，不设绝对门槛。`,
      '样本为近三个月中央文件，结论仅描述本期情况。',
    ],
    method: [
      ...coherence.method,
      {
        id: 'target',
        label: '目标可测',
        weight: 0.2,
        how: '有带年份且带数值的目标记满分；只有方向没有刻度记部分分；纯定性表述基本不得分。',
      },
      {
        id: 'owner',
        label: '责任可归属',
        weight: 0.2,
        how: '责任主体必须落到具体机关。"有关部门""各地区"一类泛称不计为明确责任。',
      },
      {
        id: 'funding',
        label: '资源有保障',
        weight: 0.2,
        how: '写明金额、比例或资金渠道记满分；只提"经费"而不写来源给部分分。',
      },
      {
        id: 'deadline',
        label: '时限明确',
        weight: 0.2,
        how: '有施行日期或有效期记满分；只有阶段性年份给部分分。',
      },
      {
        id: 'checkup',
        label: '可考核',
        weight: 0.2,
        how: '正文设有监测、评估、考核或督查安排记满分；只有一句"加强督促检查"这类套话给部分分。没有考核环节的政策，事后无法判断是否达成。',
      },
    ],
  };
}
