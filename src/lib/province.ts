// 省级影响评估：政策渠道权重 × 省份结构敏感度，输出可解释、可复算的暴露度。
// 这是"结构推演"，不是计量估计；面板中必须同时展示方法与边界。
import type {
  ChannelShare,
  ImpactResult,
  Policy,
  ProvinceProfile,
  ProvinceScore,
} from '../types';

export type ChannelId =
  | 'fiscal'
  | 'transfer'
  | 'credit'
  | 'consumption'
  | 'property'
  | 'trade'
  | 'private'
  | 'welfare'
  | 'industry';

export const CHANNEL_META: Record<ChannelId, { name: string; short: string; desc: string }> = {
  fiscal: { name: '财政支出与政府投资', short: '财政投资', desc: '预算支出、专项债、政府投资' },
  transfer: { name: '转移支付与地方财力', short: '转移支付', desc: '中央对地方转移支付、化债' },
  credit: { name: '信贷供给与融资成本', short: '信贷成本', desc: '降准降息、再贷款、信贷投放' },
  consumption: { name: '居民消费', short: '居民消费', desc: '以旧换新、消费补贴、服务消费' },
  property: { name: '房地产与住房', short: '房地产', desc: '房贷利率、保障房、收储' },
  trade: { name: '外贸与外需', short: '外贸', desc: '出口、关税、跨境、外资' },
  private: { name: '民营与中小微', short: '民营经济', desc: '民营促进、融资可得性、清欠' },
  welfare: { name: '就业社保与民生', short: '就业民生', desc: '就业、社保、育儿、医疗' },
  industry: { name: '产业升级与设备更新', short: '产业升级', desc: '设备更新、技改、制造业' },
};

const CHANNEL_IDS = Object.keys(CHANNEL_META) as ChannelId[];

// 省份结构标签 → 各渠道的敏感系数（定性归纳，非统计估计）
const TAG_CHANNEL: Record<string, Partial<Record<ChannelId, number>>> = {
  manufacturing: { credit: 0.5, industry: 0.7, trade: 0.4, private: 0.3 },
  export: { trade: 0.9, credit: 0.2, industry: 0.2 },
  private: { private: 0.8, credit: 0.4, industry: 0.3 },
  soe: { fiscal: 0.4, industry: 0.4, credit: 0.2 },
  resource: { industry: 0.3, fiscal: 0.2, trade: 0.2 },
  agriculture: { welfare: 0.4, fiscal: 0.3, transfer: 0.3 },
  fiscal_dependent: { transfer: 0.9, fiscal: 0.6, welfare: 0.2 },
  property: { property: 0.8, credit: 0.4, consumption: 0.2 },
  service: { consumption: 0.5, welfare: 0.2, credit: 0.2 },
  population: { consumption: 0.6, welfare: 0.3, property: 0.3 },
  west: { transfer: 0.5, fiscal: 0.4, welfare: 0.2 },
  border: { trade: 0.4, transfer: 0.2 },
};

