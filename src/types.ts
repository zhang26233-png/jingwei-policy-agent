export type InstrumentType = '财政' | '货币' | '消费' | '民生' | '法治' | '产业';
export type SourceLevel = '政策原文' | '官方发布' | '权威媒体';
export type ReaderMode = 'research' | 'decision' | 'public';
export type ViewName = 'briefing' | 'workspace' | 'library' | 'impact' | 'compare' | 'synergy' | 'audit' | 'transfer' | 'report' | 'method';

export interface PolicyClause {
  label: string;
  text: string;
}

export interface PolicyChannel {
  id: string;
  name: string;
  short: string;
  hits: number;
  density?: number;
  weight: number;
}

export interface PolicyNumber {
  raw: string;
  value: number;
  unit: string;
}

export interface PolicyObligation {
  kind: '目标' | '约束' | '禁止' | '激励' | '程序';
  items: string[];
}

export interface PolicyQuantTarget {
  text: string;
  year: string;
  value: string;
}

export interface PolicyScope {
  nationwide: boolean;
  provinces: string[];
}

export interface PolicyTimelineNode {
  year: string;
  text: string;
}

export interface PolicySection {
  label: string;
  title: string;
}

export interface Policy {
  id: string;
  shortTitle: string;
  title: string;
  docNo?: string;
  docType?: '政策文件' | '发布实录' | '数据发布' | '工作动态';
  issuer: string;
  date: string;
  effective: string;
  level: '中央';
  theme: string;
  instrumentTypes: InstrumentType[];
  instruments: string[];
  targets: string[];
  goals: string[];
  summary: string;
  excerpt: string;
  clauses: PolicyClause[];
  sourceName: string;
  sourceUrl: string;
  sourceLevel: SourceLevel;
  status: string;
  related: string[];
  tags: string[];
  caveat?: string;
  origin?: 'seed' | 'auto';
  channels?: PolicyChannel[];
  numbers?: PolicyNumber[];
  bodyLength?: number;
  collectedAt?: string;
  sourceId?: string;
  // 第二层抽取：把原文拆成可逐条阅读的结构
  effectiveDate?: string;
  validUntil?: string;
  obligations?: PolicyObligation[];
  quantTargets?: PolicyQuantTarget[];
  implementers?: string[];
  funding?: string[];
  timeline?: PolicyTimelineNode[];
  sections?: PolicySection[];
  scope?: PolicyScope;
  paragraphs?: string[];
  attachmentOnly?: boolean;
  bodySource?: 'page' | 'page+pdf';
  attachments?: PolicyAttachment[];
  fullText?: string;
}

/** 附件登记：role=main 表示判定为正文，annex 表示清单／名单类附表 */
export interface PolicyAttachment {
  name: string;
  url: string;
  ext: string;
  role: 'main' | 'annex' | 'other';
  ok: boolean;
  pages: number;
  chars: number;
  layout?: 'prose' | 'table' | null;
  reason?: string;
  error: string | null;
}

export interface EvidenceRef {
  policyId: string;
  clauseLabel?: string;
  note?: string;
}

export interface AnalysisSection {
  title: string;
  body: string;
  refs: EvidenceRef[];
  tone: 'fact' | 'observation' | 'inference';
}

export interface TransmissionNode {
  id: string;
  label: string;
  sub: string;
  column: number;
  refs: string[];
  note: string;
  uncertainty: string;
}

export interface TransmissionEdge {
  from: string;
  to: string;
  label: string;
}

export interface AnalysisResult {
  query: string;
  terms: string[];
  matched: Policy[];
  matchedCount?: number;
  focus: 'combined' | 'consumption' | 'monetary' | 'fiscal' | 'private';
  focusLabel: string;
  sections: AnalysisSection[];
  publicSummary: {
    oneLine: string;
    relevance: string;
    misconception: string;
  };
  decisionSummary: {
    mix: string;
    watch: string;
    risk: string;
  };
  nodes: TransmissionNode[];
  edges: TransmissionEdge[];
  trace: string[];
  coverageNote: string;
  warnings: string[];
  absent: boolean;
}

export interface IndicatorPoint {
  date: string;
  value: number;
  label?: string;
}

export interface IndicatorSeries {
  id: string;
  name: string;
  unit: string;
  note: string;
  source: string;
  points: IndicatorPoint[];
}

export interface ProvinceProfile {
  code: string;
  name: string;
  short: string;
  tags: string[];
  note: string;
}

export interface ChannelShare {
  id: string;
  name: string;
  short: string;
  weight: number;
  polarity: 1 | -1 | 0;
  policyCount: number;
}

export interface ProvinceChannelContribution {
  id: string;
  name: string;
  short: string;
  value: number;
}

export interface ProvinceScore {
  code: string;
  name: string;
  short: string;
  exposure: number;
  benefit: number;
  pressure: number;
  rank: number;
  tags: string[];
  note: string;
  contributions: ProvinceChannelContribution[];
  drivers: string[];
}

export interface ImpactResult {
  policyIds: string[];
  policies: { id: string; title: string; date: string; issuer: string }[];
  channels: ChannelShare[];
  provinces: ProvinceScore[];
  national: { mean: number; max: number; min: number; concentration: number };
  caveats: string[];
  generatedAt: string;
}
