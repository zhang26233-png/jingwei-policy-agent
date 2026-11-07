// 政策文本结构化抽取：规则引擎，输出可复算的字段，不做语义猜测。
import { parseDate } from './net.mjs';

export const CHANNELS = [
  {
    id: 'fiscal',
    name: '财政支出与政府投资',
    short: '财政投资',
    desc: '一般公共预算支出、专项债、超长期特别国债、基建投资',
    keywords: ['赤字', '专项债', '特别国债', '政府投资', '基础设施', '重大工程', '预算支出', '增发国债', '投资补助', '中央预算内投资'],
  },
  {
    id: 'transfer',
    name: '转移支付与地方财力',
    short: '转移支付',
    desc: '中央对地方转移支付、化债、基层“三保”',
    keywords: ['转移支付', '地方财力', '化债', '隐性债务', '基层三保', '财力保障', '债务限额', '再融资债券'],
  },
  {
    id: 'credit',
    name: '信贷供给与融资成本',
    short: '信贷成本',
    desc: '降准降息、再贷款、社会融资成本、信贷投放',
    keywords: ['降准', '降息', '存款准备金率', '政策利率', '再贷款', '再贴现', '社会融资成本', '贷款利率', '流动性', '信贷', '中期借贷便利', '公开市场'],
  },
  {
    id: 'consumption',
    name: '居民消费',
    short: '居民消费',
    desc: '以旧换新、消费券、消费贷款贴息、服务消费',
    keywords: ['以旧换新', '消费券', '消费贷款', '贴息', '提振消费', '服务消费', '消费品', '消费场景', '居民消费', '促消费'],
  },
  {
    id: 'property',
    name: '房地产与住房',
    short: '房地产',
    desc: '房贷利率、保障房、收储、城市更新',
    keywords: ['房地产', '住房', '房贷', '首付', '保障性住房', '城中村', '收储', '商品房', '公积金', '城市更新'],
  },
  {
    id: 'trade',
    name: '外贸与外需',
    short: '外贸',
    desc: '出口退税、跨境贸易、外资、自贸区',
    keywords: ['出口', '外贸', '关税', '跨境', '外资', '自贸', '海关', '进出口', '贸易'],
  },
  {
    id: 'private',
    name: '民营与中小微企业',
    short: '民营经济',
    desc: '民营经济促进、融资难融资贵、清欠、市场准入',
    keywords: ['民营', '中小企业', '小微企业', '融资难', '清欠', '市场准入', '个体工商户', '民间投资', '公平竞争'],
  },
  {
    id: 'welfare',
    name: '就业社保与民生',
    short: '就业民生',
    desc: '就业、社保、育儿补贴、养老、医疗',
    keywords: ['就业', '社保', '养老', '育儿', '生育', '医疗', '低保', '救助', '职业技能', '工资', '居民收入'],
  },
  {
    id: 'industry',
    name: '产业升级与设备更新',
    short: '产业升级',
    desc: '设备更新、技术改造、新质生产力、制造业',
    keywords: ['设备更新', '技术改造', '新质生产力', '制造业', '产业链', '专精特新', '数字化', '人工智能', '科技创新', '产业升级'],
  },
];

const INSTRUMENT_RULES = [
  { type: '财政', keywords: ['赤字', '专项债', '特别国债', '预算', '财政支出', '转移支付', '贴息', '补助', '减税', '降费', '税收'] },
  { type: '货币', keywords: ['降准', '降息', '再贷款', '存款准备金', '政策利率', '流动性', '信贷', '社会融资'] },
  { type: '消费', keywords: ['以旧换新', '消费券', '消费贷款', '提振消费', '服务消费', '消费场景'] },
  { type: '民生', keywords: ['育儿', '养老', '社保', '就业', '医疗', '救助', '低保', '生育'] },
  { type: '法治', keywords: ['法', '条例', '规定', '办法', '意见', '决定'] },
  { type: '产业', keywords: ['设备更新', '技术改造', '制造业', '产业链', '新质生产力', '专精特新', '科技创新'] },
];

