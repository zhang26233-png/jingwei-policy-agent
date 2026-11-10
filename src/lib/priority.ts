// 政策优先级评分：把"哪条政策更值得先看"拆成 7 个可复核的维度。
// 这里的权重是研判口径，不是统计估计；每一项都必须能说清"为什么给这个分"。
import type { Policy } from '../types';

export type PriorityDimensionId =
  | 'authority'
  | 'recency'
  | 'intensity'
  | 'coverage'
  | 'binding'
  | 'signal'
  | 'novelty';

export interface PriorityDimension {
  id: PriorityDimensionId;
  label: string;
  weight: number;
  score: number;
  detail: string;
}

export interface PriorityAssessment {
  policyId: string;
  score: number;
  grade: 'S' | 'A' | 'B' | 'C';
  dimensions: PriorityDimension[];
  reasons: string[];
  weaknesses: string[];
  horizon: string;
}

export interface RankedPolicy {
  policy: Policy;
  assessment: PriorityAssessment;
}

export interface PriorityBoard {
  ranked: RankedPolicy[];
  windowDays: number;
  referenceDate: string;
  generatedAt: string;
  scanned: number;
  dropped: number;
  notes: string[];
}

const DAY = 86400000;

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const DIMENSION_META: { id: PriorityDimensionId; label: string; weight: number }[] = [
  { id: 'authority', label: '发文层级', weight: 0.22 },
  { id: 'recency', label: '时效性', weight: 0.18 },
  { id: 'intensity', label: '力度强度', weight: 0.18 },
  { id: 'coverage', label: '覆盖广度', weight: 0.13 },
  { id: 'binding', label: '约束强度', weight: 0.12 },
  { id: 'signal', label: '政策信号', weight: 0.12 },
  { id: 'novelty', label: '新增信息', weight: 0.05 },
];

const CENTRAL = /(中共中央|国务院办公厅|国务院|中央办公厅|中办|国办|中央经济工作会议|中央政治局)/;
const MINISTRY = /(财政部|中国人民银行|人民银行|国家发展改革委|发展改革委|商务部|工业和信息化部|人力资源社会保障部|住房和城乡建设部|国家税务总局|金融监管总局|证监会|国家统计局|海关总署)/;

const SIGNAL_TOPICS: { label: string; re: RegExp; weight: number }[] = [
  { label: '降准降息等总量工具', re: /(降准|降息|逆回购|中期借贷便利|MLF|再贷款|再贴现|下调.{0,6}利率)/, weight: 90 },
  { label: '以旧换新与消费补贴', re: /(以旧换新|消费补贴|服务消费|消费券|提振消费)/, weight: 88 },
  { label: '专项债与政府投资', re: /(专项债|特别国债|政府投资|超长期|两重|两新)/, weight: 86 },
  { label: '房地产与土地', re: /(房地产|住房|收储|房贷|城中村|保交房|保障性住房)/, weight: 85 },
  { label: '育儿与生育支持', re: /(育儿补贴|生育|托育|产假)/, weight: 82 },
  { label: '化债与地方财力', re: /(隐性债务|化债|置换|转移支付|清欠|三保)/, weight: 80 },
  { label: '设备更新与技改', re: /(设备更新|技术改造|贴息|智能制造|更新改造)/, weight: 78 },
  { label: '民营经济与公平竞争', re: /(民营经济|中小企业|个体工商户|公平竞争|市场准入)/, weight: 76 },
  { label: '就业与社保', re: /(就业|失业保险|社保|稳岗|扩岗)/, weight: 74 },
  { label: '新质生产力与人工智能', re: /(新质生产力|人工智能|未来产业|低空经济|算力)/, weight: 72 },
];

const HARD_PATTERN = /(不得|严禁|禁止|一律|问责|考核|限期|逾期|处罚|吊销|强制执行|纳入.{0,8}考核|自\d{4}年.{0,12}起|于\d{4}年.{0,12}前)/g;
const NEW_PATTERN = /(首次|新设|新增|新推出|扩大到|提高至|扩展至|试点|启动实施|全面推开)/;

