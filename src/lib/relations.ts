// 政策相互关系：同一时间窗内的政策不是并列清单，而是会互相强化、承接或抵消的组合。
// 这里用"同发文机关／同渠道／时间邻近／方向相反"四类可核查线索推导关系，并明确标注这是推断。
import type { Policy } from '../types';
import { CHANNEL_META, detectPolarity, policyChannels, type ChannelId } from './province';
import type { RankedPolicy } from './priority';

export type RelationKind = 'support' | 'sequence' | 'complement' | 'tension' | 'overlap';

export interface RelationEdge {
  id: string;
  from: string;
  to: string;
  kind: RelationKind;
  strength: number;
  label: string;
  note: string;
}

export interface RelationNode {
  id: string;
  label: string;
  short: string;
  score: number;
  grade: string;
  date: string;
  issuer: string;
  theme: string;
  polarity: 1 | -1 | 0;
  channelIds: ChannelId[];
  topChannel: ChannelId;
}

export interface RelationCluster {
  id: string;
  label: string;
  policyIds: string[];
  direction: '扩张' | '收紧' | '混合';
  note: string;
  members: { id: string; short: string; grade: string; polarity: 1 | -1 | 0 }[];
}

export interface RelationStat {
  kind: RelationKind;
  label: string;
  color: string;
  count: number;
  share: number;
  desc: string;
}

export interface RelationResult {
  nodes: RelationNode[];
  edges: RelationEdge[];
  clusters: RelationCluster[];
  stats: RelationStat[];
  combination: {
    direction: string;
    expansive: number;
    restrictive: number;
    neutral: number;
    note: string;
  };
  narrative: string[];
  caveats: string[];
  // 用来交代"留了多少、滤了多少"，避免读者以为本期只有这几组关系。
  coverage: { nodes: number; pairs: number; kept: number; dropped: number };
}

export const RELATION_META: Record<RelationKind, { label: string; color: string; dash: string; desc: string }> = {
  support: { label: '配套协同', color: '#244f44', dash: '0', desc: '同发文机关、时间相邻，多为"主文件 + 落实通知"关系' },
  sequence: { label: '时序承接', color: '#355e7c', dash: '0', desc: '同主题先后发布，后一份承接或加码前一份' },
  complement: { label: '工具互补', color: '#9b6b18', dash: '6 4', desc: '财政与货币、需求与供给工具互相补位，合力大于单项' },
  tension: { label: '目标张力', color: '#a45f3d', dash: '2 3', desc: '方向相反或目标互斥，效果相互抵消' },
  overlap: { label: '主题重叠', color: '#70756d', dash: '4 4', desc: '作用于同一渠道，需防止重复发力或统计叠加' },
};

const DAY = 86400000;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const daysBetween = (a: string, b: string) => {
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (Number.isNaN(timeA) || Number.isNaN(timeB)) return 999;
  return Math.round(Math.abs(timeA - timeB) / DAY);
};

const channelName = (id: ChannelId) => CHANNEL_META[id]?.name ?? id;

function shortLabel(policy: Policy): string {
  const text = policy.shortTitle || policy.title;
  return text.length > 8 ? `${text.slice(0, 7)}…` : text;
}