const GOAL_RULES = [
  { goal: '稳增长', keywords: ['稳增长', '扩大内需', '经济增长', '经济运行'] },
  { goal: '扩内需', keywords: ['内需', '消费', '投资'] },
  { goal: '防风险', keywords: ['风险', '债务', '化债', '安全'] },
  { goal: '稳就业', keywords: ['就业', '岗位', '用工'] },
  { goal: '惠民生', keywords: ['民生', '育儿', '养老', '救助', '收入'] },
  { goal: '促创新', keywords: ['创新', '科技', '新质生产力', '数字化'] },
  { goal: '稳外贸', keywords: ['外贸', '出口', '外资'] },
  { goal: '稳楼市', keywords: ['房地产', '住房', '楼市'] },
];

const TARGET_RULES = [
  { target: '居民', keywords: ['居民', '家庭', '消费者', '个人'] },
  { target: '企业', keywords: ['企业', '公司', '经营主体'] },
  { target: '中小微企业', keywords: ['中小企业', '小微企业', '个体工商户'] },
  { target: '地方政府', keywords: ['地方', '省级', '市县', '基层'] },
  { target: '金融机构', keywords: ['银行', '金融机构', '保险'] },
  { target: '制造业', keywords: ['制造业', '工业', '产业链'] },
  { target: '房地产市场', keywords: ['房地产', '住房'] },
  { target: '就业群体', keywords: ['就业', '毕业生', '农民工', '劳动者'] },
];

const INSTRUMENT_PATTERNS = [
  /(?:赤字率|赤字规模)[^。；]{0,24}/g,
  /(?:发行|安排|新增)[^。；]{0,12}(?:专项债|特别国债|国债)[^。；]{0,20}/g,
  /降准[^。；]{0,16}/g,
  /(?:下调|降低)[^。；]{0,10}(?:利率|首付比例|费率)[^。；]{0,12}/g,
  /(?:减少|免征|减免|降低)[^。；]{0,8}(?:税|费)[^。；]{0,12}/g,
  /(?:安排|投入|下达)[^。；]{0,8}(?:资金|补助|补贴)[^。；]{0,16}/g,
  /(?:育儿补贴|消费券|以旧换新|设备更新)[^。；]{0,20}/g,
  /(?:给予|实施|提供|开展)[^。；]{0,10}(?:贴息|补贴|补助|补偿|奖励)[^。；]{0,16}/g,
  /(?:贴息|补贴|补助|补偿)[^。；]{0,16}(?:政策|标准|比例|范围)/g,
  /(?:扩大|拓宽|放宽|提高)[^。；]{0,10}(?:范围|比例|额度|上限|标准)[^。；]{0,12}/g,
  /(?:试点|示范)[^。；]{0,14}/g,
];

function countHits(text, keywords) {
  let hits = 0;
  for (const keyword of keywords) {
    let index = text.indexOf(keyword);
    while (index !== -1) {
      hits += 1;
      index = text.indexOf(keyword, index + keyword.length);
    }
  }
  return hits;
}

export function classifyChannels(text) {
  const raw = CHANNELS.map((channel) => {
    const hits = countHits(text, channel.keywords);
    // 按千字密度归算，避免长文本（发布会实录）把短文件（专项通知）压平。
    const density = hits / Math.max(1, text.length / 1000);
    return {
      id: channel.id,
      name: channel.name,
      short: channel.short,
      hits,
      density: Math.round(density * 100) / 100,
    };
  });
  const total = raw.reduce((sum, item) => sum + item.density, 0);
  return raw
    .map((item) => ({
      ...item,
      weight: total === 0 ? 0 : Math.round((item.density / total) * 1000) / 1000,
    }))
    .sort((a, b) => b.density - a.density);
}

export function extractInstruments(text) {
  const found = [];
  for (const pattern of INSTRUMENT_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const phrase = match[0]
        .replace(/\s+/g, '')
        .split(/[，。；：、]/)[0]
        .replace(/[，。；：、,.;:]$/, '')
        .trim();
      const noisy = /(源头到|末端|有关|原则上|工作|情况|问题|通知|附件)/.test(phrase);
      const fragment = /^[的了吗]/.test(phrase) || phrase.endsWith('的');
      if (phrase.length >= 5 && phrase.length <= 32 && !noisy && !fragment && !found.includes(phrase)) {
        found.push(phrase);
      }
    }
  }
  return found.slice(0, 6);
}

