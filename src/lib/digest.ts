// 政策摘要：把一份政策原文压成"能读、能核对、能引用"的摘要。
// 关键约束——摘要里的每一句话都由已抽取字段拼装，并标注依据字段；
// 字段抽不到就写"原文未写明"，绝不用通顺的话把它填平。这是本项目与"让大模型写一段摘要"的根本区别。
import type { Policy } from '../types';

export interface DigestSentence {
  label: string;
  text: string;
  basis: string;
}

export interface DigestFact {
  label: string;
  value: string;
  tone?: 'plain' | 'strong' | 'missing';
}

export interface DigestPoint {
  tag: '目标' | '约束' | '禁止' | '激励' | '程序' | '条款';
  text: string;
}

export interface PolicyDigest {
  id: string;
  headline: string;
  sentences: DigestSentence[];
  facts: DigestFact[];
  points: DigestPoint[];
  gaps: string[];
  coverage: number;
  plain: string;
}

const ISSUER_SHORT: [RegExp, string][] = [
  [/^(中共中央办公厅|中央办公厅)/, '中办'],
  [/^(国务院办公厅)/, '国办'],
  [/^(中共中央|国务院)(?=关于|办|令|《)/, '中央'],
  [/^(中华人民共和国)?财政部/, '财政部'],
  [/^(中华人民共和国)?国家税务总局/, '税务总局'],
  [/^国家发展和改革委员会|^国家发展改革委|^发展改革委/, '发改委'],
  [/^(中国人民银行|人民银行)/, '人民银行'],
  [/^国家统计局/, '统计局'],
  [/^国务院关税税则委员会/, '关税税则委'],
  [/^国家金融监督管理总局|^金融监管总局/, '金融监管总局'],
  [/^中国证券监督管理委员会|^证监会/, '证监会'],
  [/^商务部/, '商务部'],
  [/^工业和信息化部/, '工信部'],
  [/^人力资源社会保障部|^人力资源和社会保障部/, '人社部'],
  [/^住房和城乡建设部|^住房城乡建设部/, '住建部'],
  [/^国家市场监督管理总局|^市场监管总局/, '市场监管总局'],
  [/^国家能源局/, '能源局'],
  [/^海关总署/, '海关总署'],
];

export function shortIssuer(issuer: string): string {
  const text = (issuer || '').trim();
  for (const [re, name] of ISSUER_SHORT) {
    if (re.test(text)) return name;
  }
  // 兜底：去掉"中华人民共和国"前缀与"国家"前缀后截断，保留可识别部分。
  const cleaned = text.replace(/^中华人民共和国/, '').replace(/^国家/, '');
  return cleaned.length > 10 ? `${cleaned.slice(0, 10)}` : cleaned || '发文机关未标注';
}

const DOC_VERB: [RegExp, string][] = [
  [/(条例|办法|规定|规则|细则|决定)$/, '出台制度规范'],
  [/(意见)$/, '提出意见'],
  [/(通知)$/, '作出部署'],
  [/(公告)$/, '发布公告'],
  [/(批复|复函|函)$/, '作出批复'],
  [/(规划)$/, '发布规划'],
  [/(方案|计划)$/, '印发方案'],
  [/(清单|目录)$/, '公布清单'],
  [/(指引|指南)$/, '发布指引'],
  [/(报告)$/, '发布报告'],
];

const TYPE_TOOL_TEXT: Record<string, string> = {
  财政: '财政支出与补贴',
  货币: '信贷与利率工具',
  消费: '消费激励',
  民生: '民生保障支出',
  法治: '制度规范',
  产业: '产业支持与项目安排',
};

const formatAmount = (yi: number): string => {
  if (!Number.isFinite(yi) || yi <= 0) return '';
  if (yi >= 10000) return `${(yi / 10000).toFixed(2)} 万亿元`;
  if (yi < 0.1) return `${Math.round(yi * 10000)} 万元`;
  return `${yi >= 100 ? Math.round(yi) : yi.toFixed(1)} 亿元`;
};

const cnDate = (iso?: string): string => {
  if (!iso || iso.length < 10) return '';
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!year || !month || !day) return '';
  return `${year} 年 ${month} 月 ${day} 日`;
};

// 条款里常混入"请遵照执行""现印发给你们"这类程序套话，摘要里不该占位。
const FILLER = /^(现印发|现将|请遵照|请认真|请结合实际|特此|附件|各省|抄送|此复|妥否)/;
const trimSentence = (text: string, max = 108): string => {
  const clean = text.replace(/\s+/g, ' ').replace(/^[一二三四五六七八九十]+[、．.]/, '').trim();
  if (clean.length <= max) return clean;
  // 尽量在分句处截断，避免半句戛然而止。
  const cut = clean.slice(0, max);
  const lastComma = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('；'), cut.lastIndexOf('。'));
  return `${lastComma > max * 0.55 ? cut.slice(0, lastComma) : cut}…`;
};