const DAY_LABEL = (days: number) => (days <= 0 ? '发布当日' : `${days} 天前`);

function formatAmount(value: number): string {
  if (value <= 0) return '';
  if (value >= 10000) return `${(value / 10000).toFixed(2)} 万亿元`;
  if (value < 0.1) return `${Math.round(value * 10000)} 万元`;
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} 亿元`;
}

function authorityScore(policy: Policy): { score: number; detail: string } {
  const label = `${policy.issuer}${policy.title}`;
  const docType = policy.docType ?? '政策文件';

  if (CENTRAL.test(label)) {
    return { score: 100, detail: '党中央／国务院层级发布，具备全局定调能力' };
  }
  if (docType === '政策文件' && MINISTRY.test(policy.issuer)) {
    const hard = /(通知|办法|规定|决定|意见|方案|公告)/.test(policy.title) ? 88 : 84;
    return { score: hard, detail: `${policy.issuer}规范性文件，属部委执行层` };
  }
  if (docType === '政策文件') {
    return { score: 76, detail: '部委政策文件，需与配套细则一并阅读' };
  }
  if (docType === '发布实录') {
    return { score: 48, detail: '发布会实录，只承担信号与解释功能，不产生新义务' };
  }
  if (docType === '数据发布') {
    return { score: 44, detail: '数据发布，用于校准对政策力度的判断' };
  }
  return { score: 32, detail: '工作动态，属于过程信息' };
}

function recencyScore(policy: Policy, referenceMs: number): { score: number; detail: string; days: number } {
  const time = Date.parse(policy.date);
  if (Number.isNaN(time)) return { score: 30, detail: '发布日期缺失，按时效中性处理', days: 999 };
  const days = Math.max(0, Math.round((referenceMs - time) / DAY));
  // 半衰期 60 天：本期重点是"近期"，但两个月前的文件仍应保留可观权重。
  const score = clamp(100 * Math.exp((-Math.LN2 * days) / 60), 6, 100);
  return { score, detail: `发布于 ${DAY_LABEL(days)}`, days };
}

function intensityScore(policy: Policy): { score: number; detail: string } {
  const numbers = policy.numbers ?? [];
  const instruments = (policy.instruments ?? []).filter((item) => item.length >= 4 && item.length <= 42);
  const instScore = clamp((instruments.length / 5) * 100);

  // 金额统一折算到"亿元"再取对数：亿元级看量级，万元级只在小额文件里才有意义。
  const yi = numbers.filter((item) => item.unit === '亿元' && item.value >= 0.5).map((item) => item.value);
  const wan = numbers.filter((item) => item.unit === '万元').map((item) => item.value / 10000);
  const biggest = Math.max(0, ...yi, ...wan);
  const bigScore = biggest > 0 ? clamp((Math.log10(biggest) / 4) * 100) : 0;
  const ratios = numbers.filter(
    (item) => item.unit.includes('百分') || item.raw.includes('%') || item.raw.includes('个百分点'),
  ).length;
  const ratioScore = clamp(ratios * 30);
  const numScore = Math.max(bigScore, ratioScore);
  const hasNumber = biggest > 0 || ratios > 0;

  const score = hasNumber ? 0.58 * instScore + 0.42 * numScore : instScore * 0.62;
  const pieces: string[] = [];
  if (instruments.length > 0) pieces.push(`${instruments.length} 项可执行工具`);
  if (biggest > 0) pieces.push(`最大资金规模 ${formatAmount(biggest)}`);
  if (ratios > 0) pieces.push(`${ratios} 处比例型指标`);
  return {
    score: clamp(score),
    detail: pieces.length > 0 ? `识别到 ${pieces.join('、')}` : '未识别到可量化工具或金额',
  };
}

function coverageScore(policy: Policy): { score: number; detail: string } {
  const channelCount = policy.channels?.length ?? 0;
  const targetCount = policy.targets?.length ?? 0;
  const channelScore = clamp((channelCount / 5) * 100);
  const targetScore = clamp((targetCount / 4) * 100);
  const score = channelCount > 0 ? 0.6 * channelScore + 0.4 * targetScore : targetScore * 0.6;
  return {
    score: clamp(score),
    detail:
      channelCount > 0
        ? `覆盖 ${channelCount} 条传导渠道、${targetCount} 类作用对象`
        : `仅识别到 ${targetCount} 类作用对象，渠道待补`,
  };
}

function bindingScore(policy: Policy): { score: number; detail: string } {
  const text = `${policy.title}${policy.summary}${policy.excerpt ?? ''}${(policy.clauses ?? []).map((item) => item.text).join('')}`;
  const hits = Math.min(6, text.match(HARD_PATTERN)?.length ?? 0);
  const docType = policy.docType ?? '政策文件';
  const docBonus = /(通知|办法|规定|条例|决定|方案)/.test(policy.title)
    ? 18
    : /(意见)/.test(policy.title)
      ? 12
      : /(公告|批复|函|复函)/.test(policy.title)
        ? 6
        : 8;
  let score = clamp(24 + docBonus + hits * 10);
  if (docType === '发布实录' || docType === '工作动态') score = Math.min(score, 30);
  if (docType === '数据发布') score = Math.min(score, 26);
  return {
    score,
    detail: hits > 0 ? `含 ${hits} 处硬性约束表述（不得／时限／考核等）` : '以倡导性表述为主，硬约束较少',
  };
}

function signalScore(policy: Policy): { score: number; detail: string } {
  const text = `${policy.title}${policy.summary}${policy.excerpt ?? ''}${policy.tags.join('')}`;
  const matched = SIGNAL_TOPICS.filter((topic) => topic.re.test(text));
  if (matched.length === 0) return { score: 34, detail: '未命中高关注度政策主线' };
  const base = Math.max(...matched.map((topic) => topic.weight));
  const score = clamp(base + Math.max(0, matched.length - 1) * 4);
  return {
    score,
    detail: `命中${matched.map((topic) => topic.label).slice(0, 2).join('、')}主线`,
  };
}

function noveltyScore(policy: Policy, corpus: Policy[]): { score: number; detail: string } {
  const text = `${policy.title}${policy.summary}`;
  const fresh = NEW_PATTERN.test(text);
  const theme = policy.theme;
  const earlier = corpus.filter(
    (item) => item.id !== policy.id && item.theme === theme && String(item.date) < String(policy.date),
  );
  let score = 52;
  if (fresh) score += 26;
  if (earlier.length === 0) score += 16;
  const detail = fresh
    ? earlier.length === 0
      ? '含新增／首次类提法，且同主题下无更早文件'
      : '含新增／首次类提法，属同主题加码'
    : earlier.length === 0
      ? '同主题下首份文件，提供新信息'
      : `同主题已有 ${earlier.length} 份更早文件，边际信息量有限`;
  return { score: clamp(score), detail };
}

function gradeOf(score: number): PriorityAssessment['grade'] {
  if (score >= 76) return 'S';
  if (score >= 65) return 'A';
  if (score >= 53) return 'B';
  return 'C';
}

function horizonOf(policy: Policy): string {
  const text = `${policy.title}${(policy.instruments ?? []).join('')}`;
  const channels = new Set((policy.channels ?? []).map((item) => item.id));
  if (/(降准|降息|逆回购|公开市场|再贷款)/.test(text) || (channels.has('credit') && channels.size <= 2)) {
    return '即时—1 个季度';
  }
  if (channels.has('fiscal') || channels.has('transfer')) return '1—2 个季度';
  if (channels.has('industry') || channels.has('welfare') || channels.has('private')) return '2—4 个季度';
  return '1—2 个季度';
}

export function assessPolicy(policy: Policy, corpus: Policy[], referenceMs: number): PriorityAssessment {
  const authority = authorityScore(policy);
  const recency = recencyScore(policy, referenceMs);
  const intensity = intensityScore(policy);
  const coverage = coverageScore(policy);
  const binding = bindingScore(policy);
  const signal = signalScore(policy);
  const novelty = noveltyScore(policy, corpus);

  const raw: Record<PriorityDimensionId, { score: number; detail: string }> = {
    authority,
    recency: { score: recency.score, detail: recency.detail },
    intensity,
    coverage,
    binding,
    signal,
    novelty,
  };

  const dimensions: PriorityDimension[] = DIMENSION_META.map((meta) => ({
    id: meta.id,
    label: meta.label,
    weight: meta.weight,
    score: clamp(raw[meta.id].score),
    detail: raw[meta.id].detail,
  }));

  const score = clamp(dimensions.reduce((sum, item) => sum + item.score * item.weight, 0));

  const reasons = [...dimensions]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3)
    .map((item) => `${item.label}：${item.detail}`);

  const weaknesses: string[] = [];
  const docType = policy.docType ?? '政策文件';
  if (docType !== '政策文件') weaknesses.push(`${docType}不具直接约束力，只作信号与背景使用`);
  if (recency.days > 75) weaknesses.push(`距发布已 ${recency.days} 天，边际信息量下降`);
  if (coverage.score < 45) weaknesses.push('作用渠道较集中，外溢效应有限');
  if (binding.score < 40) weaknesses.push('以倡导性表述为主，落地强度取决于后续配套');
  if (intensity.score < 40) weaknesses.push('未识别到明确金额或量化力度指标');

  return {
    policyId: policy.id,
    score: Math.round(score * 10) / 10,
    grade: gradeOf(score),
    dimensions,
    reasons,
    weaknesses: weaknesses.slice(0, 2),
    horizon: horizonOf(policy),
  };
}

export interface RankOptions {
  windowDays?: number;
  limit?: number;
  includeBackground?: boolean;
  now?: number;
}

export function rankPolicies(policies: Policy[], options: RankOptions = {}): PriorityBoard {
  const windowDays = options.windowDays ?? 90;
  const limit = options.limit ?? 10;
  const referenceMs = options.now ?? Date.now();
  const since = referenceMs - windowDays * DAY;

  const scoped = policies.filter((policy) => {
    const time = Date.parse(policy.date);
    if (Number.isNaN(time)) return false;
    if (time < since) return false;
    if (!options.includeBackground && policy.docType && policy.docType !== '政策文件') return false;
    return true;
  });

  const pool = scoped.length > 0 ? scoped : policies;
  const assessed = pool.map((policy) => ({
    policy,
    assessment: assessPolicy(policy, pool, referenceMs),
  }));

  assessed.sort((a, b) => b.assessment.score - a.assessment.score || String(b.policy.date).localeCompare(String(a.policy.date)));

  const notes: string[] = [];
  if (scoped.length === 0) {
    notes.push(`近 ${windowDays} 天内无可用政策原件，已改按全部语料排序。`);
  }
  if (!options.includeBackground) {
    const excluded = policies.filter((policy) => {
      const time = Date.parse(policy.date);
      return !Number.isNaN(time) && time >= since && policy.docType && policy.docType !== '政策文件';
    }).length;
    if (excluded > 0) notes.push(`另有 ${excluded} 项发布实录／数据发布／工作动态未参与排序，可在政策库中查看。`);
  }
  notes.push('评分用于确定阅读顺序，不反映政策效果大小。效果判断应结合传导链与省级影响测算。');

  return {
    ranked: assessed.slice(0, limit),
    windowDays,
    referenceDate: new Date(referenceMs).toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    scanned: pool.length,
    dropped: Math.max(0, pool.length - limit),
    notes: notes.filter(Boolean),
  };
}
