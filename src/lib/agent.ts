import { policies } from '../data/policies';
import type {
  AnalysisResult,
  AnalysisSection,
  Policy,
  TransmissionEdge,
  TransmissionNode,
} from '../types';

const STOP_WORDS = [
  '中国',
  '宏观',
  '经济',
  '政策',
  '哪些',
  '什么',
  '怎么',
  '如何',
  '为什么',
  '是否',
  '可以',
  '一个',
  '今年',
  '近年',
  '目前',
  '主要',
  '有关',
  '对于',
  '以及',
  '还有',
  '的影响',
  '影响',
  '作用',
  '组合',
  '工具',
  '居民',
  '企业',
];

const KNOWN_TERMS = [
  '稳增长',
  '财政',
  '货币',
  '赤字率',
  '特别国债',
  '超长期特别国债',
  '专项债',
  '降准',
  '降息',
  '利率',
  '政策利率',
  '流动性',
  '消费',
  '提振消费',
  '消费贷',
  '贴息',
  '以旧换新',
  '设备更新',
  '两新',
  '育儿补贴',
  '育儿',
  '民营经济',
  '民营企业',
  '融资',
  '市场准入',
  '房地产',
  '房贷',
  '公积金',
  '首付',
  '就业',
  '收入',
  '投资',
  '内需',
  '科技创新',
  '中小微',
  '法治',
  '预期',
  '价格',
  '生育',
  '养老',
];

const clean = (text: string) => text.replace(/[，。；：、？！“”‘’（）《》\s]/g, '');

export function getQueryTerms(query: string): string[] {
  const normalized = clean(query);
  const hitKnown = KNOWN_TERMS.filter((term) => normalized.includes(term));
  if (hitKnown.length > 0) {
    return Array.from(new Set(hitKnown)).slice(0, 8);
  }

  const bigrams: string[] = [];
  for (let index = 0; index < normalized.length - 1; index += 1) {
    const term = normalized.slice(index, index + 2);
    const hasDigit = /\d/.test(term);
    const isStop = STOP_WORDS.some((stop) => stop.includes(term) || term.includes(stop));
    if (!hasDigit && !isStop) bigrams.push(term);
  }
  return Array.from(new Set(bigrams)).slice(0, 8);
}

function scorePolicy(policy: Policy, terms: string[]): number {
  const title = policy.title + policy.shortTitle;
  const instruments = policy.instruments.join(' ');
  const targets = policy.targets.join(' ');
  const tags = policy.tags.join(' ');
  const clauses = policy.clauses.map((clause) => clause.text).join(' ');
  const full = `${title} ${policy.summary} ${instruments} ${targets} ${tags} ${clauses}`;

  let score = 0;
  terms.forEach((term) => {
    if (term.length < 2) return;
    if (policy.tags.some((tag) => tag.includes(term) || term.includes(tag))) score += 5;
    if (title.includes(term)) score += 4;
    if (instruments.includes(term)) score += 2.5;
    if (targets.includes(term)) score += 2;
    if (clauses.includes(term)) score += 1.5;
    if (full.includes(term)) score += 0.8;
  });

  if (terms.some((term) => term === '宏观' || term === '稳增长')) {
    if (policy.id === 'p2025-work-report') score += 2;
  }
  // 政策文件优先于发布会实录、数据发布与工作动态，避免用新闻材料当政策依据。
  const docType = policy.docType ?? '政策文件';
  if (docType === '政策文件') score *= 1.15;
  else if (docType === '工作动态') score *= 0.7;
  else score *= 0.85;
  return score;
}

export function searchPolicies(query: string): { matched: Policy[]; candidateCount: number; terms: string[] } {
  const normalized = clean(query);
  const terms = getQueryTerms(query);
  const scored = policies
    .map((policy) => ({ policy, score: scorePolicy(policy, terms) }))
    .sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  const threshold = Math.max(4, topScore * 0.28);
  const candidates = scored.filter((item) => item.score >= threshold);
  const matched = candidates.slice(0, 4).map((item) => item.policy);

  if (normalized.includes('房地产税')) {
    return { matched: [], candidateCount: 0, terms };
  }

  return { matched, candidateCount: candidates.length, terms };
}