export const PROVINCES: ProvinceProfile[] = [
  { code: '110000', name: '北京市', short: '北京', tags: ['service', 'soe', 'population', 'industry'], note: '总部经济与服务业占比高，科创与产业政策敏感' },
  { code: '120000', name: '天津市', short: '天津', tags: ['manufacturing', 'soe', 'export', 'property'], note: '重化与装备制造为主，国企与地产敞口并存' },
  { code: '130000', name: '河北省', short: '河北', tags: ['manufacturing', 'soe', 'resource', 'agriculture', 'fiscal_dependent'], note: '钢铁与制造大省，财政自给率偏低' },
  { code: '140000', name: '山西省', short: '山西', tags: ['resource', 'soe', 'fiscal_dependent'], note: '能源型结构，财政对转移支付与煤价依赖较高' },
  { code: '150000', name: '内蒙古自治区', short: '内蒙古', tags: ['resource', 'fiscal_dependent', 'border', 'west'], note: '资源与畜牧业并重，人均转移支付规模较高' },
  { code: '210000', name: '辽宁省', short: '辽宁', tags: ['soe', 'manufacturing', 'fiscal_dependent', 'population'], note: '老工业基地，国企比重大、人口净流出' },
  { code: '220000', name: '吉林省', short: '吉林', tags: ['soe', 'agriculture', 'fiscal_dependent'], note: '农业与汽车制造为主，财政自给率偏低' },
  { code: '230000', name: '黑龙江省', short: '黑龙江', tags: ['soe', 'agriculture', 'fiscal_dependent', 'border'], note: '农业大省，人口流出与财政压力并存' },
  { code: '310000', name: '上海市', short: '上海', tags: ['service', 'export', 'property', 'population'], note: '金融与服务业中心，消费与外需弹性大' },
  { code: '320000', name: '江苏省', short: '江苏', tags: ['manufacturing', 'export', 'private', 'industry'], note: '制造业与出口双强，民营与外资并存' },
  { code: '330000', name: '浙江省', short: '浙江', tags: ['private', 'export', 'manufacturing', 'service'], note: '民营经济密集，对融资可得性高度敏感' },
  { code: '340000', name: '安徽省', short: '安徽', tags: ['manufacturing', 'agriculture', 'industry'], note: '制造业承接与科创并进，人口回流明显' },
  { code: '350000', name: '福建省', short: '福建', tags: ['private', 'export', 'manufacturing'], note: '民营与外贸比重高，侨资活跃' },
  { code: '360000', name: '江西省', short: '江西', tags: ['agriculture', 'manufacturing', 'fiscal_dependent'], note: '农业与制造并重，财政自给率中等偏低' },
  { code: '370000', name: '山东省', short: '山东', tags: ['manufacturing', 'agriculture', 'soe', 'export'], note: '工业门类齐全，国企与农业比重均高' },
  { code: '410000', name: '河南省', short: '河南', tags: ['agriculture', 'population', 'manufacturing', 'fiscal_dependent'], note: '人口与农业大省，消费与就业政策敏感' },
  { code: '420000', name: '湖北省', short: '湖北', tags: ['manufacturing', 'service', 'industry'], note: '汽车与光电子集聚，科创政策敏感' },
  { code: '430000', name: '湖南省', short: '湖南', tags: ['agriculture', 'manufacturing', 'population'], note: '工程机械与农业并重，劳动力输出较多' },
  { code: '440000', name: '广东省', short: '广东', tags: ['manufacturing', 'export', 'private', 'population', 'service'], note: '外贸与民营第一省，外需与消费弹性最大' },
  { code: '450000', name: '广西壮族自治区', short: '广西', tags: ['agriculture', 'border', 'fiscal_dependent', 'west'], note: '沿边开放与农业并重，转移支付依赖较高' },
  { code: '460000', name: '海南省', short: '海南', tags: ['service', 'border', 'agriculture'], note: '旅游消费与自贸港政策主导' },
  { code: '500000', name: '重庆市', short: '重庆', tags: ['manufacturing', 'service', 'west', 'fiscal_dependent'], note: '汽车电子集聚，西部转移支付受益' },
  { code: '510000', name: '四川省', short: '四川', tags: ['population', 'agriculture', 'west', 'fiscal_dependent', 'manufacturing'], note: '人口与农业大省，转移支付规模居前' },
  { code: '520000', name: '贵州省', short: '贵州', tags: ['fiscal_dependent', 'west', 'resource', 'agriculture'], note: '财政自给率偏低，基建与转移支付拉动明显' },
  { code: '530000', name: '云南省', short: '云南', tags: ['fiscal_dependent', 'west', 'border', 'agriculture'], note: '沿边与农业为主，转移支付依赖度高' },
  { code: '540000', name: '西藏自治区', short: '西藏', tags: ['fiscal_dependent', 'west', 'border', 'agriculture'], note: '转移支付依赖度最高，本地市场容量小' },
  { code: '610000', name: '陕西省', short: '陕西', tags: ['resource', 'soe', 'industry', 'west'], note: '能源与科教资源并存，国企比重高' },
  { code: '620000', name: '甘肃省', short: '甘肃', tags: ['fiscal_dependent', 'west', 'resource', 'agriculture'], note: '财政自给率低，能源与农业为主' },
  { code: '630000', name: '青海省', short: '青海', tags: ['fiscal_dependent', 'west', 'resource'], note: '人口少、转移支付依赖度高' },
  { code: '640000', name: '宁夏回族自治区', short: '宁夏', tags: ['fiscal_dependent', 'west', 'agriculture'], note: '体量小，财政与转移支付敏感' },
  { code: '650000', name: '新疆维吾尔自治区', short: '新疆', tags: ['fiscal_dependent', 'west', 'border', 'resource'], note: '沿边与资源型结构，转移支付与基建拉动明显' },
];

const TAG_LABEL: Record<string, string> = {
  manufacturing: '制造业占比高',
  export: '外向型经济',
  private: '民营经济活跃',
  soe: '国有经济比重高',
  resource: '资源型结构',
  agriculture: '农业与乡村人口比重大',
  fiscal_dependent: '财政转移支付依赖高',
  property: '房地产相关度高',
  service: '服务业占比高',
  population: '人口与消费体量大',
  west: '西部政策覆盖',
  border: '沿边开放',
};

export const tagLabel = (tag: string) => TAG_LABEL[tag] ?? tag;