const CLAUSE_HINT = /(补贴|贴息|降准|降息|专项债|转移支付|贷款|利率|减免|退税|免征|扣除|标准|比例|额度|上限|期限|不得|应当|给予|补助|补偿|奖励|支持)/;
const BOILER = /^(现印发|现将|请遵照|请认真|特此|附件|各省|国务院有关|抄送|财[金预税]〔|.{0,10}〔\d{4}〕)/;

// 从正文里挑出"像条款"的句子，供证据抽屉与机制链引用；不做语义改写，只做筛选。
export function extractKeyClauses(text, max = 6) {
  const sentences = String(text || '')
    .replace(/\r/g, '')
    .split(/[。；\n]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 16 && item.length <= 140 && !BOILER.test(item));

  const scored = sentences
    .map((sentence, index) => {
      let score = 0;
      if (CLAUSE_HINT.test(sentence)) score += 3;
      if (/\d/.test(sentence)) score += 2;
      if (/(应当|不得|负责|给予|按照.{0,6}标准|自.{0,10}起)/.test(sentence)) score += 1;
      return { sentence, index, score };
    })
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index);

  return scored.map((item, order) => ({ label: `要点 ${order + 1}`, text: item.sentence }));
}

export function extractNumbers(text) {
  const results = [];
  const amount = /(\d+(?:\.\d+)?)\s*(万亿|亿|万)\s*元/g;
  for (const match of text.matchAll(amount)) {
    if (match[2] === '万') {
      results.push({ raw: match[0].trim(), value: Number(match[1]), unit: '万元' });
      continue;
    }
    const unit = match[2] === '万亿' ? 10000 : 1;
    results.push({
      raw: match[0].trim(),
      value: Number(match[1]) * unit,
      unit: '亿元',
    });
  }
  const rate = /(\d+(?:\.\d+)?)\s*(?:个百分点|%)/g;
  for (const match of text.matchAll(rate)) {
    results.push({ raw: match[0].trim(), value: Number(match[1]), unit: '百分比' });
  }
  return results.slice(0, 12);
}

// 文档类型：政策库只把"政策文件"当作政策条目，其余作为背景材料单独标注，避免把新闻动态混成政策。
const DOC_RULES = [
  { type: '工作动态', test: /(记账式|招标|兑付|续发行|到期偿还|贴现\s*（|发行\s*\d{4}\s*年)/ },
  { type: '发布实录', test: /(发布会|实录|答记者问|记者问|吹风会|通气会|专访)/ },
  { type: '数据发布', test: /(收支情况|统计数据|运行情况|统计公报|数据解读|景气指数|采购经理指数|销售情况|完成情况|进展情况|月份.{0,8}情况|变动情况|核算结果|基本情况|价格情况)/ },
  {
    type: '政策文件',
    test: /(通知|办法|公告|批复|规定|意见|方案|规划|决定|条例|准则|规则|指引|目录|清单|计划|细则|暂行|实施|印发|发文|税则|税率)/,
  },
  // 放在"政策文件"之后：先让明确的公文文种胜出，剩下的才按"通篇报数字"判为数据发布。
  // 否则统计局那些"前三季度经济运行总体平稳""利润增长15.5%"会被当成政策文件进入优先级榜。
  { type: '数据发布', test: /(增长|下降|回落|回升)\s*-?\d+(?:\.\d+)?\s*(?:%|％|个百分点)|指数为|同比|比上年|环比|前三季度|上半年|一季度/ },
  { type: '工作动态', test: /(监管局|调研|座谈|召开|举行|开展|部署|动态|拨付|下达|专题\s*\|)/ },
  // 领导活动与会议报道：标题里带"出席/会见/论坛"等，实际是新闻而不是公文。
  // 放在"政策文件"规则之后，避免把"关于举办××论坛的通知"一并误判。
  { type: '工作动态', test: /(出席|会见|讲话|致辞|开幕式|闭幕式|论坛|研讨会|推介会|签署|会谈)/ },
];

export function classifyDocType(title) {
  for (const rule of DOC_RULES) {
    if (rule.test.test(title)) return rule.type;
  }
  return '政策文件';
}

