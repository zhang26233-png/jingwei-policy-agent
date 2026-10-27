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

export interface MechanismWatch {
  label: string;
  what: string;
}

export interface MechanismPathStep {
  at: string;
  what: string;
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
  // 以下四项回答"怎么验证这条链真的在发生"，缺了它们机制就只是说法。
  watch: MechanismWatch[];
  path: MechanismPathStep[];
  counter: string;
  falsify: string;
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

// 每条渠道配一组"先行指标"与"反向情景"：机制链说完了不算完，得说清用什么数据能验证它，
// 以及在什么情况下它会不成立。指标全部是公开发布的月度／季度口径，读者可自行核对。
const WATCH_PATH: Record<ChannelId, { watch: MechanismWatch[]; counter: string }> = {
  fiscal: {
    watch: [
      { label: '专项债发行进度', what: '看新增专项债发行额与投向基建占比，资金是否真的落到项目' },
      { label: '基建投资当月同比', what: '统计局口径，看政策落地后 1—2 个季度是否抬升' },
      { label: '水泥与螺纹钢表观消费', what: '实物工作量指标，比投资额更难被口径调整' },
    ],
    counter: '若专项债发行放量但基建投资同比未起、水泥消费继续走弱，说明资金滞留在拨付环节，链条断在"项目"这一段。',
  },
  transfer: {
    watch: [
      { label: '中央对地方转移支付下达进度', what: '看是否提前下达、是否直达市县' },
      { label: '地方一般公共预算支出同比', what: '财力是否转化为实际支出而非结转' },
      { label: '城投债净融资', what: '化债资源是否缓解平台流动性' },
    ],
    counter: '若转移支付已下达但地方支出同比仍负、清欠进度缓慢，说明财力被用于置换存量债务，未形成新增需求。',
  },
  credit: {
    watch: [
      { label: 'LPR 与贷款加权平均利率', what: '看政策利率是否传导到实体融资成本' },
      { label: '企事业单位中长期贷款同比', what: '多增说明企业在加杠杆，少增说明需求不足' },
      { label: '票据转贴现利率', what: '利率异常走低通常意味着信贷投放靠票据冲量' },
    ],
    counter: '若利率下行但中长期贷款同比少增、票据冲量明显，说明宽货币没有转成宽信用，链条断在"融资需求"。',
  },
  consumption: {
    watch: [
      { label: '社零总额当月同比', what: '剔除汽车后更接近常态化消费' },
      { label: '以旧换新补贴核销进度', what: '补贴额度消耗速度决定政策有效期' },
      { label: '居民消费倾向（支出/收入）', what: '看是需求前置还是真实意愿回升' },
    ],
    counter: '若补贴核销快、社零短期冲高但居民消费倾向未升，说明只是需求前置，退坡后会出现反向拖累。',
  },
  property: {
    watch: [
      { label: '30 城商品房成交面积', what: '高频周度数据，反应最快' },
      { label: '个人住房贷款余额同比', what: '看居民是否真的加杠杆入市' },
      { label: '二手房挂牌价指数', what: '价格预期是否止跌，比成交量更关键' },
    ],
    counter: '若成交量短期回升但二手房价继续下跌、房贷余额不增，说明是降价换量，投资端不会跟着修复。',
  },
  trade: {
    watch: [
      { label: '出口金额当月同比', what: '按美元计价，剔除基数效应看两年平均' },
      { label: '出口集装箱运价指数', what: '量价同升才是真回暖' },
      { label: '新出口订单 PMI', what: '领先出口 1—2 个月' },
    ],
    counter: '若出口同比靠抢出口或低基数支撑、运价与订单分项走弱，说明改善不可持续，链条受外需约束。',
  },
  private: {
    watch: [
      { label: '民间固定资产投资同比', what: '民营是否真的扩产，最直接的口径' },
      { label: '小微企业贷款余额同比', what: '融资可得性是否实质改善' },
      { label: '应收账款平均回收期', what: '清欠政策是否真的缩短账期' },
    ],
    counter: '若贷款余额增长但民间投资同比继续负增长，说明企业拿到钱后不投资，困在预期而非资金。',
  },
  welfare: {
    watch: [
      { label: '城镇调查失业率', what: '含 16—24 岁青年失业率分项' },
      { label: '居民人均可支配收入同比', what: '收入不增则消费刺激难生效' },
      { label: '社保基金支出增速', what: '保障性支出是否实际扩张' },
    ],
    counter: '若补贴已发放但失业率与收入增速未改善，说明补贴规模相对收入基数偏小，只能托底不能拉动。',
  },
  industry: {
    watch: [
      { label: '制造业投资同比', what: '设备更新政策的直接落点' },
      { label: '设备工器具购置投资同比', what: '比制造业投资更贴近"更新"口径' },
      { label: '工业机器人产量', what: '产线改造的实物证据' },
    ],
    counter: '若贴息额度用满但设备购置投资同比回落，说明企业自有资金配套能力不足，中小企业被挤出。',
  },
};

const TIME_PATH = (latency: string): MechanismPathStep[] => [
  { at: 'T+0', what: '文件印发，执行口径与资金额度明确，市场先反应预期' },
  { at: 'T+1 个月', what: '实施细则与项目清单下达，主体开始申报或调整计划' },
  { at: latency.includes('即时') ? 'T+1 个季度' : 'T+1—2 个季度', what: '中间变量出现可观测变化（价格、额度、订单）' },
  { at: 'T+2—4 个季度', what: '宏观结果落表，此时才能判断方向是否成立' },
];


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

    const watchMeta = WATCH_PATH[channel.id];

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
      watch: watchMeta.watch,
      path: TIME_PATH(path.latency),
      counter: watchMeta.counter,
      falsify:
        polarity === 0
          ? '当前方向未定，任何"受益／承压"结论都不成立，需等到有明确资金或指标口径的文件再判。'
          : `若 ${path.latency} 内观察指标没有出现同向变化，应判定这条链未生效，而不是继续等待。`,
    };
  });
}

// 机制全景：不止解读一条政策，把本期前排政策的"主链"压成一张可横向对比的表。
// 一张表回答的是"这批政策分别从哪条路径发力、谁快谁慢"。
export interface MechanismBoardRow {
  policyId: string;
  shortTitle: string;
  grade: string;
  score: number;
  channelId: ChannelId;
  channelName: string;
  directionLabel: string;
  polarity: 1 | -1 | 0;
  latency: string;
  variable: string;
  outcome: string;
  evidence: string;
  chainCount: number;
}

export function buildMechanismBoard(
  items: { policy: Policy; grade: string; score: number }[],
  chainsByPolicy: Record<string, MechanismChain[]>,
): MechanismBoardRow[] {
  const rows: MechanismBoardRow[] = [];
  for (const item of items) {
    const chains = chainsByPolicy[item.policy.id] ?? [];
    if (chains.length === 0) continue;
    // 主链 = 强度最高、渠道权重最大的那一条，与详情里的第一张卡保持一致。
    const primary = chains[0];
    rows.push({
      policyId: item.policy.id,
      shortTitle: item.policy.shortTitle || item.policy.title,
      grade: item.grade,
      score: item.score,
      channelId: primary.channelId,
      channelName: primary.channelName,
      directionLabel: primary.directionLabel,
      polarity: primary.polarity,
      latency: primary.latency,
      variable: primary.links[1]?.label ?? '—',
      outcome: primary.links[3]?.label ?? '—',
      evidence: primary.evidence,
      chainCount: chains.length,
    });
  }
  return rows;
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