const EXPANSIVE = ['支持', '促进', '扩大', '加大', '提高', '增加', '补贴', '贴息', '降低', '减免', '退税', '缓缴', '优化', '完善', '推动', '鼓励', '培育', '加快', '提前下达', '增发'];
const RESTRICTIVE = ['规范', '严格', '限制', '禁止', '压降', '清理', '整治', '查处', '化解', '防范', '收紧', '审慎', '征收', '开征', '从紧'];
// 税收类文件的方向要看是"征"还是"减"，不能只数关键词。
const TAX_UP = /(征收|开征|提高.{0,6}税率|调整.{0,10}税|恢复征收)/;
const TAX_DOWN = /(减免|优惠|退税|降低.{0,6}税率|免征|缓征|税前扣除)/;

function countWords(text: string, words: string[]) {
  let total = 0;
  for (const word of words) {
    let index = text.indexOf(word);
    while (index !== -1) {
      total += 1;
      index = text.indexOf(word, index + word.length);
    }
  }
  return total;
}

export function detectPolarity(policy: Policy): number {
  const text = `${policy.title}${policy.summary}${policy.excerpt ?? ''}${policy.tags.join('')}`;
  const expansive = countWords(text, EXPANSIVE);
  const restrictive = countWords(text, RESTRICTIVE);
  if (TAX_UP.test(policy.title) && !TAX_DOWN.test(policy.title)) return -1;
  // 按长度归一化成"每千字出现次数"，短文件不会被字数少而误判成方向不明。
  const per1000 = (count: number) => count / Math.max(0.6, text.length / 1000);
  const e = per1000(expansive);
  const r = per1000(restrictive);
  // 只有"约束表述明显占上风"才判为收紧，避免把"规范+支持"混写的文件误判成承压。
  if (restrictive >= 2 && r > e * 1.5) return -1;
  if (e >= 1 && e >= r) return 1;
  // 方向不明确的文件不强行计入受益或承压，避免"全部受益"的假象。
  return 0;
}

const INSTRUMENT_TO_CHANNEL: Record<string, ChannelId[]> = {
  财政: ['fiscal', 'transfer'],
  货币: ['credit'],
  消费: ['consumption'],
  民生: ['welfare'],
  法治: ['private'],
  产业: ['industry'],
};

export function policyChannels(policy: Policy): { id: ChannelId; weight: number }[] {
  if (policy.channels && policy.channels.length > 0) {
    const total = policy.channels.reduce((sum, item) => sum + (item.weight || 0), 0);
    const valid = policy.channels.filter((item) => CHANNEL_IDS.includes(item.id as ChannelId));
    if (valid.length > 0 && total > 0) {
      return valid.map((item) => ({ id: item.id as ChannelId, weight: item.weight / total }));
    }
    if (valid.length > 0) {
      return valid.map((item) => ({ id: item.id as ChannelId, weight: 1 / valid.length }));
    }
  }
  const mapped = new Set<ChannelId>();
  for (const type of policy.instrumentTypes) {
    // "法治"类文件只有在涉及民营/中小企业时才算民营渠道，否则采购、准则类办法会被误读成民营承压。
    if (type === '法治') {
      const text = `${policy.title}${policy.summary}${policy.tags.join('')}`;
      if (/(民营|中小企业|个体工商户|市场主体|公平竞争)/.test(text)) mapped.add('private');
      continue;
    }
    for (const channel of INSTRUMENT_TO_CHANNEL[type] ?? []) mapped.add(channel);
  }
  const list = [...mapped];
  if (list.length === 0) return [{ id: 'fiscal', weight: 1 }];
  return list.map((id) => ({ id, weight: 1 / list.length }));
}