// 正文开头常带"2026年10月23日来源：财政部新闻办公室"这类采集噪音，先剥掉再生成摘要。
export function cleanBody(text) {
  let output = String(text || '');
  for (let round = 0; round < 4; round += 1) {
    const before = output;
    output = output
      .replace(/^\s*(来源|文章来源|信息来源|发布时间|发布日期)\s*[:：]\s*[^\s。，,]{0,40}\s*/u, '')
      .replace(/^\s*\d{4}\s*[-年/.]\s*\d{1,2}\s*[-月/.]\s*\d{1,2}\s*日?\s*(?:[至—\-–~]\s*\d{1,2}\s*日?)?\s*(?:\d{1,2}:\d{2})?\s*/u, '')
      .replace(/^\s*(本站讯|本网讯|新华社北京\d{0,2}月?\d{0,2}日电)\s*/u, '')
      .replace(/^\s*[|·•—\-–]\s*/u, '')
      .replace(/^[，、；。：:,.\s]+/u, '');
    if (output === before) break;
  }
  return output.replace(/\s+/g, '').trim();
}

function makeSummary(cleaned, limit) {
  if (!cleaned) return '';
  const slice = cleaned.slice(0, limit);
  const stop = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('；'));
  if (stop >= limit * 0.5) return slice.slice(0, stop + 1);
  return slice;
}

export function extractPolicy({
  title,
  text,
  issuer,
  date,
  url,
  sourceName,
  sourceLevel,
  attachments = [],
  attachmentText = '',
}) {
  const body = `${title}\n${text}`;
  const per1000 = (keywords) => countHits(body, keywords) / Math.max(1, body.length / 1000);
  const channels = classifyChannels(body);
  const cleaned = cleanBody(text);

  const instrumentTypes = INSTRUMENT_RULES
    .map((rule) => ({ type: rule.type, score: per1000(rule.keywords) }))
    .filter((item) => item.score >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.type);

  const goals = GOAL_RULES
    .map((rule) => ({ goal: rule.goal, score: per1000(rule.keywords) }))
    .filter((item) => item.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.goal);

  const targets = TARGET_RULES
    .map((rule) => ({ target: rule.target, score: per1000(rule.keywords) }))
    .filter((item) => item.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => item.target);

  const topChannels = channels.filter((channel) => channel.hits > 0).slice(0, 3);
  const docType = classifyDocType(title);
  const titleKey = title.replace(/\s+/gu, '');
  const paragraphs = buildParagraphs(text, 14000);

  // 摘要不要从"标题+文号+主送机关"里截，那样每一行开头都是重复的公文抬头。
  // 取正文里第一条长度足够、且不是抬头/落款的段落。
  // 抬头（主送机关）、文号行、落款都只有半句话，不该当摘要：要求段落里至少有一个完整句号。
  const BORING = /^(各省|各市|各有关单位|国务院各部委|现将|现印发|附件|抄送)/;
  const summarySource =
    paragraphs.find(
      (block) =>
        block.length >= 40 &&
        block.includes('。') &&
        !BORING.test(block) &&
        !/〔\d{4}〕/.test(block) &&
        !block.startsWith(titleKey.slice(0, 12)),
    ) ?? (cleaned.startsWith(titleKey) ? cleanBody(cleaned.slice(titleKey.length)) : cleaned);

  const effective = extractEffective(cleaned);
  const scope = extractScope(cleaned);

  return {
    shortTitle: title.length > 34 ? `${title.slice(0, 34)}…` : title,
    title,
    docNo: extractDocNo(cleaned),
    issuer,
    docType,
    date: date || parseDate(text) || '',
    effective: effective.effectiveDate || '',
    effectiveDate: effective.effectiveDate,
    validUntil: effective.validUntil,
    level: '中央',
    theme: topChannels[0]?.name || '宏观总量',
    instrumentTypes: instrumentTypes.length > 0 ? instrumentTypes : ['财政'],
    instruments: extractInstruments(body),
    targets: targets.length > 0 ? targets : ['企业'],
    goals: goals.length > 0 ? goals : ['稳增长'],
    summary: makeSummary(summarySource.length > 20 ? summarySource : cleaned, 118),
    excerpt: cleaned.slice(0, 320),
    clauses: extractKeyClauses(cleaned, 8),
    obligations: extractObligations(cleaned),
    quantTargets: extractQuantTargets(cleaned),
    implementers: extractImplementers(cleaned),
    funding: extractFunding(cleaned),
    timeline: extractTimeline(cleaned),
    sections: extractSections(text),
    scope,
    paragraphs,
    attachmentOnly: detectAttachmentOnly(text, attachments),
    attachments,
    bodySource: attachmentText ? 'page+pdf' : 'page',
    // 全文用于可回溯率核算：必须覆盖所有派生句的出处，否则长文件（规划类附件）会出现假失败
    fullText: cleaned.slice(0, 20000),
    sourceName,
    sourceUrl: url,
    sourceLevel,
    status:
      effective.validUntil && effective.validUntil < new Date().toISOString().slice(0, 10)
        ? '已到期'
        : '现行',
    related: [],
    tags: [...new Set([...instrumentTypes, ...goals, ...topChannels.map((c) => c.short)])],
    channels: channels.filter((channel) => channel.hits > 0),
    numbers: extractNumbers(body),
    bodyLength: text.length,
    collectedAt: new Date().toISOString(),
  };
}