// "安排的资金""贴息额度等要素"这类是被截断的短语，不是工具名，放进摘要会让主旨句读不通。
const TOOL_FRAGMENT = /(的(资金|项目|政策|措施|要素|要求|行为|活动)|等(要素|要求|事项)|^(的|等|及|有关|相关))/;

function toolsOf(policy: Policy): string[] {
  const raw = (policy.instruments ?? [])
    .map((item) => item.replace(/\s+/g, '').trim())
    .filter(
      (item) =>
        item.length >= 4 &&
        item.length <= 30 &&
        !FILLER.test(item) &&
        !TOOL_FRAGMENT.test(item),
    );
  if (raw.length > 0) return [...new Set(raw)].slice(0, 3);
  const mapped = (policy.instrumentTypes ?? []).map((type) => TYPE_TOOL_TEXT[type]).filter(Boolean);
  return mapped.length > 0 ? [...new Set(mapped)].slice(0, 2) : [];
}

// 目标句的优先顺序：量化目标 > 目标类条款里带数值/年份的句子 > 文件自己写的立文目的 > 明确承认没有。
// 注意 policy.goals 是主题标签（稳增长／稳就业之类），不是目标值，不能拿来当"目标为…"。
const GOAL_HINT = /(到\s*\d{4}\s*年|力争|达到|提高到|提升到|不低于|以上|左右|占比|翻番|控制在|压减到)/;
// 公文开头的"为……，现提出如下意见"是原文自己写的立文目的，可引用、可核对，
// 在绝大多数执行类文件里是唯一能拿到的"意图"表述。
const PURPOSE_HEAD = /^为(?:了)?[^。；]{6,110}/;
const PURPOSE_TAIL = /(?:，|,)?\s*(?:现|特此|现予|并)?(?:提出|制定|印发|下发|发布|建立|规范|加强|进一步|就)[^。；]{0,20}$/;

function purposeOf(policy: Policy): string {
  const pool = [...(policy.paragraphs ?? []).slice(0, 4), policy.summary ?? ''];
  for (const block of pool) {
    if (!block) continue;
    for (const raw of String(block).split(/[。；]/)) {
      const sentence = raw.replace(/\s+/g, '').trim();
      if (!PURPOSE_HEAD.test(sentence)) continue;
      if (sentence.length < 16 || sentence.length > 130) continue;
      // 砍掉尾巴上的"现提出如下意见"，只留"为……"这一段。
      const cut = sentence.replace(PURPOSE_TAIL, '').replace(/[，,]$/, '');
      const text = cut.length >= 16 ? cut : sentence;
      return text.length > 96 ? `${text.slice(0, 96)}…` : text;
    }
  }
  return '';
}

function aimOf(policy: Policy): { text: string; basis: string; kind: 'target' | 'purpose' | 'none' } {
  const quant = policy.quantTargets ?? [];
  if (quant.length > 0) {
    const first = quant[0];
    return {
      text: trimSentence(`提出「${first.text}」${first.year ? `（${first.year} 年）` : ''}`),
      basis: '第二层抽取·量化目标',
      kind: 'target',
    };
  }
  const goalItems = (policy.obligations ?? [])
    .filter((group) => group.kind === '目标')
    .flatMap((group) => group.items)
    .filter((item) => GOAL_HINT.test(item) && item.length >= 12 && item.length <= 96);
  if (goalItems.length > 0) {
    return {
      text: trimSentence(`提出「${goalItems[0]}」`),
      basis: '第二层抽取·目标类条款',
      kind: 'target',
    };
  }
  const purpose = purposeOf(policy);
  if (purpose) {
    return { text: `开篇写明立文目的「${purpose}」，但未给出可核对的量化目标`, basis: '原文首段·立文目的', kind: 'purpose' };
  }
  return {
    text: '原文未出现可核对的量化目标，也没有可引用的立文目的句（多为短公告或附件为主的文件）',
    basis: '字段为空',
    kind: 'none',
  };
}