function detectFocus(query: string, matched: Policy[]): AnalysisResult['focus'] {
  const normalized = clean(query);
  if (normalized.includes('消费') || normalized.includes('内需') || normalized.includes('育儿')) {
    return 'consumption';
  }
  if (normalized.includes('民营') || normalized.includes('企业') || normalized.includes('市场准入')) {
    return 'private';
  }
  if (normalized.includes('财政') || normalized.includes('赤字') || normalized.includes('国债') || normalized.includes('专项债')) {
    return 'fiscal';
  }
  if (normalized.includes('货币') || normalized.includes('降准') || normalized.includes('降息') || normalized.includes('利率')) {
    return 'monetary';
  }
  if (matched.some((policy) => policy.theme === '提振消费')) return 'consumption';
  return 'combined';
}

const focusLabels: Record<AnalysisResult['focus'], string> = {
  combined: '宏观政策组合',
  consumption: '消费与内需',
  monetary: '货币政策传导',
  fiscal: '财政政策力度',
  private: '民营经济制度环境',
};

function transmissionFor(focus: AnalysisResult['focus']): {
  nodes: TransmissionNode[];
  edges: TransmissionEdge[];
} {
  if (focus === 'consumption') {
    return {
      nodes: [
        {
          id: 'c1',
          label: '财政与信贷工具',
          sub: '贴息、以旧换新、育儿补贴',
          column: 0,
          refs: ['p2025-consumption', 'p2025-consumer-loan', 'p2025-childcare'],
          note: '三类工具分别降低信贷成本、耐用品置换成本和家庭养育支出。',
          uncertainty: '补贴覆盖范围、申领门槛和地方执行差异会影响实际到达率。',
        },
        {
          id: 'c2',
          label: '居民成本与现金流',
          sub: '利息支出下降、可支配资源增加',
          column: 1,
          refs: ['p2025-consumer-loan', 'p2025-childcare', 'p2025-pboc-may'],
          note: '消费贷贴息年化1个百分点但设有上限；育儿补贴为现金转移；公积金贷款利率下调降低房贷利息。',
          uncertainty: '不同家庭的负债结构和边际消费倾向差异很大，不能用一个平均值替代。',
        },
        {
          id: 'c3',
          label: '消费意愿与场景',
          sub: '耐用品换新、服务消费',
          column: 2,
          refs: ['p2025-consumption', 'p2025-two-new'],
          note: '以旧换新同时改变价格和置换时点，可能把未来需求提前到政策期内。',
          uncertainty: '存在“提前消费”而非“新增消费”的可能，需要观察政策退出后的回落。',
        },
        {
          id: 'c4',
          label: '消费与内需',
          sub: '社零、服务消费、GDP',
          column: 3,
          refs: ['p2025-work-report', 'p2025-consumption'],
          note: '政策目标是扩大内需，但消费修复还受收入预期、就业和资产价格影响。',
          uncertainty: '不能把政策出台后的消费变化直接归因于政策；需要对照组和更细的微观数据。',
        },
      ],
      edges: [
        { from: 'c1', to: 'c2', label: '降低成本' },
        { from: 'c2', to: 'c3', label: '改善条件' },
        { from: 'c3', to: 'c4', label: '可能传导' },
      ],
    };
  }

  if (focus === 'monetary') {
    return {
      nodes: [
        {
          id: 'm1',
          label: '数量与价格工具',
          sub: '降准、政策利率、结构性工具',
          column: 0,
          refs: ['p2025-pboc-may', 'p2024-sep-package'],
          note: '降准释放长期资金，政策利率下调影响LPR，结构性工具针对科技、消费、小微等领域。',
          uncertainty: '政策利率下降不必然等幅传导至所有贷款利率。',
        },
        {
          id: 'm2',
          label: '银行资金与贷款定价',
          sub: '负债成本、LPR、净息差',
          column: 1,
          refs: ['p2025-pboc-may', 'p2024-sep-package'],
          note: '降准降低银行负债成本，政策利率通过LPR传导；净息差约束会影响银行放贷意愿。',
          uncertainty: '银行风险偏好、信贷需求和净息差共同决定传导幅度。',
        },
        {
          id: 'm3',
          label: '企业与居民融资决策',
          sub: '房贷、经营贷、投资回报',
          column: 2,
          refs: ['p2025-pboc-may', 'p2024-sep-package', 'p2025-consumer-loan'],
          note: '融资成本下降只有在投资回报预期改善时才会转化为新增投资；房贷利率下调也可能先影响提前还款。',
          uncertainty: '“宽货币”到“宽信用”之间可能阻塞，不能自动画等号。',
        },
        {
          id: 'm4',
          label: '投资、消费与就业',
          sub: '总需求与价格',
          column: 3,
          refs: ['p2025-work-report', 'p2025-pboc-may'],
          note: '最终目标对应稳增长、稳就业和价格总水平合理。',
          uncertainty: '时滞通常存在，且与财政、产业、外部需求同时作用。',
        },
      ],
      edges: [
        { from: 'm1', to: 'm2', label: '降成本' },
        { from: 'm2', to: 'm3', label: '条件传导' },
        { from: 'm3', to: 'm4', label: '需求响应' },
      ],
    };
  }

  if (focus === 'fiscal') {
    return {
      nodes: [
        {
          id: 'f1',
          label: '财政扩张工具',
          sub: '赤字、特别国债、专项债',
          column: 0,
          refs: ['p2025-work-report', 'p2025-two-new'],
          note: '赤字率4%左右、新增政府债务11.86万亿元、超长期特别国债1.3万亿元。',
          uncertainty: '预算安排是上限和计划，不等于当期实际支出。',
        },
        {
          id: 'f2',
          label: '政府支出与项目资本金',
          sub: '基建、民生、设备更新',
          column: 1,
          refs: ['p2025-work-report', 'p2025-two-new'],
          note: '专项债和特别国债形成项目资金，设备更新贴息降低企业改造成本。',
          uncertainty: '项目储备、地方配套能力和拨付进度决定资金能否形成实物工作量。',
        },
        {
          id: 'f3',
          label: '企业订单与居民就业',
          sub: '投资、产业链、工资收入',
          column: 2,
          refs: ['p2025-two-new', 'p2025-work-report'],
          note: '政府投资通过订单和就业传导至居民收入，但不同产业的乘数效应不同。',
          uncertainty: '若项目挤占民间投资或地方配套不足，乘数效应可能低于预期。',
        },
        {
          id: 'f4',
          label: '总需求与财政可持续性',
          sub: '增长、就业、债务风险',
          column: 3,
          refs: ['p2025-work-report'],
          note: '扩内需的同时需要观察政府债务、项目收益和长期财政空间。',
          uncertainty: '短期刺激与中期可持续性存在权衡，不能用单一年度数据下结论。',
        },
      ],
      edges: [
        { from: 'f1', to: 'f2', label: '形成支出' },
        { from: 'f2', to: 'f3', label: '订单就业' },
        { from: 'f3', to: 'f4', label: '需求传导' },
      ],
    };
  }

  if (focus === 'private') {
    return {
      nodes: [
        {
          id: 'r1',
          label: '法律与准入规则',
          sub: '民营经济促进法、负面清单',
          column: 0,
          refs: ['p2025-private-law'],
          note: '把平等对待、公平竞争、同等保护写入法律，明确市场准入负面清单制度。',
          uncertainty: '法律条文落地依赖配套制度、地方执法和司法实践。',
        },
        {
          id: 'r2',
          label: '产权预期与融资可得性',
          sub: '稳定预期、差异化金融政策',
          column: 1,
          refs: ['p2025-private-law', 'p2025-pboc-may'],
          note: '法律稳定长期预期，差异化金融政策改善小微民企融资服务。',
          uncertainty: '预期改善难以直接观测，需要用投资、招聘和中长期贷款等指标交叉验证。',
        },
        {
          id: 'r3',
          label: '民企投资与创新',
          sub: '资本开支、研发、市场进入',
          column: 2,
          refs: ['p2025-private-law', 'p2025-two-new'],
          note: '准入与产权保护可能提升民间资本参与重大项目和科技创新的意愿。',
          uncertainty: '需求不足和回报率偏低仍是独立约束，单靠法律无法解决。',
        },
        {
          id: 'r4',
          label: '就业、产出与创新',
          sub: '民间投资、就业、生产率',
          column: 3,
          refs: ['p2025-work-report', 'p2025-private-law'],
          note: '民营经济是就业和创新的重要载体，政策目标指向中长期供给能力。',
          uncertainty: '实施时间较短，当前演示语料不足以评估实际效果。',
        },
      ],
      edges: [
        { from: 'r1', to: 'r2', label: '稳定预期' },
        { from: 'r2', to: 'r3', label: '改善条件' },
        { from: 'r3', to: 'r4', label: '长期作用' },
      ],
    };
  }

  return {
    nodes: [
      {
        id: 'x1',
        label: '宏观政策组合',
        sub: '财政、货币、消费、民生',
        column: 0,
        refs: ['p2025-work-report', 'p2025-pboc-may', 'p2025-consumption'],
        note: '2025年形成“更加积极财政 + 适度宽松货币”，并用消费和民生政策扩大内需。',
        uncertainty: '政策数量多不等于力度可以简单相加，工具之间存在替代和互补。',
      },
      {
        id: 'x2',
        label: '支出、流动性与居民成本',
        sub: '政府支出、融资成本、补贴',
        column: 1,
        refs: ['p2025-work-report', 'p2025-pboc-may', 'p2025-consumer-loan'],
        note: '财政形成政府支出，货币降低融资成本，贴息与补贴直接改变居民和企业价格条件。',
        uncertainty: '传导时滞、执行进度和微观主体风险偏好会造成差异。',
      },
      {
        id: 'x3',
        label: '企业投资与居民消费',
        sub: '投资意愿、耐用品换新',
        column: 2,
        refs: ['p2025-two-new', 'p2025-consumption', 'p2025-private-law'],
        note: '设备更新和以旧换新同时作用于企业投资与居民消费，民营经济政策影响中长期预期。',
        uncertainty: '部分消费可能是提前释放，投资也受订单和回报率约束。',
      },
      {
        id: 'x4',
        label: '内需、就业与增长',
        sub: '总需求、就业、价格',
        column: 3,
        refs: ['p2025-work-report'],
        note: '政策最终目标指向扩大内需、稳就业和经济增长。',
        uncertainty: '本系统只展示机制与观察指标，不输出政策效应的精确估计。',
      },
    ],
    edges: [
      { from: 'x1', to: 'x2', label: '工具发力' },
      { from: 'x2', to: 'x3', label: '条件响应' },
      { from: 'x3', to: 'x4', label: '需求传导' },
    ],
  };
}