/* ==========================================================================
   第二层抽取：把一份政策原文拆成可逐条阅读的结构化内容。
   原则——只认字面能核对的模式，抽不到就留空，不做语义补全。
   ========================================================================== */

// 文号：财政部/发改委/央行等常见写法，覆盖"财预〔2026〕12号""第25号""2026年第12号"三种。
const DOCNO_PATTERNS = [
  /[\u4e00-\u9fa5]{2,10}〔\d{4}〕\d{1,4}号/,
  /[\u4e00-\u9fa5]{2,10}\[\d{4}\]\d{1,4}号/,
  /\d{4}\s*年\s*第\s*\d{1,3}\s*号/,
  /第\s*\d{1,3}\s*号(?:公告)?/,
];

export function extractDocNo(text) {
  const head = String(text || '').slice(0, 600);
  for (const pattern of DOCNO_PATTERNS) {
    const match = pattern.exec(head);
    if (!match) continue;
    // 正文首行常是"标题+文号"连写，文号必须以机关简称或"第/年份"开头，否则从中间截断。
    const raw = match[0].replace(/\s+/g, '');
    const tail = raw.split('的').pop() || raw;
    const anchor = /([\u4e00-\u9fa5]{2,8}〔\d{4}〕\d{1,4}号|[\u4e00-\u9fa5]{2,8}\[\d{4}\]\d{1,4}号|\d{4}年第\d{1,3}号|第\d{1,3}号(?:公告)?)$/.exec(tail);
    if (anchor) return anchor[0];
  }
  return '';
}

// 施行/废止日期：只取"自…起施行"这类明确表述，避免把成文日期误当生效日。
export function extractEffective(text) {
  const source = String(text || '');
  // "自2027年4月1日起施行"与"自2027年4月1日起，将…"都是生效表述，正文动作词不必紧跟。
  const start = /(?:自|从)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日起/.exec(source)
    ?? /(?:自|从)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日起/.exec(source);
  let effectiveDate = '';
  if (start && start.length === 4) {
    effectiveDate = `${start[1]}-${String(start[2]).padStart(2, '0')}-${String(start[3]).padStart(2, '0')}`;
  } else if (start && start.length === 3) {
    effectiveDate = `-${String(start[1]).padStart(2, '0')}-${String(start[2]).padStart(2, '0')}`;
  }
  const until = /(?:有效期|执行期限|实施期限|政策期限)[^。]{0,12}?(?:至|到)\s*(\d{4})\s*年\s*(\d{1,2})?\s*月?\s*(\d{1,2})?\s*日?/.exec(source);
  const validUntil = until
    ? `${until[1]}-${String(until[2] || '12').padStart(2, '0')}-${String(until[3] || '31').padStart(2, '0')}`
    : '';
  return { effectiveDate, validUntil };
}

