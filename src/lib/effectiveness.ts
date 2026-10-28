// 政策可执行性指数（PEI）：衡量一份政策"具不具备被执行的条件"。
//
// ⚠️ 口径必须写死：这里测的是文本完备度，不是实施效果。
// 政策有没有真的起作用，需要接统计指标做目标—实绩偏差，本模块不承担这一部分。
import type { Policy } from '../types';

export type EffectivenessId = 'target' | 'owner' | 'funding' | 'deadline' | 'checkup';

export interface EffectivenessItem {
  id: EffectivenessId;
  label: string;
  score: number;
  max: number;
  detail: string;
  // 该项失分的具体原因，直接展示给读者，避免只给一个分数
  gap: string | null;
}

export interface EffectivenessResult {
  policyId: string;
  short: string;
  pei: number;
  grade: '高' | '中' | '低';
  items: EffectivenessItem[];
  gaps: string[];
}

export const MAX_PER_ITEM = 20;

// 泛称不能算"责任到人"：只写"各地区""有关部门"时，无法判断由谁负责、向谁追责。
// 注意"各省、自治区、直辖市财政厅（局）"这类是具体指向（点名了系统），不算泛称。
const PURE_GENERIC =
  /^(各?(省|自治区|直辖市)(、|，|和)?)+(人民政府|政府|各?级人民政府)?$|^(各部门|各有关部门|有关部门|相关部门|各有关单位|有关单位|有关方面|各有关方面|各地区|各地|地方各级人民政府|国务院各部门|各级政府|各级人民政府|各省级人民政府|省级人民政府)$/;
const OWNER_TAIL =
  /(部门|单位|机关|机构|政府|管委会|办公室|总局|中心|协会|公司|银行|委员会|厅|局|委|部|署|办|院|行)$/;
const OWNER_NOISE = /(应当|根据|会同|负责|按照|进行|纳入|作为|提交|复核|以及|进一步|具体|并|由)/;

const MONEY_OR_SOURCE =
  /(\d[\d,.]*\s*(?:万亿|亿|万|千)?\s*元)|中央财政|地方财政|预算内|专项债|特别国债|财政资金|专项资金|补助|贴息|基金出资/;

const NUMERIC_TARGET = /(\d|不低于|不超过|以上|左右|超过|翻番|倍增|达到)/;

// 有没有设定"谁来盯着、怎么算达成"——没有考核环节的政策，事后无法判断有没有效
const CHECK_MECHANISM = /(监测|评估|考核|督查|检查|通报|调度|绩效|跟踪问效|第三方)/;

const EFFECTIVE_TEXT =
  /自(?:印发|发布|公布|本(?:通知|意见|办法|规定))?之日起(?:施行|实施|执行)|自\s*\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日起(?:施行|实施|执行)/;

/** 政策正文的合并文本，用于在字段缺失时回原文找线索 */
function bodyText(policy: Policy): string {
  return [
    policy.title,
    policy.summary ?? '',
    policy.excerpt ?? '',
    ...(policy.clauses ?? []).map((item) => item.text),
    policy.fullText ?? '',
  ].join('｜');
}

function scoreTarget(policy: Policy): EffectivenessItem {
  const targets = policy.quantTargets ?? [];
  const withYear = targets.filter((item) => item.year);
  const numeric = withYear.find((item) => NUMERIC_TARGET.test(item.text));
  const base = { id: 'target' as const, label: '目标可测', max: MAX_PER_ITEM };
  if (numeric) {
    return { ...base, score: MAX_PER_ITEM, detail: `写明时间与数值：${numeric.text.slice(0, 40)}`, gap: null };
  }
  if (withYear.length > 0) {
    return {
      ...base,
      score: 13,
      detail: `有 ${withYear.length} 处带年份的目标表述，但没有可核对的数值`,
      gap: '目标只有方向没有刻度，事后无法判断是否达成',
    };
  }
  if (targets.length > 0) {
    return { ...base, score: 9, detail: '有目标表述但未标明时间', gap: '未写完成时点，目标无法按期考核' };
  }
  if ((policy.goals ?? []).length > 0 || (policy.obligations ?? []).some((item) => item.kind === '目标')) {
    return {
      ...base,
      score: 6,
      detail: '只有定性目标（如"提升""完善"），未给指标',
      gap: '通篇为定性表述，缺可考核指标',
    };
  }
  return { ...base, score: 0, detail: '未提出可识别的目标', gap: '未提出目标' };
}

function scoreOwner(policy: Policy): EffectivenessItem {
  const list = policy.implementers ?? [];
  const base = { id: 'owner' as const, label: '责任可归属', max: MAX_PER_ITEM };
  const specific = list.filter((item) => {
    const text = item.trim();
    if (text.length < 4 || text.length > 22) return false;
    if (PURE_GENERIC.test(text)) return false;
    if (OWNER_NOISE.test(text)) return false;
    return OWNER_TAIL.test(text);
  });
  if (specific.length > 0) {
    return {
      ...base,
      score: MAX_PER_ITEM,
      detail: `落到具体机关：${specific.slice(0, 2).join('、')}`,
      gap: null,
    };
  }
  if (list.length > 0) {
    return {
      ...base,
      score: 8,
      detail: `出现 ${list.length} 处责任表述，但均为泛称或残句`,
      gap: '责任只写到"有关部门""各地区"，没有落到可追责的机关',
    };
  }
  return { ...base, score: 0, detail: '未写明由谁执行', gap: '未写明执行主体' };
}

