import type { IndicatorSeries, Policy } from '../types';

export const CORPUS_META = {
  version: 'MVP 0.1',
  snapshot: '2026-10-26',
  range: '2024.09 — 2025.08',
  policyCount: 8,
  sourceCount: 8,
  scope: '中央层面政策（演示快照）',
};

export const policies: Policy[] = [
  {
    id: 'p2025-work-report',
    shortTitle: '2025年政府工作报告',
    title: '政府工作报告——2025年3月5日在第十四届全国人民代表大会第三次会议上',
    issuer: '国务院',
    date: '2025-03-05',
    effective: '2025年度',
    level: '中央',
    theme: '宏观总量',
    instrumentTypes: ['财政', '货币'],
    instruments: ['赤字率4%左右', '超长期特别国债1.3万亿元', '特别国债5000亿元', '地方专项债4.4万亿元', '适时降准降息'],
    targets: ['居民消费', '企业投资', '房地产市场', '科技创新', '地方财政'],
    goals: ['稳增长', '扩内需', '防风险', '稳预期'],
    summary: '明确2025年“更加积极的财政政策 + 适度宽松的货币政策”组合，财政赤字率提高至4%左右，并安排较大规模政府债券。',
    excerpt:
      '今年赤字率拟按4%左右安排、比上年提高1个百分点，赤字规模5.66万亿元、比上年增加1.6万亿元。一般公共预算支出规模29.7万亿元、比上年增加1.2万亿元。拟发行超长期特别国债1.3万亿元、比上年增加3000亿元。拟发行特别国债5000亿元，支持国有大型商业银行补充资本。拟安排地方政府专项债券4.4万亿元、比上年增加5000亿元。',
    clauses: [
      {
        label: '财政政策',
        text: '今年合计新增政府债务总规模11.86万亿元、比上年增加2.9万亿元，财政支出强度明显加大。',
      },
      {
        label: '货币政策',
        text: '实施适度宽松的货币政策。发挥好货币政策工具的总量和结构双重功能，适时降准降息，保持流动性充裕。',
      },
      {
        label: '民生导向',
        text: '经济政策的着力点更多转向惠民生、促消费，以消费提振畅通经济循环。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/yaowen/liebiao/202503/content_7010225.htm',
    sourceLevel: '政策原文',
    status: '现行',
    related: ['p2025-consumption', 'p2025-pboc-may'],
    tags: ['稳增长', '财政', '货币', '赤字率', '特别国债', '专项债', '降准', '降息', '内需', '投资', '消费', '房地产', '宏观政策'],
  },
  {
    id: 'p2025-consumption',
    shortTitle: '提振消费专项行动方案',
    title: '中共中央办公厅 国务院办公厅印发《提振消费专项行动方案》',
    issuer: '中共中央办公厅、国务院办公厅',
    date: '2025-03-16',
    effective: '2025年起',
    level: '中央',
    theme: '提振消费',
    instrumentTypes: ['消费', '财政', '民生'],
    instruments: ['城乡居民增收', '消费品以旧换新', '个人消费贷款贴息', '住房公积金支持', '育儿补贴制度研究'],
    targets: ['居民家庭', '汽车与家电消费', '住房消费', '服务消费', '中小微企业'],
    goals: ['大力提振消费', '全方位扩大国内需求', '以增收减负提升消费能力'],
    summary: '从收入、保障、供给、环境和限制清理八个方面部署30项任务，既处理“能消费”，也处理“敢消费”和“愿消费”。',
    excerpt:
      '为大力提振消费，全方位扩大国内需求，以增收减负提升消费能力，以高质量供给创造有效需求，以优化消费环境增强消费意愿，针对性解决制约消费的突出矛盾问题，现就实施提振消费专项行动制定本方案。',
    clauses: [
      {
        label: '城乡居民增收',
        text: '促进工资性收入合理增长。实施重点领域、重点行业、城乡基层和中小微企业就业支持计划。健全最低工资标准调整机制。',
      },
      {
        label: '大宗消费',
        text: '用好超长期特别国债资金，支持地方加力扩围实施消费品以旧换新，推动汽车、家电、家装等大宗耐用消费品绿色化、智能化升级。',
      },
      {
        label: '信贷支持',
        text: '鼓励金融机构在风险可控前提下加大个人消费贷款投放力度。2025年对符合条件的个人消费贷款和消费领域的服务业经营主体贷款给予财政贴息。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/zhengce/202503/content_7013808.htm',
    sourceLevel: '政策原文',
    status: '现行',
    related: ['p2025-work-report', 'p2025-consumer-loan', 'p2025-childcare'],
    tags: ['提振消费', '消费', '内需', '以旧换新', '消费贷', '贴息', '住房', '公积金', '服务消费', '就业', '收入', '育儿'],
  },
  {
    id: 'p2025-pboc-may',
    shortTitle: '2025年5月一揽子货币政策',
    title: '中国人民银行：5月8日起降息，15日起降准',
    issuer: '中国人民银行',
    date: '2025-05-07',
    effective: '2025-05-08 / 2025-05-15',
    level: '中央',
    theme: '货币政策',
    instrumentTypes: ['货币'],
    instruments: ['降准0.5个百分点', '7天期逆回购利率降至1.40%', '结构性货币政策工具降息0.25个百分点', '公积金贷款利率下调0.25个百分点', '再贷款额度增加'],
    targets: ['商业银行', '实体经济', '居民住房贷款', '科技与设备更新', '服务消费与养老', '小微与涉农'],
    goals: ['保持流动性充裕', '降低社会综合融资成本', '支持实体经济和消费'],
    summary: '一次包含数量、价格和结构性工具的货币政策组合：降准释放长期流动性，政策利率下调带动LPR，结构性工具和公积金贷款利率同步调整。',
    excerpt:
      '从2025年5月8日起，公开市场7天期逆回购操作利率由此前的1.50%调整为1.40%。公开市场14天期逆回购和临时正、逆回购的操作利率继续在公开市场7天期逆回购操作利率上加减点确定，加减点幅度保持不变。自2025年5月15日起，下调金融机构存款准备金率0.5个百分点（不含已执行5%存款准备金率的金融机构），下调汽车金融公司和金融租赁公司存款准备金率5个百分点。',
    clauses: [
      {
        label: '降准',
        text: '下调金融机构存款准备金率0.5个百分点，预计向市场提供长期流动性约1万亿元；整体存款准备金率平均水平从6.6%降至6.2%。',
      },
      {
        label: '政策利率',
        text: '7天期逆回购操作利率由1.50%降至1.40%，预计带动贷款市场报价利率（LPR）同步下行约0.1个百分点。',
      },
      {
        label: '公积金贷款',
        text: '降低个人住房公积金贷款利率0.25个百分点，5年期以上首套房利率由2.85%降至2.6%。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/zhengce/jiedu/tujie/202505/content_7022782.htm',
    sourceLevel: '官方发布',
    status: '已实施',
    related: ['p2025-work-report', 'p2024-sep-package'],
    tags: ['货币政策', '降准', '降息', '政策利率', '逆回购', 'LPR', '流动性', '公积金', '房贷', '融资成本', '实体经济', '稳增长'],
  },
  {
    id: 'p2024-sep-package',
    shortTitle: '2024年9月一揽子金融政策',
    title: '国务院新闻办发布会：金融支持经济高质量发展有关情况',
    issuer: '中国人民银行、金融监管总局、中国证监会',
    date: '2024-09-24',
    effective: '2024年9月起',
    level: '中央',
    theme: '货币政策',
    instrumentTypes: ['货币', '消费'],
    instruments: ['降准0.5个百分点', '7天期逆回购利率降至1.5%', '存量房贷利率下调', '二套房最低首付比例降至15%', '资本市场支持工具'],
    targets: ['商业银行', '存量房贷家庭', '房地产市场', '资本市场', '实体经济'],
    goals: ['加大货币政策调控强度', '稳定房地产市场', '支持经济稳增长'],
    summary: '一揽子金融政策同时覆盖总量、房地产和资本市场。存量房贷利率调整直接减少部分家庭利息支出，但属于发布会披露，正式研究应回补央行原文。',
    excerpt:
      '中国人民银行宣布，近期将下调存款准备金率0.5个百分点，向金融市场提供长期流动性约1万亿元。同时，降低中央银行政策利率，7天逆回购操作利率下调0.2个百分点，从目前的1.7%降为1.5%。引导贷款市场报价利率和存款利率同步下行，保持商业银行净息差稳定。',
    clauses: [
      {
        label: '存量房贷',
        text: '引导商业银行将存量房贷利率降至新发房贷利率附近，预计平均降幅大约在0.5个百分点左右。',
      },
      {
        label: '首付比例',
        text: '统一首套房和二套房的房贷最低首付比例，将全国层面的二套房贷款最低首付比例由25%下调到15%。',
      },
      {
        label: '资本市场',
        text: '创设证券、基金、保险公司互换便利，创设股票回购增持专项再贷款。',
      },
    ],
    sourceName: '央视网',
    sourceUrl: 'https://news.cctv.com/2024/09/24/ARTIgamrTbS0nHbF4WWOyi4J240924.shtml',
    sourceLevel: '权威媒体',
    status: '已实施',
    related: ['p2025-pboc-may', 'p2025-consumption'],
    caveat: '本条当前链接为权威媒体报道。正式版应补充中国人民银行原文及发布会实录快照。',
    tags: ['货币政策', '降准', '降息', '存量房贷', '首付比例', '房地产', '资本市场', '流动性', '融资成本', '稳增长'],
  },
  {
    id: 'p2025-childcare',
    shortTitle: '育儿补贴制度实施方案',
    title: '中共中央办公厅 国务院办公厅印发《育儿补贴制度实施方案》',
    issuer: '中共中央办公厅、国务院办公厅',
    date: '2025-07-28',
    effective: '2025-01-01',
    level: '中央',
    theme: '民生保障',
    instrumentTypes: ['民生', '财政', '消费'],
    instruments: ['每孩每年3600元现金补贴', '中央财政共同事权转移支付', '补贴免征个人所得税'],
    targets: ['3周岁以下婴幼儿家庭', '生育家庭', '低收入家庭'],
    goals: ['降低家庭生育养育成本', '建设生育友好型社会', '改善民生'],
    summary: '全国统一、直接发放的育儿现金补贴，按每孩每年3600元发放至3周岁；对家庭是直接可支配资源增加。',
    excerpt:
      '从2025年1月1日起，对符合法律法规规定生育的3周岁以下婴幼儿发放补贴，至其年满3周岁。育儿补贴按年发放，现阶段国家基础标准为每孩每年3600元。其中，对2025年1月1日之前出生、不满3周岁的婴幼儿，按应补贴月数折算计发补贴。对按照育儿补贴制度规定发放的育儿补贴免征个人所得税。',
    clauses: [
      {
        label: '补贴对象',
        text: '从2025年1月1日起，对符合法律法规规定生育的3周岁以下婴幼儿发放补贴，至其年满3周岁。',
      },
      {
        label: '补贴标准',
        text: '现阶段国家基础标准为每孩每年3600元，按年发放。',
      },
      {
        label: '财政分担',
        text: '中央财政自2025年起设立共同财政事权转移支付项目“育儿补贴补助资金”，按比例对东、中、西部地区予以补助。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/zhengce/202507/content_7034564.htm',
    sourceLevel: '政策原文',
    status: '现行',
    related: ['p2025-consumption'],
    tags: ['育儿补贴', '民生', '生育', '家庭', '消费', '可支配收入', '财政', '低收入'],
  },
  {
    id: 'p2025-consumer-loan',
    shortTitle: '个人消费贷款财政贴息',
    title: '《个人消费贷款财政贴息政策实施方案》',
    docNo: '财金〔2025〕80号',
    issuer: '财政部、中国人民银行、金融监管总局',
    date: '2025-08-04',
    effective: '2025-09-01 至 2026-08-31',
    level: '中央',
    theme: '提振消费',
    instrumentTypes: ['财政', '消费', '货币'],
    instruments: ['年贴息比例1个百分点', '单笔5万元以下消费贴息', '重点领域大额消费贴息', '中央与省级财政9:1分担'],
    targets: ['居民个人消费贷款借款人', '汽车、养老生育、教育、文旅、家装、电子产品、医疗等重点消费'],
    goals: ['降低居民消费信贷成本', '释放居民消费潜力', '财政与金融政策协同'],
    summary: '用财政资金补贴消费贷款利息，直接把“借钱消费”的资金成本压低；但有期限、有额度上限、有重点领域限制。',
    excerpt:
      '2025年9月1日至2026年8月31日期间，居民个人使用贷款经办机构发放的个人消费贷款（不含信用卡业务）中实际用于消费，且贷款经办机构可通过贷款发放账户等识别借款人相关消费交易信息的部分，可按规定享受贴息政策。贴息范围包括单笔5万元以下消费，以及单笔5万元及以上的家用汽车、养老生育、教育培训、文化旅游、家居家装、电子产品、健康医疗等重点领域消费。',
    clauses: [
      {
        label: '贴息标准',
        text: '年贴息比例为1个百分点，且最高不超过贷款合同利率的50%，中央财政、省级财政分别承担贴息资金的90%、10%。',
      },
      {
        label: '额度上限',
        text: '每名借款人在一家贷款经办机构可享受的全部个人消费贷款累计贴息上限为3000元，其中单笔5万元以下贷款累计贴息上限为1000元。',
      },
      {
        label: '政策期限',
        text: '政策执行期为2025年9月1日至2026年8月31日，到期后可视实施效果研究延长或扩大范围。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/lianbo/bumen/202508/content_7036211.htm',
    sourceLevel: '政策原文',
    status: '已实施',
    related: ['p2025-consumption', 'p2025-pboc-may'],
    tags: ['消费贷', '贴息', '消费', '财政', '信贷', '汽车', '家电', '教育', '文旅', '家装', '融资成本', '居民'],
  },
  {
    id: 'p2025-private-law',
    shortTitle: '民营经济促进法',
    title: '中华人民共和国民营经济促进法',
    issuer: '全国人民代表大会常务委员会',
    date: '2025-04-30',
    effective: '2025-05-20',
    level: '中央',
    theme: '民营经济',
    instrumentTypes: ['法治', '产业'],
    instruments: ['市场准入负面清单', '公平竞争审查', '差异化金融服务', '知识产权保护', '规范涉企执法'],
    targets: ['民营经济组织', '民营企业家', '中小微企业', '金融机构'],
    goals: ['稳定民营经济预期', '保障公平竞争', '改善投融资环境'],
    summary: '第一部专门促进民营经济发展的基础性法律，把平等对待、公平竞争、同等保护写入法律制度，重点影响预期与融资环境。',
    excerpt:
      '民营经济是社会主义市场经济的重要组成部分，是推进中国式现代化的生力军，是高质量发展的重要基础，是推动我国全面建成社会主义现代化强国、实现中华民族伟大复兴的重要力量。促进民营经济持续、健康、高质量发展，是国家长期坚持的重大方针政策。',
    clauses: [
      {
        label: '公平竞争',
        text: '国家实行全国统一的市场准入负面清单制度。市场准入负面清单以外的领域，包括民营经济组织在内的各类经济组织可以依法平等进入。',
      },
      {
        label: '投资融资',
        text: '国务院有关部门依据职责发挥货币政策工具和宏观信贷政策的激励约束作用，对金融机构向小型微型民营经济组织提供金融服务实施差异化政策。',
      },
      {
        label: '权益保护',
        text: '民营经济组织与其他各类经济组织享有平等的法律地位、市场机会和发展权利。',
      },
    ],
    sourceName: '中国政府网',
    sourceUrl: 'https://www.gov.cn/yaowen/liebiao/202504/content_7022018.htm',
    sourceLevel: '政策原文',
    status: '现行',
    related: ['p2025-work-report'],
    tags: ['民营经济', '民营企业', '法治', '融资', '市场准入', '公平竞争', '产权', '预期', '投资', '就业', '中小微'],
  },
  {
    id: 'p2025-two-new',
    shortTitle: '2025年“两新”加力扩围',
    title: '关于2025年加力扩围实施大规模设备更新和消费品以旧换新政策的通知',
    docNo: '发改环资〔2025〕13号',
    issuer: '国家发展改革委、财政部',
    date: '2025-01-05',
    effective: '2025年度',
    level: '中央',
    theme: '产业与消费',
    instrumentTypes: ['财政', '产业', '消费'],
    instruments: ['超长期特别国债支持设备更新', '设备更新贷款贴息', '消费品以旧换新补贴', '数码产品购新补贴15%'],
    targets: ['工业与服务业企业', '汽车与家电消费者', '数码产品消费者', '回收循环利用企业'],
    goals: ['扩大有效投资', '释放耐用消费品需求', '推动产业绿色化智能化升级'],
    summary: '用超长期特别国债同时撬动企业设备更新和居民耐用品换新，是财政资金连接投资与消费的典型政策。',
    excerpt:
      '增加超长期特别国债支持重点领域设备更新的资金规模，在继续支持工业、用能设备、能源电力、交通运输、物流、环境基础设施、教育、文旅、医疗、老旧电梯等设备更新基础上，将支持范围进一步扩展至电子信息、安全生产、设施农业等领域，重点支持高端化、智能化、绿色化设备应用。',
    clauses: [
      {
        label: '设备更新贴息',
        text: '对符合有关条件经营主体设备更新相关的银行贷款本金，在中央财政贴息1.5个百分点基础上，国家发展改革委安排超长期特别国债资金进行额外贴息。',
      },
      {
        label: '数码产品补贴',
        text: '对个人消费者购买手机、平板、智能手表手环等3类数码产品，按产品销售价格的15%给予补贴，每件补贴不超过500元。',
      },
      {
        label: '家电扩围',
        text: '享受以旧换新补贴的家电产品由8类增加到12类，单件最高可享受销售价格20%的补贴。',
      },
    ],
    sourceName: '国家发展改革委',
    sourceUrl: 'https://zfxxgk.ndrc.gov.cn/wap/iteminfo.jsp?id=20470',
    sourceLevel: '政策原文',
    status: '已实施',
    related: ['p2025-consumption', 'p2025-work-report'],
    tags: ['两新', '设备更新', '以旧换新', '超长期特别国债', '消费', '投资', '家电', '汽车', '数码产品', '贴息', '产业升级'],
  },
];

export const indicatorSeries: IndicatorSeries[] = [
  {
    id: 'policy-rate',
    name: '7天期逆回购操作利率',
    unit: '%',
    note: '政策利率两次下调，累计下降0.30个百分点。',
    source: '中国人民银行；中国政府网',
    points: [
      { date: '2024-07', value: 1.7, label: '1.70%' },
      { date: '2024-09', value: 1.5, label: '1.50%' },
      { date: '2025-05', value: 1.4, label: '1.40%' },
    ],
  },
  {
    id: 'rrr',
    name: '金融机构平均存款准备金率',
    unit: '%',
    note: '两次各下调0.5个百分点，平均水平由约7.0%降至约6.2%。',
    source: '中国人民银行公开信息',
    points: [
      { date: '2024-02', value: 7.0, label: '约7.0%' },
      { date: '2024-09', value: 6.6, label: '约6.6%' },
      { date: '2025-05', value: 6.2, label: '约6.2%' },
    ],
  },
];

export const fiscalFacts = [
  {
    label: '赤字率',
    value: '4% 左右',
    note: '比上年提高1个百分点',
    source: 'p2025-work-report',
  },
  {
    label: '新增政府债务',
    value: '11.86 万亿元',
    note: '比上年增加2.9万亿元',
    source: 'p2025-work-report',
  },
  {
    label: '政策利率',
    value: '1.40%',
    note: '2025年5月8日起',
    source: 'p2025-pboc-may',
  },
  {
    label: '平均存款准备金率',
    value: '6.2%',
    note: '2025年5月降准后',
    source: 'p2025-pboc-may',
  },
];

// ── 语料装配：内置校订语料 + 后端自动采集语料合并 ───────────────────────────
const normalizeUrl = (url: string) =>
  String(url || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();

for (const policy of policies) {
  if (!policy.origin) policy.origin = 'seed';
}

export function applyAutoPolicies(incoming: Policy[]): number {
  const known = new Set(policies.map((policy) => normalizeUrl(policy.sourceUrl)));
  let added = 0;
  for (const item of incoming) {
    const key = normalizeUrl(item.sourceUrl);
    if (!key || known.has(key)) continue;
    known.add(key);
    policies.push({ ...item, origin: 'auto' });
    added += 1;
  }
  if (added > 0) {
    policies.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }
  CORPUS_META.policyCount = policies.length;
  CORPUS_META.sourceCount = new Set(policies.map((policy) => policy.sourceName)).size;
  const dates = policies.map((policy) => policy.date).filter(Boolean).sort();
  if (dates.length > 0) {
    CORPUS_META.range = `${dates[0].slice(0, 7).replace('-', '.')} — ${dates[dates.length - 1]
      .slice(0, 7)
      .replace('-', '.')}`;
  }
  return added;
}

export function corpusStats() {
  const auto = policies.filter((policy) => policy.origin === 'auto');
  const withBody = auto.filter((policy) => (policy.bodyLength ?? 0) > 200);
  return {
    total: policies.length,
    seed: policies.length - auto.length,
    auto: auto.length,
    autoWithBody: withBody.length,
    sources: new Set(policies.map((policy) => policy.sourceName)).size,
    earliest: policies.map((p) => p.date).filter(Boolean).sort()[0] ?? '',
    latest: policies.map((p) => p.date).filter(Boolean).sort().slice(-1)[0] ?? '',
  };
}