// 量化目标：必须同时出现"年份 + 指标 + 方向/数值"，否则不认。
// 量化目标：必须同时出现"到/至 + 年份 + 指标 + 方向/数值"，否则不认。
// 年份前必须带"到/至/截至"，是为了挡住"2026年10月1日起实施…期限不超过5年"这类被"不超过"误命中的条件句。
const TARGET_PATTERN =
  /(?:到|至|截至|截止到)\s*(20\d{2})\s*年(?:底|末|前|之前)?[^。；]{0,90}?(?:达到|不低于|不超过|超过|降至|压减到|控制在|提高到|提升到|上升到|增长到|突破|保持在|稳定在|占比|覆盖率达到|基本建成|全面建成|建成|力争|确保|实现|基本形成|基本建立|基本理顺|全面摸清|显著提升|明显改善|更加完善|更加健全|取得)[^。；]{0,50}/g;

/** 倒装句式：动词在前、年份在后，如「实现到 2030 年……」 */
const TARGET_PATTERN_INVERTED =
  /(?:实现|确保|力争|推动|基本实现)[^。；]{0,6}(?:到|至)\s*(20\d{2})\s*年[^。；]{0,80}/g;

export function extractQuantTargets(text) {
  const results = [];
  const seen = new Set();
  const body = String(text || '');
  // 两种句式都要跑：常规"到 2030 年……基本形成"，倒装"实现到 2030 年……"。
  for (const pattern of [TARGET_PATTERN, TARGET_PATTERN_INVERTED]) {
    for (const match of body.matchAll(pattern)) {
      const phrase = match[0].replace(/\s+/g, '').replace(/^[，。；：、]/, '');
      if (phrase.length < 10 || phrase.length > 110 || seen.has(phrase)) continue;
      seen.add(phrase);
      const value = /(\d+(?:\.\d+)?)\s*(?:%|％|万亿|亿|万|个百分点|个|项|家|人)/.exec(phrase);
      results.push({
        text: phrase,
        year: match[1],
        value: value ? value[0] : '',
      });
    }
  }
  return results.slice(0, 5);
}

// 条款分类：把正文句子按"约束/禁止/激励/程序/目标"五类归位，供详情页分组阅读。
const OBLIGATION_RULES = [
  { kind: '禁止', test: /(不得|严禁|禁止|一律不得|坚决遏制|不得以)/ },
  { kind: '约束', test: /(应当|必须|应按照|原则上|限于|不得低于|不低于|不得高于)/ },
  { kind: '激励', test: /(给予|补助|补贴|贴息|奖励|减免|免征|支持|鼓励|优先|返还)/ },
  { kind: '程序', test: /(负责|会同|报.{0,6}备案|审批|审核|核准|公示|监督|检查|评估|验收)/ },
  { kind: '目标', test: /(到\s*20\d{2}\s*年|力争|实现|达到|完成.{0,6}目标|任务)/ },
];

export function extractObligations(text) {
  const sentences = String(text || '')
    .replace(/\r/g, '')
    .split(/[。；\n]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 14 && item.length <= 130 && !BOILER.test(item));

  const buckets = new Map();
  sentences.forEach((sentence, index) => {
    for (const rule of OBLIGATION_RULES) {
      if (!rule.test.test(sentence)) continue;
      const list = buckets.get(rule.kind) ?? [];
      if (list.length < 8 && !list.some((entry) => entry.text === sentence)) {
        list.push({ text: sentence, index });
      }
      buckets.set(rule.kind, list);
      break;
    }
  });

  return ['目标', '约束', '禁止', '激励', '程序']
    .map((kind) => ({ kind, items: (buckets.get(kind) ?? []).map((entry) => entry.text) }))
    .filter((group) => group.items.length > 0);
}

// 实施主体：只认"由X负责""X会同Y""各地X部门""XX主管部门负责"四类明确表述。
const IMPLEMENTER_PATterns = [
  /由([\u4e00-\u9fa5]{2,14}?)(?:负责|牵头|组织实施|具体承担)/g,
  /([\u4e00-\u9fa5]{2,10}(?:部|委|局|署|行|院|厅))会同([\u4e00-\u9fa5]{2,14}?)(?:负责|实施|推进)/g,
  /(各(?:省|自治区|直辖市)[^，。]{0,12})/g,
  // 行政法规的典型写法：「国务院知识产权行政部门负责……」「XX主管部门负责……」，主体以"部门/机关"结尾
  /((?:国家|国务院|省|市|县|地方|城镇)?[\u4e00-\u9fa5]{0,12}(?:主管部门|管理部门|管理机关|行政部门|登记管理机关|管理机构))(?=负责|会同|应当|责令|制定|提出|按照|依法)/g,
];