function pointsOf(policy: Policy): DigestPoint[] {
  const out: DigestPoint[] = [];
  const seen = new Set<string>();
  const push = (tag: DigestPoint['tag'], text: string) => {
    const clean = trimSentence(text);
    if (clean.length < 12 || FILLER.test(clean)) return;
    // 标题行、"现就有关事项通知如下"、带序号的小标题都不是条款内容，进摘要只会占位。
    if (/[：:]$/.test(clean)) return;
    if (/^(现就|现将|有关事项|为.{0,16}(印发|制定|贯彻))/.test(clean)) return;
    if (/^[（(]?[一二三四五六七八九十\d]+[）)、.．]/.test(clean)) return;
    if (/(如下[:：]|通知如下|附件\d*|见附件)/.test(clean)) return;
    const key = clean.slice(0, 18);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ tag, text: clean });
  };

  for (const group of policy.obligations ?? []) {
    for (const item of group.items) push(group.kind, item);
  }
  if (out.length < 2) {
    for (const clause of policy.clauses ?? []) push('条款', clause.text);
  }
  // 量化目标也是要点，但排在条款后面，避免摘要一上来全是数字。
  for (const quant of (policy.quantTargets ?? []).slice(0, 2)) push('目标', quant.text);
  return out.slice(0, 6);
}

const maxAmountOf = (policy: Policy): string => {
  const amounts = (policy.numbers ?? [])
    .filter((item) => item.unit === '亿元')
    .map((item) => item.value)
    .filter((value) => value > 0);
  return amounts.length > 0 ? formatAmount(Math.max(...amounts)) : '';
};

function buildFacts(policy: Policy, tools: string[]): DigestFact[] {
  const facts: DigestFact[] = [];
  const add = (label: string, value: string, tone: DigestFact['tone'] = 'plain') => {
    facts.push({ label, value: value || '原文未写明', tone: value ? tone : 'missing' });
  };

  add('发文机关', shortIssuer(policy.issuer), 'strong');
  add('文号', policy.docNo ?? '');
  add('成文日期', cnDate(policy.date));
  add('施行日期', policy.effectiveDate ? cnDate(policy.effectiveDate) : '');
  add('文种', policy.docType ?? '政策文件');
  add('主题', policy.theme);
  add('主要工具', tools.join('、'));
  const topChannel = policy.channels?.[0]?.name ?? '';
  // 主渠道常与主题同字（都是"居民消费"），重复一格没有信息量。
  if (topChannel && topChannel !== policy.theme) add('主渠道', topChannel);
  const biggest = maxAmountOf(policy);
  if (biggest) {
    add('最大金额', biggest, 'strong');
  }
  if ((policy.bodyLength ?? 0) > 0) {
    add('正文篇幅', `${policy.bodyLength} 字`);
  }
  return facts;
}