function section(
  title: string,
  body: string,
  refs: string[],
  tone: AnalysisSection['tone'],
): AnalysisSection {
  return {
    title,
    body,
    tone,
    refs: refs.map((policyId) => ({ policyId })),
  };
}

function buildSections(
  focus: AnalysisResult['focus'],
  matched: Policy[],
  absent: boolean,
): {
  sections: AnalysisSection[];
  publicSummary: AnalysisResult['publicSummary'];
  decisionSummary: AnalysisResult['decisionSummary'];
} {
  if (absent) {
    return {
      sections: [
        section(
          '当前语料没有直接答案',
          '在本次语料范围内，没有检索到与“房地产税试点”直接对应的政策文件。系统不会用相邻的房地产支持政策替代回答。',
          [],
          'fact',
        ),
        section(
          '能观察到什么',
          '现有语料包含房地产需求端支持政策，例如存量房贷利率调整和首付比例调整，但“房地产税试点”与这些政策属于不同政策工具，不能混为一谈。',
          ['p2024-sep-package'],
          'observation',
        ),
        section(
          '需要补充什么证据',
          '要回答该问题，至少需要补充试点授权文件、征税范围与税率设计、地方实施细则，以及官方评估材料。当前证据不足，系统拒绝给出结论。',
          [],
          'inference',
        ),
      ],
      publicSummary: {
        oneLine: '这个问题的答案，当前资料库里没有。',
        relevance: '资料库里有支持买房的政策，但没有房地产税试点的正式文件，所以不能拿别的政策凑答案。',
        misconception: '“没有检索到”不等于“政策一定不存在”，它只说明当前数据库覆盖不到。',
      },
      decisionSummary: {
        mix: '当前语料未覆盖该政策，不能形成工具组合判断。',
        watch: '需要补充试点授权、税基、税率、免征范围和地方细则。',
        risk: '用房地产支持政策替代房地产税信息，会造成严重的政策误判。',
      },
    };
  }

  if (focus === 'consumption') {
    return {
      sections: [
        section(
          '先看事实：消费政策不是单点发力',
          `本次检索命中 ${matched.length} 项政策，工具覆盖收入支持、以旧换新、消费贷贴息、公积金贷款和育儿补贴。政策目标同时针对“有能力消费”“愿意消费”和“降低生活负担”三个环节。`,
          ['p2025-consumption', 'p2025-consumer-loan', 'p2025-childcare'],
          'fact',
        ),
        section(
          '再看数据：价格条件确实变化了',
          '政策利率由1.70%降至1.50%，再降至1.40%；5年以上首套公积金贷款利率由2.85%降至2.6%。这是政策工具和利率条件的变化，不等于消费已经同步增长。',
          ['p2025-pboc-may', 'p2024-sep-package'],
          'observation',
        ),
        section(
          '最后是推断：传导有前提，也有副作用',
          '可能的路径是“降低信贷与置换成本 → 改善家庭现金流与消费条件 → 消费意愿上升 → 内需修复”。但补贴可能带来提前消费，消费贷贴息有额度和期限限制，政策退出后的回落需要单独观察。',
          ['p2025-consumer-loan', 'p2025-two-new'],
          'inference',
        ),
      ],
      publicSummary: {
        oneLine: '本轮政策并非单一补贴，而是同步降低信贷成本、耐用品换新成本与育儿成本。',
        relevance: '换购家电、汽车，进行住房装修或旅游消费，以及正在偿还住房贷款、养育 3 岁以下子女的家庭，可能通过补贴、贴息或利率下行减少实际支出。能否享受取决于经办机构、额度与地方实施细则。',
        misconception: '补贴并非自动到账，也不必然带来价格下降；部分换新需求可能来自后续消费的提前释放。',
      },
      decisionSummary: {
        mix: '财政补贴与金融贴息并用，消费支持从“发券”转向“降成本 + 增收减负 + 供给升级”。',
        watch: '社零增速、服务消费、消费贷余额、耐用品销量、政策到期后的回落幅度。',
        risk: '需求提前释放、补贴被套利、地方执行差异，以及居民收入预期未改善导致政策乘数偏低。',
      },
    };
  }

  if (focus === 'monetary') {
    return {
      sections: [
        section(
          '事实：数量、价格与结构三类工具同步使用',
          '本轮政策包含降准、7 天期逆回购利率下调和结构性工具降息，并单独下调公积金贷款利率，覆盖银行负债端、贷款定价与重点领域融资三个环节。',
          ['p2025-pboc-may', 'p2024-sep-package'],
          'fact',
        ),
        section(
          '再看数据：政策利率累计下降0.30个百分点',
          '7天期逆回购操作利率从1.70%降至1.50%，再降至1.40%；平均存款准备金率从约7.0%降至约6.2%。这些是已公布的政策变量，不是对经济效果的估计。',
          ['p2025-pboc-may'],
          'observation',
        ),
        section(
          '最后是推断：宽货币不自动等于宽信用',
          '降准增加银行可贷资金，政策利率下降带动LPR，但企业是否借款、银行是否放贷，还取决于投资回报、风险偏好和净息差。居民端也可能先选择提前还贷，而不是新增消费。',
          ['p2025-pboc-may', 'p2024-sep-package'],
          'inference',
        ),
      ],
      publicSummary: {
        oneLine: '降准是让银行可放的钱变多，降息是让借钱变便宜，但借不借、花不花还取决于大家有没有信心。',
        relevance: '有房贷的人可能感受到月供或利息变化；想贷款消费、经营的人可能面对更低的资金成本，但银行仍会审核资质。',
        misconception: '降息不等于所有贷款利率立刻同幅下降，也不等于房价或股市一定上涨。',
      },
      decisionSummary: {
        mix: '总量宽松与结构性工具并用，重点降低银行负债成本和重点领域融资成本。',
        watch: 'LPR、企业中长期贷款、居民中长期贷款、M1与社融、银行净息差。',
        risk: '传导阻滞、资金空转、净息差压力，以及居民和企业主动去杠杆抵消宽松效果。',
      },
    };
  }

  if (focus === 'fiscal') {
    return {
      sections: [
        section(
          '先看事实：财政力度体现在三个数字',
          '2025年赤字率拟按4%左右安排，赤字规模5.66万亿元；新增政府债务总规模11.86万亿元；超长期特别国债1.3万亿元。资金用途覆盖投资建设、土地收储、存量商品房收购、拖欠企业账款和“两新”。',
          ['p2025-work-report', 'p2025-two-new'],
          'fact',
        ),
        section(
          '再看数据：预算安排不等于已形成支出',
          '上述数字是预算和发行安排。真正影响总需求的是资金拨付、项目开工和实物工作量形成，必须继续观察财政支出进度与项目落地，而不能只看赤字率。',
          ['p2025-work-report'],
          'observation',
        ),
        section(
          '最后是推断：乘数效应取决于项目质量',
          '专项债和特别国债通过项目投资形成订单就业，但若项目储备不足、地方配套弱或挤占民间投资，乘数效应可能低于预期。设备更新贴息则更直接作用于企业资本开支。',
          ['p2025-two-new', 'p2025-work-report'],
          'inference',
        ),
      ],
      publicSummary: {
        oneLine: '财政端扩大举债与支出规模，重点投向建设、民生、设备更新与消费品换新。',
        relevance: '承接政府项目、设备更新补贴或民生项目订单的行业，需求端可能发生变化；居民家庭主要通过以旧换新与公共服务供给受益。',
        misconception: '赤字率提高不等于财政支付能力下降，也不意味着资金平均分配至每个家庭。',
      },
      decisionSummary: {
        mix: '赤字、特别国债、专项债与贴息组合，财政从一般支出扩展到项目资本金和消费端。',
        watch: '财政支出进度、专项债投向、基建实物工作量、设备更新投资、地方配套能力。',
        risk: '项目收益不足、地方债务压力、资金闲置或挤占民间投资。',
      },
    };
  }

  if (focus === 'private') {
    return {
      sections: [
        section(
          '先看事实：这是一部基础性法律，不是短期补贴',
          '《民营经济促进法》把平等对待、公平竞争、同等保护、共同发展写入法律，明确市场准入负面清单制度，并在投融资、科技创新和权益保护方面作出规定。',
          ['p2025-private-law'],
          'fact',
        ),
        section(
          '再看数据：实施时间短，效果证据不足',
          '法律自2025年5月20日起施行，当前演示语料没有配套的民间投资、民企贷款或市场准入变化数据。因此只能确认制度安排，不能确认实施效果。',
          ['p2025-private-law'],
          'observation',
        ),
        section(
          '最后是推断：先稳预期，再谈投资',
          '法律可能通过稳定产权预期、降低准入不确定性和改善融资服务，提升民企中长期投资意愿。但需求不足、回报率偏低和地方执法差异仍是独立约束。',
          ['p2025-private-law', 'p2025-pboc-may'],
          'inference',
        ),
      ],
      publicSummary: {
        oneLine: '以专门法律明确民营企业平等进入市场、平等使用生产要素、依法保护权益。',
        relevance: '在民营企业就业、创业或拟投资的群体，获得的是制度保障与维权依据，不涉及直接补贴。',
        misconception: '法律施行不意味着隐性壁垒立即消除，具体问题仍取决于配套规定与地方执行。',
      },
      decisionSummary: {
        mix: '以法治稳定预期，以市场准入和差异化金融政策改善民企经营条件。',
        watch: '民间投资增速、民企中长期贷款、市场准入负面清单调整、涉企执法规范性。',
        risk: '配套制度滞后、地方执行差异、需求不足抵消制度红利。',
      },
    };
  }

  return {
    sections: [
      section(
        '事实：组合政策同步推出',
        `本次检索命中 ${matched.length} 项政策，横跨财政、货币、消费、民生和产业。财政端扩大赤字与政府债券，货币端降准降息，消费端用贴息和以旧换新，民生端直接增加家庭资源。`,
        ['p2025-work-report', 'p2025-pboc-may', 'p2025-consumption'],
        'fact',
      ),
      section(
        '观察：政策变量已发生变化',
        '赤字率拟按 4% 左右安排，新增政府债务 11.86 万亿元；政策利率降至 1.40%，平均存款准备金率降至约 6.2%。上述数值为政策安排或已公布变量，不构成增长效果估计。',
        ['p2025-work-report', 'p2025-pboc-may'],
        'observation',
      ),
      section(
        '推断：政策存在协同，但不宜简单加总',
        '财政支出、货币宽松与消费补贴之间存在互补关系，也可能因执行时滞、居民预期偏弱或项目收益不足而减弱。判断时应同时观察社会融资规模、消费、投资、就业与价格，不宜仅以政策数量为据。',
        ['p2025-consumption', 'p2025-two-new', 'p2025-work-report'],
        'inference',
      ),
    ],
    publicSummary: {
      oneLine: '财政支出、货币政策与消费补贴同步发力，但政策生效不等于居民当期即可感知。',
      relevance: '影响渠道包括就业、信贷成本、住房贷款、耐用品价格与公共服务供给，实际影响取决于收入水平、负债结构与所处行业。',
      misconception: '政策出台不等于经济随即好转；将政策目标混同于政策结果，属常见理解偏差。',
    },
    decisionSummary: {
      mix: '财政扩张、货币宽松、消费支持与民生保障并行，政策重心从投资端向“投资 + 消费”再平衡。',
      watch: '社融与M1、居民消费、固定资产投资、青年就业、核心CPI、民间投资。',
      risk: '政策传导时滞、地方执行能力、居民预期偏弱、外部需求冲击与债务可持续性。',
    },
  };
}