export function extractImplementers(text) {
  const found = [];
  for (const pattern of IMPLEMENTER_PATterns) {
    for (const match of String(text || '').matchAll(pattern)) {
      const name = (match[1] || '')
        .replace(/\s+/g, '')
        // 主体名前面常粘着条号（"第五条国家事业单位登记管理机关"），必须剥掉，否则不是机构名
        .replace(/^第[一二三四五六七八九十百零\d]+条(之[一二三四五六七八九十]+)?/, '')
        .replace(/^[，。；：、]/, '')
        .trim();
      if (name.length < 2 || name.length > 20) continue;
      if (/^(此|该|其|上述|有关|相关)$/.test(name)) continue;
      // "有关主管部门""相关管理部门"是泛称，指不到具体单位，不进实施主体
      if (/^(有关|相关|各级|地方各级)/.test(name)) continue;
      // "局领导""负责同志"是人不是单位
      if (/(领导|同志|人员|干部)$/.test(name)) continue;
      if (!found.includes(name)) found.push(name);
    }
  }
  return found.slice(0, 5);
}

// 资金来源：政策里凡是写明钱从哪出的，都是影响传导力度的关键信息。
const FUNDING_PATTERN =
  /(?:资金(?:来源|渠道)|所需资金|经费|由[^。；]{0,10}(?:承担|负担)|从[^。；]{0,16}(?:列支|安排))[^。；]{0,60}/g;

export function extractFunding(text) {
  const results = [];
  for (const match of String(text || '').matchAll(FUNDING_PATTERN)) {
    const phrase = match[0].replace(/\s+/g, '').trim();
    if (phrase.length >= 10 && phrase.length <= 80 && !results.includes(phrase)) results.push(phrase);
  }
  return results.slice(0, 3);
}

// 适用范围：省级点名是判断"是否只影响部分地区"的直接证据。
const PROVINCE_NAMES = [
  '北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽',
  '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州',
  '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆',
];

export function extractScope(text) {
  const source = String(text || '');
  const hit = PROVINCE_NAMES.filter((name) => source.includes(name));
  return {
    nationwide: hit.length <= 3,
    provinces: hit.slice(0, 12),
  };
}

// 时间节点：政策里"2026年底前完成""2027年启动"这类排期，决定影响何时落地。
export function extractTimeline(text) {
  const nodes = [];
  const pattern = /(20\d{2})\s*年(?:底|末|上半年|下半年|前|起)?[^。；]{0,30}/g;
  for (const match of String(text || '').matchAll(pattern)) {
    const phrase = match[0].replace(/\s+/g, '').trim();
    if (phrase.length < 6 || phrase.length > 50) continue;
    if (!/(完成|启动|实现|建立|建成|达到|实施|试点|全面)/.test(phrase)) continue;
    if (!nodes.some((node) => node.text === phrase)) nodes.push({ year: match[1], text: phrase });
  }
  return nodes.slice(0, 6);
}

/* ==========================================================================
   正文分段：详情页要能逐段读，所以不能像摘要那样把空白全删掉。
   部委页面的导航串、打印按钮、来源标注会在分段阶段清掉。
   ========================================================================== */
const NAV_LINE = /^(首页|[打印]|关闭|返回|分享|字体|扫一扫|相关(政策|链接|报道)|政策解读|附件下载|排行榜|上一篇|下一篇)/;
const CRUMB_LINE = /^(?:[^>]{1,14}>){2,}/;
const META_LINE = /^(?:发布时间|来源|浏览次数|字号|索引号|主题分类|发文机关|成文日期|发布日期)\s*[:：]/;
const TAIL_NOISE = /(相关政策与解读|答记者问|排行榜|本文有删减|【?打印】?|【?关闭】?|扫一扫|手机版)/;