export function evaluateImpact(policies: Policy[]): ImpactResult {
  const usable = policies.filter((policy) => policy.origin !== 'auto' || (policy.bodyLength ?? 0) > 120);
  const set = usable.length > 0 ? usable : policies;

  // 1) 聚合渠道：weight 表示"政策注意力占比"，polarity 表示方向；方向不明的渠道保留展示但不计分。
  const channelSigned: Record<string, number> = {};
  const channelMagnitude: Record<string, number> = {};
  const channelCount: Record<string, number> = {};
  for (const policy of set) {
    const sign = detectPolarity(policy);
    const channels = policyChannels(policy);
    for (const channel of channels) {
      const share = channel.weight / set.length;
      channelMagnitude[channel.id] = (channelMagnitude[channel.id] || 0) + share;
      channelSigned[channel.id] = (channelSigned[channel.id] || 0) + share * sign;
      channelCount[channel.id] = (channelCount[channel.id] || 0) + 1;
    }
  }

  const channels: ChannelShare[] = CHANNEL_IDS.map((id) => {
    const signed = channelSigned[id] || 0;
    const magnitude = channelMagnitude[id] || 0;
    return {
      id,
      name: CHANNEL_META[id].name,
      short: CHANNEL_META[id].short,
      weight: magnitude,
      polarity: (signed > 0.0005 ? 1 : signed < -0.0005 ? -1 : 0) as 1 | -1 | 0,
      policyCount: channelCount[id] || 0,
    };
  })
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  const directional = channels.filter((channel) => channel.polarity !== 0);

  // 2) 省份原始敏感度
  const raw = PROVINCES.map((province) => {
    const sensitivity: Record<string, number> = {};
    for (const id of CHANNEL_IDS) sensitivity[id] = 0;
    for (const tag of province.tags) {
      const mapping = TAG_CHANNEL[tag] ?? {};
      for (const [id, value] of Object.entries(mapping)) {
        sensitivity[id] += value ?? 0;
      }
    }
    return { province, sensitivity };
  });

  // 3) 每个渠道在全域内归一化，避免量纲不同导致大省恒高
  const maxByChannel: Record<string, number> = {};
  for (const id of CHANNEL_IDS) {
    maxByChannel[id] = Math.max(...raw.map((item) => item.sensitivity[id]), 0.0001);
  }

  const scored = raw.map(({ province, sensitivity }) => {
    // 先算到展示口径（保留 1 位小数），再由同一组数字汇总，保证"拆解相加 = 受益/承压"。
    const contributions = directional
      .map((channel) => {
        const sens = sensitivity[channel.id] / maxByChannel[channel.id];
        const signed = channel.weight * sens * channel.polarity * 100;
        return {
          id: channel.id,
          name: channel.name,
          short: channel.short,
          value: Math.round(signed * 10) / 10,
        };
      })
      .filter((contribution) => Math.abs(contribution.value) >= 0.05)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

    const benefit = contributions.reduce((sum, item) => (item.value > 0 ? sum + item.value : sum), 0);
    const pressure = contributions.reduce((sum, item) => (item.value < 0 ? sum - item.value : sum), 0);

    return {
      ...province,
      benefit: Math.round(benefit * 10) / 10,
      pressure: Math.round(pressure * 10) / 10,
      exposure: Math.round((benefit + pressure) * 10) / 10,
      contributions,
      drivers: [],
      rank: 0,
    } as ProvinceScore;
  });

  const maxExposure = Math.max(...scored.map((item) => item.exposure), 0.0001);
  const provinces = scored
    .map((item) => ({
      ...item,
      exposure: Math.round((item.exposure / maxExposure) * 1000) / 10,
      drivers: item.contributions
        .filter((contribution) => Math.abs(contribution.value) >= 1)
        .slice(0, 3)
        .map((contribution) => {
          const direction = contribution.value >= 0 ? '受益' : '承压';
          return `${contribution.short}渠道${direction}（贡献 ${Math.abs(contribution.value).toFixed(1)}）`;
        }),
    }))
    .sort((a, b) => b.exposure - a.exposure)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const exposures = provinces.map((item) => item.exposure);
  const mean = exposures.reduce((sum, value) => sum + value, 0) / (exposures.length || 1);
  const top5 = provinces.slice(0, 5).reduce((sum, item) => sum + item.exposure, 0);
  const total = exposures.reduce((sum, value) => sum + value, 0) || 1;

  return {
    policyIds: set.map((policy) => policy.id),
    policies: set.map((policy) => ({
      id: policy.id,
      title: policy.shortTitle || policy.title,
      date: policy.date,
      issuer: policy.issuer,
    })),
    channels,
    provinces,
    national: {
      mean: Math.round(mean * 10) / 10,
      max: Math.max(...exposures, 0),
      min: Math.min(...exposures, 0),
      concentration: Math.round((top5 / total) * 1000) / 10,
    },
    caveats: [
      '省级得分 = 政策渠道权重 × 省份结构敏感度，属于可解释的结构推演，不是计量估计，也不是政策效果的预测值。',
      '省份结构标签依据公开统计口径做定性归纳，可在下方逐省查看；正式研究应替换为统计年鉴或投入产出表数据。',
      '模型不含地方实施细则、转移支付分配公式与项目落地进度，因此只能比较“受影响程度”，不能比较“受益金额”。',
      directional.length < channels.length
        ? `有 ${channels.length - directional.length} 条渠道的政策方向不明确（扩张与规范表述并存），保留展示但不计入省级打分。`
        : '全部渠道都识别出明确方向，受益侧与承压侧按政策措辞方向划分。',
      '香港特别行政区、澳门特别行政区、台湾省不参与本模型打分，地图中灰显。',
    ],
    generatedAt: new Date().toISOString(),
  };
}