export function analyzeQuery(query: string): AnalysisResult {
  const { matched, candidateCount, terms } = searchPolicies(query);
  const absent =
    matched.length === 0 ||
    (query.includes('房地产税') && !policies.some((policy) => policy.title.includes('房地产税')));

  const focus = detectFocus(query, matched);
  const { sections, publicSummary, decisionSummary } = buildSections(focus, matched, absent);
  const { nodes, edges } = transmissionFor(focus);
  const warnings: string[] = [
    '政策文本中的目标与工具，不等于政策已经产生的效果。',
    '本系统不做因果识别，不输出“政策使某指标变化多少”的精确结论。',
  ];

  if (query.includes('2026')) {
    warnings.push('语料以中央层面公开文件为主，2026年增量政策可能尚未收录，回答前请核对政策库日期。');
  }
  if (matched.some((policy) => policy.sourceLevel === '权威媒体')) {
    warnings.push('命中结果中含1条权威媒体报道，正式研究需补充政策原文快照。');
  }
  if (query.includes('地方') || query.includes('各省')) {
    warnings.push('演示语料仅覆盖中央层面，不含地方实施细则，不能比较地区差异。');
  }
  if (absent) {
    warnings.push('“未检索到”只代表当前语料边界内没有直接文件，不代表现实中一定不存在。');
  }

  const coverageNote = absent
    ? `语料共${policies.length}项材料，本次未命中直接相关政策。系统保留“无答案”结论，不用相邻政策替代。`
    : `语料共${policies.length}项材料，本次命中${candidateCount}项，引用相关度最高的${matched.length}项；其中${matched.filter((policy) => policy.sourceLevel === '政策原文').length}项为政策原文。`;

  return {
    query,
    terms,
    matched,
    matchedCount: candidateCount,
    focus,
    focusLabel: absent ? '覆盖缺口' : focusLabels[focus],
    sections,
    publicSummary,
    decisionSummary,
    nodes,
    edges,
    trace: [
      '解析研究问题与时间范围',
      '检索政策语料并计算相关性',
      `锁定 ${matched.length} 项候选政策`,
      '抽取政策工具、对象与约束条件',
      '关联利率与财政指标',
      '校验来源等级与引用支持',
      '生成三层结论与影响图谱',
    ],
    coverageNote,
    warnings,
    absent,
  };
}