export function buildParagraphs(text, maxChars = 8000) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter((line) => line.length > 0);

  const kept = [];
  for (let line of lines) {
    if (NAV_LINE.test(line) || CRUMB_LINE.test(line) || META_LINE.test(line)) continue;
    line = line
      .replace(TAIL_NOISE, '')
      .replace(/^\d{4}\s*[-年/.]\s*\d{1,2}\s*[-月/.]\s*\d{1,2}\s*日?\s*(?:来源|文章来源)?\s*[:：]?\s*[^\s。，]{0,20}\s*/u, '')
      .replace(/^(?:来源|文章来源|发布时间)\s*[:：]\s*[^\s。，]{0,20}\s*/u, '')
      .trim();
    if (line.length < 2) continue;
    // 正文首行往往是"标题+文号"，与标题重复，去掉标题前缀只留文号。
    kept.push(line);
  }

  // 把过短的续行并回上一段（PDF 转网页常见一行一句），避免详情页碎成一地。
  const merged = [];
  for (const line of kept) {
    const last = merged[merged.length - 1];
    if (last && last.length < 24 && line.length > 20 && !/^[一二三四五六七八九十]+、/.test(line)) {
      merged[merged.length - 1] = `${last}${line}`;
    } else {
      merged.push(line);
    }
  }

  const output = [];
  let budget = maxChars;
  for (const block of merged) {
    if (budget <= 0) break;
    const slice = block.length > budget ? block.slice(0, budget) : block;
    output.push(slice);
    budget -= slice.length;
  }
  return output;
}

// 政府文件的核心内容常常只在附件 PDF 里，网页正文只有一纸通知。
// 这类条目不该假装"内容完整"，在详情页要明确标出来。
//
// 判定改成三态，比原来"短 + 提到附件"更准：
//   ① 认出了正文附件但没读出来（扫描件、OFD）→ 确实是缺口；
//   ② 正文附件已解析进正文 → 不是缺口；
//   ③ 只挂清单类附件（名单／表格）→ 正文本身是完整的，清单只是附表，不算缺口。
export function detectAttachmentOnly(text, attachments = []) {
  const source = String(text || '');
  const list = Array.isArray(attachments) ? attachments : [];
  if (source.length > 1200) return false;

  if (list.some((item) => item.role === 'main' && item.ok)) return false;
  if (list.some((item) => item.role === 'main' && !item.ok)) return true;

  const annex = list.filter((item) => item.role === 'annex');
  if (annex.length > 0) {
    // 通知类文件正文可能只有"现印发给你们"一句，此时清单就是全部实体内容
    return source.length < 240;
  }
  // 页面上找不到任何附件链接：无法证实正文另有所在，不再凭空标记
  return false;
}

// 政府文件的骨架是"一、总体要求 / 二、重点任务 / 三、保障措施"这类章节。
// 把骨架单独抽出来，详情页才能先给结构、再给条款，而不是一上来就是八条零散句子。
export function extractSections(text) {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((line) => line.replace(/[ \t\u3000]+/g, ' ').trim())
    .filter(Boolean);

  const sections = [];
  const pattern = /^([一二三四五六七八九十]{1,3})、\s*([^。；，]{2,28})/;
  for (const line of lines) {
    const match = pattern.exec(line);
    if (!match) continue;
    const title = match[2].replace(/[（(].*?[）)]/g, '').trim();
    if (title.length < 2) continue;
    if (sections.some((item) => item.title === title)) continue;
    sections.push({ label: `${match[1]}、`, title });
  }
  // 子条款编号（一）（二）也算结构信息，但只在章节不足时补位，避免把条款清单当目录。
  if (sections.length < 3) {
    for (const line of lines) {
      const sub = /^[（(]([一二三四五六七八九十]{1,3})[）)]\s*([^。；，]{2,26})/.exec(line);
      if (!sub) continue;
      const title = sub[2].trim();
      if (title.length < 3 || sections.some((item) => item.title === title)) continue;
      sections.push({ label: `（${sub[1]}）`, title });
      if (sections.length >= 8) break;
    }
  }
  return sections.slice(0, 12);
}