export function buildDigest(policy: Policy): PolicyDigest {
  const tools = toolsOf(policy);
  const aim = aimOf(policy);
  const issuer = shortIssuer(policy.issuer);
  const verbEntry = DOC_VERB.find(([re]) => re.test(policy.title || ''));
  const verb = verbEntry ? verbEntry[1] : '发布文件';
  const targets = (policy.targets ?? []).filter((item) => item.length >= 2).slice(0, 4);
  const implementers = (policy.implementers ?? []).filter((item) => item.length >= 2).slice(0, 4);
  const funding = (policy.funding ?? []).filter((item) => item.length >= 4).slice(0, 2);
  const timeline = (policy.timeline ?? []).filter((item) => item.text?.length >= 4).slice(0, 2);

  // 主旨句：谁 + 干什么 + 用什么 + 面向谁。四项都来自抽取字段，缺项时省略而不是编。
  // 没有量化目标时不把"原文未写明"塞进主旨句——那句话留给下面的逐句摘要，主旨句保持可读。
  const headlineParts = [`${issuer}${verb}`];
  if (tools.length > 0) headlineParts.push(`用「${tools.slice(0, 2).join('」「')}」`);
  if (targets.length > 0) headlineParts.push(`面向${targets.join('、')}`);
  const hasAim = aim.kind === 'target';
  const headline = `${headlineParts.join('，')}。${hasAim ? `${aim.text}。` : ''}`;

  const sentences: DigestSentence[] = [];

  sentences.push({
    label: '发布与效力',
    text: `${cnDate(policy.date) || '成文日期缺失'} 由${policy.issuer}发布${
      policy.docNo ? `（${policy.docNo}）` : '，原文未标注文号'
    }，文种为${policy.docType ?? '政策文件'}；${
      policy.effectiveDate
        ? `自 ${cnDate(policy.effectiveDate)} 起施行`
        : '原文未写明施行日期，需按发布即生效或另文规定处理'
    }${policy.validUntil ? `，有效期至 ${cnDate(policy.validUntil)}` : ''}。`,
    basis: '文号／成文日期／施行日期',
  });

  sentences.push({
    label: '工具与对象',
    text:
      tools.length > 0
        ? `主要工具为「${tools.join('」「')}」；作用对象${targets.length > 0 ? `为${targets.join('、')}` : '在原文中未明确列举'}。`
        : `原文未出现可识别的具体工具表述，只能按工具类型归为「${(policy.instrumentTypes ?? []).join('、') || '未归类'}」；作用对象${
            targets.length > 0 ? `为${targets.join('、')}` : '未明确列举'
          }。`,
    basis: '政策工具／作用对象',
  });

  const biggest = maxAmountOf(policy);
  sentences.push({
    label: '目标与力度',
    text: `${aim.text}${biggest ? `；文中出现的最大金额为 ${biggest}` : ''}。`,
    basis: aim.basis,
  });

  const implementText =
    implementers.length > 0
      ? `实施主体包括${implementers.join('、')}`
      : '原文未点名具体实施主体（多为"各地区各部门"式表述）';
  const fundingText =
    funding.length > 0 ? `；资金安排：${funding.map((item) => trimSentence(item, 60)).join('；')}` : '；未写明新增资金安排';
  const timelineText =
    timeline.length > 0
      ? `；时间节点：${timeline
          .map((item) => {
            const body = item.text.trim();
            // 抽取出来的节点句本身常以年份开头，再加一次年份就成了"2026 2026年…"。
            const text = body.startsWith(item.year) ? body : `${item.year} ${body}`.trim();
            return trimSentence(text, 56);
          })
          .join('；')}`
      : '';
  sentences.push({
    label: '落实安排',
    text: `${implementText}${fundingText}${timelineText}。`,
    basis: '实施主体／资金来源／时间节点',
  });

  const structure: string[] = [];
  const sectionCount = (policy.sections ?? []).length;
  if (sectionCount > 0) structure.push(`${sectionCount} 个章节`);
  if ((policy.clauses ?? []).length > 0) structure.push(`${policy.clauses.length} 条可引条款`);
  if ((policy.bodyLength ?? 0) > 0) structure.push(`正文 ${policy.bodyLength} 字`);
  const sourceNote = policy.attachmentOnly
    ? '；主体内容在附件中，未能解析'
    : policy.bodySource === 'page+pdf'
      ? '；已并入 PDF 附件正文'
      : '';
  sentences.push({
    label: '文本结构',
    text:
      structure.length > 0
        ? `原文可拆出 ${structure.join('、')}${sourceNote}。`
        : '原文结构无法拆分（可能是短公告或附件为主），摘要只能依据首段。',
    basis: '章节／条款／篇幅',
  });

  const facts = buildFacts(policy, tools);

  // 完整度只统计这八个字段：它们是能"读出一份文件是什么"的最小集合，
  // 少了其中任何一项，摘要就会出现"知道有这个文件但说不清它管什么"的空洞。
  const checks: { label: string; ok: boolean }[] = [
    { label: '文号', ok: Boolean(policy.docNo) },
    { label: '施行日期', ok: Boolean(policy.effectiveDate) },
    { label: '主要工具', ok: tools.length > 0 },
    { label: '作用对象', ok: targets.length > 0 },
    { label: '实施主体', ok: implementers.length > 0 },
    { label: '资金安排', ok: funding.length > 0 },
    { label: '量化目标', ok: (policy.quantTargets ?? []).length > 0 },
    { label: '章节结构', ok: (policy.sections ?? []).length > 0 },
  ];
  const gaps = checks.filter((check) => !check.ok).map((check) => check.label);
  const coverage = Math.round(((checks.length - gaps.length) / checks.length) * 100);

  const points = pointsOf(policy);

  const plainLines = [
    `### ${policy.title}`,
    '',
    `**主旨**：${headline}`,
    '',
    ...sentences.map((item) => `- **${item.label}**：${item.text}`),
    '',
  ];
  if (points.length > 0) {
    plainLines.push('**关键表述**：');
    points.forEach((point, index) => plainLines.push(`${index + 1}. 〔${point.tag}〕${point.text}`));
    plainLines.push('');
  }
  plainLines.push(`- 来源：${policy.sourceUrl}`);
  if (gaps.length > 0) plainLines.push(`- 摘要未覆盖：${gaps.join('、')}（原文未写明或未抽取到，不是没有相关内容）`);

  return {
    id: policy.id,
    headline,
    sentences,
    facts,
    points,
    gaps,
    coverage,
    plain: plainLines.join('\n'),
  };
}

export function buildDigests(policies: Policy[]): PolicyDigest[] {
  return policies.map(buildDigest);
}