export function buildRelations(items: RankedPolicy[]): RelationResult {
  const scoped = items.slice(0, 9);

  const nodes: RelationNode[] = scoped.map(({ policy, assessment }) => {
    const channels = policyChannels(policy).sort((a, b) => b.weight - a.weight);
    const topChannel = (channels[0]?.id ?? 'fiscal') as ChannelId;
    return {
      id: policy.id,
      label: policy.shortTitle || policy.title,
      short: shortLabel(policy),
      score: assessment.score,
      grade: assessment.grade,
      date: policy.date,
      issuer: policy.issuer,
      theme: policy.theme,
      polarity: detectPolarity(policy) as 1 | -1 | 0,
      channelIds: channels.map((item) => item.id as ChannelId),
      topChannel,
    };
  });

  const edges: RelationEdge[] = [];
  let pairs = 0;

  for (let i = 0; i < scoped.length; i += 1) {
    for (let j = i + 1; j < scoped.length; j += 1) {
      pairs += 1;
      const a = scoped[i];
      const b = scoped[j];
      const nodeA = nodes[i];
      const nodeB = nodes[j];
      const shared = nodeA.channelIds
        .filter((id) => nodeB.channelIds.includes(id))
        .sort(
          (x, y) =>
            nodeA.channelIds.indexOf(x) + nodeB.channelIds.indexOf(x) -
            (nodeA.channelIds.indexOf(y) + nodeB.channelIds.indexOf(y)),
        );
      const gap = daysBetween(a.policy.date, b.policy.date);
      const sameIssuer = a.policy.issuer === b.policy.issuer;

      const candidates: { kind: RelationKind; strength: number; note: string }[] = [];

      // 只有"主渠道相同、方向相反"才算目标张力，避免不同渠道的政策被误判成互相抵消。
      if (
        nodeA.polarity !== 0 &&
        nodeB.polarity !== 0 &&
        nodeA.polarity !== nodeB.polarity &&
        nodeA.topChannel === nodeB.topChannel
      ) {
        candidates.push({
          kind: 'tension',
          strength: clamp01(0.6 + shared.length * 0.1),
          note: `两条政策主渠道都是「${channelName(nodeA.topChannel)}」但方向相反，效果会部分抵消`,
        });
      }

      // 工具互补看主渠道互补（财政/转移支付 × 信贷），而不是看工具类型集合有没有交集。
      const fiscalSide = (id: ChannelId) => id === 'fiscal' || id === 'transfer';
      const fiscalMonetary =
        (fiscalSide(nodeA.topChannel) && nodeB.topChannel === 'credit') ||
        (fiscalSide(nodeB.topChannel) && nodeA.topChannel === 'credit');
      if (fiscalMonetary) {
        candidates.push({
          kind: 'complement',
          strength: clamp01(0.72 + (gap <= 90 ? 0.12 : 0)),
          note: '财政负责需求与项目，货币负责成本与流动性，两者叠加才有合力',
        });
      }

      // 同一机关发文不等于配套：还要求作用于同一渠道且时间足够近，否则财政部每月十几份文件会互相"配套"。
      if (sameIssuer && gap <= 45 && shared.length >= 1) {
        candidates.push({
          kind: 'support',
          strength: clamp01(0.48 + (gap <= 20 ? 0.16 : 0)),
          note: `同由${a.policy.issuer}发布、间隔 ${gap} 天且同作用于「${channelName(shared[0])}」，多为配套落实关系`,
        });
      }

      if (nodeA.topChannel === nodeB.topChannel && gap > 25 && gap <= 365) {
        const older = String(a.policy.date) <= String(b.policy.date) ? a.policy : b.policy;
        const newer = older.id === a.policy.id ? b.policy : a.policy;
        candidates.push({
          kind: 'sequence',
          strength: clamp01(0.48 + (shared.length >= 2 ? 0.14 : 0)),
          note: `《${shortLabel(older)}》在前，《${shortLabel(newer)}》在后，构成同主题的承接与加码`,
        });
      }

      if (shared.length >= 2 && gap <= 120) {
        candidates.push({
          kind: 'overlap',
          strength: clamp01(0.32 + shared.length * 0.07),
          note: `同时作用于「${shared.slice(0, 2).map(channelName).join('」「')}」，评估时需避免重复计算`,
        });
      }

      if (candidates.length === 0) continue;
      candidates.sort((x, y) => y.strength - x.strength);
      const best = candidates[0];
      const extra = candidates.length > 1 ? `（另有${RELATION_META[candidates[1].kind].label}关系）` : '';
      edges.push({
        id: `${nodeA.id}__${nodeB.id}__${best.kind}`,
        from: nodeA.id,
        to: nodeB.id,
        kind: best.kind,
        strength: best.strength,
        label: RELATION_META[best.kind].label,
        note: `${best.note}${extra}`,
      });
    }
  }

  edges.sort((x, y) => y.strength - x.strength);
  const kept = edges.slice(0, 14);

  // 按主渠道聚类，用来解释"这期政策实际上在打哪几条线"
  const clusterMap = new Map<ChannelId, string[]>();
  for (const node of nodes) {
    const list = clusterMap.get(node.topChannel) ?? [];
    list.push(node.id);
    clusterMap.set(node.topChannel, list);
  }
  const clusters: RelationCluster[] = [...clusterMap.entries()]
    .map(([id, policyIds]) => {
      const ups = policyIds.filter((pid) => nodes.find((node) => node.id === pid)?.polarity === 1).length;
      const downs = policyIds.filter((pid) => nodes.find((node) => node.id === pid)?.polarity === -1).length;
      const members = policyIds
        .map((pid) => nodes.find((node) => node.id === pid))
        .filter((node): node is RelationNode => Boolean(node))
        .sort((x, y) => y.score - x.score)
        .map((node) => ({ id: node.id, short: node.short, grade: node.grade, polarity: node.polarity }));
      return {
        id,
        label: channelName(id),
        policyIds,
        direction: (ups > 0 && downs > 0 ? '混合' : downs > 0 ? '收紧' : '扩张') as RelationCluster['direction'],
        note: `${policyIds.length} 项政策主要作用于该渠道`,
        members,
      };
    })
    .sort((a, b) => b.policyIds.length - a.policyIds.length);

  const expansive = nodes.filter((node) => node.polarity === 1).length;
  const restrictive = nodes.filter((node) => node.polarity === -1).length;
  const neutral = nodes.length - expansive - restrictive;
  const direction =
    expansive > restrictive * 1.5
      ? '偏扩张'
      : restrictive > expansive * 1.5
        ? '偏收紧'
        : expansive === 0 && restrictive === 0
          ? '方向不明'
          : '结构性混合';
  const note =
    direction === '偏扩张'
      ? '本组政策以支持、扩围、增加投入为主，合力方向为扩张，但需注意落地节奏。'
      : direction === '偏收紧'
        ? '本组政策以规范、约束、压降为主，合力方向偏紧，需关注承压主体。'
        : '本组政策在不同渠道上方向不一致，不能用一个"宽松/收紧"标签概括。';

  const supportCount = kept.filter((edge) => edge.kind === 'support').length;
  const complementCount = kept.filter((edge) => edge.kind === 'complement').length;
  const tensionEdges = kept.filter((edge) => edge.kind === 'tension');
  const sequenceCount = kept.filter((edge) => edge.kind === 'sequence').length;

  const narrative: string[] = [];
  narrative.push(
    `本期参与研判的 ${nodes.length} 项政策中，${expansive} 项偏扩张、${restrictive} 项偏收紧、${neutral} 项方向未定，整体组合${direction}。`,
  );
  if (clusters.length > 0) {
    narrative.push(
      `发力集中在「${clusters
        .slice(0, 3)
        .map((cluster) => cluster.label)
        .join('」「')}」${clusters.length > 3 ? ' 等渠道' : '渠道'}，其中「${clusters[0].label}」聚集了 ${clusters[0].policyIds.length} 项政策。`,
    );
  }
  const relationParts = [
    complementCount > 0 ? `${complementCount} 组工具互补` : '',
    supportCount > 0 ? `${supportCount} 组配套协同` : '',
    sequenceCount > 0 ? `${sequenceCount} 组时序承接` : '',
  ].filter(Boolean);
  if (relationParts.length > 0) {
    narrative.push(
      `共识别出${relationParts.join('、')}。政策之间存在合力，单看任一文件将低估整体力度。`,
    );
  }
  if (tensionEdges.length > 0) {
    const names = tensionEdges.slice(0, 2).map((edge) => {
      const from = nodes.find((node) => node.id === edge.from);
      const to = nodes.find((node) => node.id === edge.to);
      return `《${from?.label ?? ''}》与《${to?.label ?? ''}》`;
    });
    narrative.push(`${names.join('、')}存在目标张力，前者形成的扩张会被后者部分抵消，净效应需要用渠道权重再算一次。`);
  }
  const covered = new Set(nodes.map((node) => node.topChannel));
  const missing = (Object.keys(CHANNEL_META) as ChannelId[]).filter((id) => !covered.has(id));
  if (missing.length > 0) {
    narrative.push(
      `本期无以「${missing.slice(0, 3).map(channelName).join('」「')}」为主渠道的政策文件。上述渠道如有政策动作，应来自本期未采集的文件。`,
    );
  }

  const stats: RelationStat[] = (Object.keys(RELATION_META) as RelationKind[])
    .map((kind) => {
      const count = kept.filter((edge) => edge.kind === kind).length;
      return {
        kind,
        label: RELATION_META[kind].label,
        color: RELATION_META[kind].color,
        count,
        share: kept.length > 0 ? count / kept.length : 0,
        desc: RELATION_META[kind].desc,
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    nodes,
    edges: kept,
    clusters,
    stats,
    combination: { direction, expansive, restrictive, neutral, note },
    narrative,
    caveats: [
      '关系由文本主题、发文机关、时间距离与政策方向自动推导，不等于发文机关确认的配套关系。',
      '同一政策可同时存在多类关系，图中只显示强度最高的一类。',
      '关系强度是相对排序指标（0—1），不是相关系数。',
    ],
    coverage: { nodes: nodes.length, pairs, kept: kept.length, dropped: edges.length - kept.length },
  };
}