function scoreFunding(policy: Policy): EffectivenessItem {
  const list = policy.funding ?? [];
  const base = { id: 'funding' as const, label: '资源有保障', max: MAX_PER_ITEM };
  const sourced = list.filter((item) => MONEY_OR_SOURCE.test(item));
  if (sourced.length > 0) {
    return {
      ...base,
      score: MAX_PER_ITEM,
      detail: `写明资金来源或规模：${sourced[0].slice(0, 40)}`,
      gap: null,
    };
  }
  if (list.length > 0) {
    return {
      ...base,
      score: 8,
      detail: '提到经费事项，但未给金额、比例或资金渠道',
      gap: '只提"经费"不提钱从哪来、给多少',
    };
  }
  return {
    ...base,
    score: 0,
    detail: '未涉及资金安排',
    gap: '未说明资金安排；若依赖地方配套，落地取决于地方财力',
  };
}

function scoreDeadline(policy: Policy): EffectivenessItem {
  const base = { id: 'deadline' as const, label: '时限明确', max: MAX_PER_ITEM };
  if (policy.validUntil) {
    return { ...base, score: MAX_PER_ITEM, detail: `写明有效期至 ${policy.validUntil}`, gap: null };
  }
  if (policy.effectiveDate) {
    return { ...base, score: MAX_PER_ITEM, detail: `写明确切施行日期 ${policy.effectiveDate}`, gap: null };
  }
  // 字段没抽到不代表原文没写："自发布之日起施行"这类表述极常见，需回原文确认
  const text = bodyText(policy);
  const sentence = EFFECTIVE_TEXT.exec(text);
  if (sentence) {
    return {
      ...base,
      score: 14,
      detail: `原文写有"${sentence[0].slice(0, 24)}"，但未抽到确切日期字段`,
      gap: null,
    };
  }
  if ((policy.timeline ?? []).length > 0) {
    const first = policy.timeline![0];
    return {
      ...base,
      score: 12,
      detail: `有阶段性时点（如 ${first.year}）但无确切施行日`,
      gap: '缺施行日期，条款何时生效存在解释空间',
    };
  }
  return { ...base, score: 0, detail: '未写明施行时间', gap: '未写施行时间' };
}

// 第五项原本想用"传导链四段齐全"，实测每份文件都能生成四段模板链，九条渠道全部满分，没有区分度，
// 等于白占 20 分。改为"有没有设定监测、评估、考核环节"——这才是事后能否判断政策有效的前提。
function scoreCheckup(policy: Policy): EffectivenessItem {
  const base = { id: 'checkup' as const, label: '可考核', max: MAX_PER_ITEM };
  const text = bodyText(policy);
  const hit = CHECK_MECHANISM.exec(text);
  if (!hit) {
    return {
      ...base,
      score: 0,
      detail: '全文未见监测、评估、考核或督查安排',
      gap: '没有考核环节，政策到期后无法判断是否达成',
    };
  }
  // 只有一句"加强督促检查"是套话，要求至少两类机制词才给满分
  const kinds = new Set((text.match(new RegExp(CHECK_MECHANISM.source, 'g')) ?? []).map((item) => item));
  if (kinds.size >= 2) {
    return {
      ...base,
      score: MAX_PER_ITEM,
      detail: `设有多类考核安排（${[...kinds].slice(0, 3).join('、')}）`,
      gap: null,
    };
  }
  return {
    ...base,
    score: 12,
    detail: `仅提到"${hit[0]}"，未见配套的指标或追责安排`,
    gap: '考核只有提法没有指标，难以据以判断成效',
  };
}

const gradeOf = (score: number): '高' | '中' | '低' => (score >= 70 ? '高' : score >= 45 ? '中' : '低');

export function assessEffectiveness(policy: Policy): EffectivenessResult {
  const items = [
    scoreTarget(policy),
    scoreOwner(policy),
    scoreFunding(policy),
    scoreDeadline(policy),
    scoreCheckup(policy),
  ];
  const pei = items.reduce((sum, item) => sum + item.score, 0);
  return {
    policyId: policy.id,
    short: policy.shortTitle || policy.title,
    pei,
    grade: gradeOf(pei),
    items,
    gaps: items.map((item) => item.gap).filter((gap): gap is string => Boolean(gap)),
  };
}

/** 渠道层面的可执行性：按渠道内政策取均值，并给出每个分项的达标率。 */
export interface ChannelEffectiveness {
  pei: number;
  policyCount: number;
  items: { id: EffectivenessId; label: string; score: number; rate: number; note: string }[];
  weakestItem: { id: EffectivenessId; label: string; rate: number } | null;
}

export function aggregateEffectiveness(list: EffectivenessResult[]): ChannelEffectiveness {
  if (list.length === 0) {
    return { pei: 0, policyCount: 0, items: [], weakestItem: null };
  }
  const ids: EffectivenessId[] = ['target', 'owner', 'funding', 'deadline', 'checkup'];
  const items = ids.map((id) => {
    const values = list.map((result) => result.items.find((item) => item.id === id));
    const total = values.reduce((sum, item) => sum + (item?.score ?? 0), 0);
    const full = values.filter((item) => (item?.score ?? 0) >= MAX_PER_ITEM).length;
    const label = values[0]?.label ?? id;
    return {
      id,
      label,
      score: Math.round(total / list.length),
      rate: Math.round((full / list.length) * 100),
      note: `${full}/${list.length} 项达标`,
    };
  });
  const rated = [...items].sort((a, b) => a.rate - b.rate);
  return {
    // 渠道得分取五项均分之和，保证页面上"五项加起来等于总分"，不出现对不上的零头
    pei: items.reduce((sum, item) => sum + item.score, 0),
    policyCount: list.length,
    items,
    weakestItem: rated[0] ? { id: rated[0].id, label: rated[0].label, rate: rated[0].rate } : null,
  };
}
