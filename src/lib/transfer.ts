// 央地传导：中央发了文件，地方有没有跟、什么时候跟、差几天。
//
// 口径先说清楚（页面上也要写）：
//  - 这是"主题级"配对，不是逐份文件级配对。中央文件与地方文件之间没有官方对应编号，
//    只能按主题关键词匹配，所以"未观察到"只代表在已抓取的地方栏目里没找到标题命中的文件，
//    不等于地方没有落实（很多落实在部门文件、会议纪要或不出文的执行里）。
//  - 地方语料只覆盖少数省级单位（各省门户的栏目结构、反爬强度差别很大），
//    覆盖率必须在页面上写明，不能用空白格子暗示"全国一致"。

export interface LocalItem {
  title: string;
  date: string;
  url: string;
  text?: string;
}

export interface LocalProvince {
  id: string;
  name: string;
  short: string;
  level: string;
  kind: string;
  list: string;
  count: number;
  earliest: string | null;
  latest: string | null;
  errors: string[];
  items: LocalItem[];
}

export interface LocalPayload {
  ready: boolean;
  at: string | null;
  since?: string;
  coverage: { crawled: number; attempted: number; totalProvinces: number } | null;
  provinces: LocalProvince[];
}

export interface ThemeDef {
  id: string;
  theme: string;
  short: string;
  centralTitle: RegExp;
  // 兜底日期：语料里找不到该中央文件时仍能定位中央发文日
  centralDate: string;
  keys: RegExp;
  why: string;
}

// 八个主题都对应本项目语料里真实存在的中央文件，日期以原文标注为准。
export const THEMES: ThemeDef[] = [
  {
    id: 'sports',
    theme: '体育赛事激发消费',
    short: '体育赛事',
    centralTitle: /发展体育赛事激发消费活力/,
    centralDate: '2026-09-30',
    keys: /体育赛事|赛事经济|赛事活动/,
    why: '国办发文要求各地丰富赛事供给、以赛事带动消费，属于典型的需要地方接续办赛和配套的场景。',
  },
  {
    id: 'elderly',
    theme: '普惠养老服务价格机制',
    short: '普惠养老',
    centralTitle: /普惠养老服务提质扩面/,
    centralDate: '2026-10-16',
    keys: /养老服务|普惠养老|养老机构/,
    why: '价格机制需要省市定价目录与补贴政策衔接，地方不接就落不了地。',
  },
  {
    id: 'housing',
    theme: '居民购房贷款贴息',
    short: '购房贴息',
    centralTitle: /居民购房贷款贴息/,
    centralDate: '2026-09-29',
    keys: /购房.{0,10}贴息|住房贷款贴息|购房贷款/,
    why: '贴息资金由中央与地方分担，地方需要出台实施细则才能执行。',
  },
  {
    id: 'arrears',
    theme: '中小企业回款难治理',
    short: '清欠回款',
    centralTitle: /中小企业回款难/,
    centralDate: '2026-09-10',
    keys: /清欠|拖欠.{0,12}(账款|款项)|回款难|中小企业款项/,
    why: '清欠需要地方建立台账与督办机制，是观察地方执行力度的高频切口。',
  },
  {
    id: 'ai-jobs',
    theme: '人工智能与就业友好',
    short: 'AI+就业',
    centralTitle: /构建就业友好型发展方式/,
    centralDate: '2026-10-23',
    keys: /人工智能.{0,18}就业|就业友好|AI.{0,6}就业/,
    why: '新议题，地方是否跟进、跟得多快，直接反映对新兴政策的响应速度。',
  },
  {
    id: 'agri-insurance',
    theme: '农业保险高质量发展',
    short: '农业保险',
    centralTitle: /加快农业保险高质量发展/,
    centralDate: '2026-09-11',
    keys: /农业保险/,
    why: '农业保险以省为单位组织，是最容易观察到"一省一策"的领域。',
  },
  {
    id: 'consumption-infra',
    theme: '消费基础设施建设',
    short: '消费基建',
    centralTitle: /加强消费基础设施建设/,
    centralDate: '2026-10-30',
    keys: /消费基础设施|消费投资/,
    why: '文件明确要求地方配套项目清单，属于有硬性接续要求的政策。',
  },
  {
    id: 'rv',
    theme: '房车与自驾消费',
    short: '房车消费',
    centralTitle: /促进房车消费/,
    centralDate: '2026-09-18',
    keys: /房车|自驾车|露营/,
    why: '涉及营地用地、车辆管理等地方事权，中央文件只是开口子，落地看地方。',
  },
];

// 地方文件得是"政策工具"而不是通知类事务性文件；标题里没有这些词的多为会议、批复、公告。
const DOC_LIKE = /(通知|意见|方案|办法|措施|规划|细则|实施|规定|指引|清单|计划)/;

export type CellStatus = 'respond' | 'pre' | 'likely' | 'none' | 'uncovered';

export interface Cell {
  status: CellStatus;
  date?: string;
  lag?: number;
  title?: string;
  url?: string;
  later?: number;
  // 疑似承接：标题没命中，但正文里同一主题出现多次且晚于中央发文
  mentions?: number;
}

export interface ThemeRow {
  theme: ThemeDef;
  centralDate: string;
  centralDoc: { id: string; title: string } | null;
  cells: Record<string, Cell>;
  responders: number;
  lags: number[];
  medianLag: number | null;
}

export interface TransferResult {
  rows: ThemeRow[];
  provinces: (LocalProvince & { usable: boolean; spanDays: number; reason: string | null })[];
  coverage: {
    attempted: number;
    usable: number;
    totalProvinces: number;
    items: number;
    since: string;
    latest: string | null;
  };
  summary: {
    themes: number;
    respondedThemes: number;
    totalPairs: number;
    respondPairs: number;
    prePairs: number;
    fastest: { province: string; theme: string; lag: number } | null;
    slowest: { province: string; theme: string; lag: number } | null;
    medianLag: number | null;
  };
  findings: string[];
}

const dayDiff = (a: string, b: string) =>
  Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / 86400000);

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
};

// 可用性闸门：条目太少或时间跨度太短，空格子会被误读成"地方没做"，宁可标成不可用。
const GATE = { minItems: 30, minSpanDays: 60 };

export function buildTransfer(payload: LocalPayload | null, policies: { id: string; title: string; date: string }[]): TransferResult | null {
  if (!payload?.ready || payload.provinces.length === 0) return null;

  const centralIndex = policies.map((policy) => ({ id: policy.id, title: policy.title, date: policy.date }));

  const provinces = payload.provinces.map((province) => {
    const spanDays =
      province.earliest && province.latest ? dayDiff(province.latest, province.earliest) : 0;
    const tooFew = province.count < GATE.minItems;
    const tooShort = spanDays < GATE.minSpanDays;
    return {
      ...province,
      spanDays,
      usable: !tooFew && !tooShort,
      reason: tooFew
        ? `仅抓到 ${province.count} 条，低于 ${GATE.minItems} 条可用门槛`
        : tooShort
          ? `时间跨度只有 ${spanDays} 天，覆盖不到本期中央文件`
          : null,
    };
  });

  const usable = provinces.filter((province) => province.usable);

  const rows: ThemeRow[] = THEMES.map((theme) => {
    const centralDoc =
      centralIndex.find((item) => theme.centralTitle.test(item.title)) ?? null;
    const centralDate = centralDoc?.date || theme.centralDate;
    const cells: Record<string, Cell> = {};
    const lags: number[] = [];

    for (const province of provinces) {
      if (!province.usable) {
        cells[province.id] = { status: 'uncovered' };
        continue;
      }
      const hits = province.items
        .filter((item) => theme.keys.test(item.title) && DOC_LIKE.test(item.title))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (hits.length === 0) {
        // 标题没命中，但正文里同一主题反复出现、且文件晚于中央发文 —— 判为"疑似承接"，
        // 单独标出来供人工核，不计入时滞统计，避免把"顺带提到"算成"落实"。
        const bodyHit = province.items
          .filter((item) => item.text && item.date >= centralDate)
          .map((item) => {
            const mentions = (item.text?.match(new RegExp(theme.keys.source, 'g')) ?? []).length;
            return { item, mentions };
          })
          .filter((row) => row.mentions >= 3)
          .sort((a, b) => a.item.date.localeCompare(b.item.date))[0];
        cells[province.id] = bodyHit
          ? {
              status: 'likely',
              date: bodyHit.item.date,
              lag: dayDiff(bodyHit.item.date, centralDate),
              title: bodyHit.item.title,
              url: bodyHit.item.url,
              mentions: bodyHit.mentions,
            }
          : { status: 'none' };
        continue;
      }
      const after = hits.filter((item) => item.date >= centralDate);
      if (after.length > 0) {
        const lead = after[0];
        const lag = dayDiff(lead.date, centralDate);
        lags.push(lag);
        cells[province.id] = {
          status: 'respond',
          date: lead.date,
          lag,
          title: lead.title,
          url: lead.url,
          later: after.length - 1,
        };
      } else {
        const last = hits[hits.length - 1];
        cells[province.id] = {
          status: 'pre',
          date: last.date,
          lag: dayDiff(last.date, centralDate),
          title: last.title,
          url: last.url,
          later: hits.length - 1,
        };
      }
    }

    return {
      theme,
      centralDate,
      centralDoc: centralDoc ? { id: centralDoc.id, title: centralDoc.title } : null,
      cells,
      responders: lags.length,
      lags,
      medianLag: median(lags),
    };
  });

  const respondPairs = rows.reduce((sum, row) => sum + row.responders, 0);
  const prePairs = rows.reduce(
    (sum, row) => sum + Object.values(row.cells).filter((cell) => cell.status === 'pre').length,
    0,
  );
  const flat = rows.flatMap((row) =>
    Object.entries(row.cells)
      .filter(([, cell]) => cell.status === 'respond')
      .map(([id, cell]) => ({ provinceId: id, province: provinces.find((p) => p.id === id)?.short ?? id, theme: row.theme.short, lag: cell.lag ?? 0 })),
  );
  const sortedFlat = [...flat].sort((a, b) => a.lag - b.lag);
  const items = provinces.reduce((sum, province) => sum + province.count, 0);
  const latest = provinces.map((province) => province.latest).filter(Boolean).sort().at(-1) ?? null;

  const summary = {
    themes: rows.length,
    respondedThemes: rows.filter((row) => row.responders > 0).length,
    totalPairs: rows.length * usable.length,
    respondPairs,
    prePairs,
    fastest: sortedFlat[0] ?? null,
    slowest: sortedFlat.at(-1) ?? null,
    medianLag: median(sortedFlat.map((item) => item.lag)),
  };

  const findings: string[] = [];
  findings.push(
    `在可用的 ${usable.length} 个省级单位、${rows.length} 项重点中央政策之间，共观察到 ${respondPairs} 组"中央发文—地方跟进"，` +
      `覆盖 ${summary.respondedThemes} 项政策；中位时滞 ${summary.medianLag ?? '—'} 天。`,
  );
  if (summary.fastest) {
    findings.push(
      `最快的一次响应是「${summary.fastest.province}」对「${summary.fastest.theme}」，` +
        `中央发文后 ${summary.fastest.lag} 天出台对应文件；最慢的一次是「${summary.slowest?.province}」，用了 ${summary.slowest?.lag} 天。`,
    );
  }
  const likelyRows = rows.flatMap((row) =>
    Object.entries(row.cells)
      .filter(([, cell]) => cell.status === 'likely')
      .map(([id, cell]) => ({ province: provinces.find((item) => item.id === id)?.short ?? id, theme: row.theme.short, lag: cell.lag ?? 0 })),
  );
  if (likelyRows.length > 0) {
    findings.push(
      `另有 ${likelyRows.length} 组属于"标题没写、正文里反复提到"的疑似承接（如${likelyRows
        .slice(0, 2)
        .map((item) => `${item.province}·${item.theme} +${item.lag} 天`)
        .join('、')}），单独标注待核，不计入上面的时滞统计——正文提到不等于落实，混算会把时滞压短。`,
    );
  }
  const silent = rows.filter((row) => row.responders === 0);
  if (silent.length > 0) {
    findings.push(
      `还有 ${silent.length} 项政策（${silent.map((row) => row.theme.short).join('、')}）在已抓取的地方文件里连正文都没提到——` +
        `这可能是尚未发文，也可能落在部门文件或不出文的执行环节，不能直接判为"没做"。`,
    );
  }
  if (prePairs > 0) {
    findings.push(
      `另有 ${prePairs} 组"地方文件早于中央文件"的情况，多为地方先行试点或既有存量政策，判断方向应是"中央吸收了地方做法"，而不是"地方响应中央"。`,
    );
  }

  return {
    rows,
    provinces,
    coverage: {
      attempted: payload.coverage?.attempted ?? provinces.length,
      usable: usable.length,
      totalProvinces: payload.coverage?.totalProvinces ?? 31,
      items,
      since: payload.since || '2026-05-01',
      latest,
    },
    summary,
    findings,
  };
}

// ---------------------------------------------------------------------------
// 政策注意力分布：不依赖"与中央一一对应"，只看各省自己在关注什么。
// 这一块的数据量比主题匹配大得多，用来回答"地区之间存在哪些结构性差异"。
// ---------------------------------------------------------------------------

export interface AttentionBucket {
  id: string;
  label: string;
  keys: RegExp;
}

export const ATTENTION_BUCKETS: AttentionBucket[] = [
  { id: 'consume', label: '消费与内需', keys: /消费|内需|以旧换新|商圈/ },
  { id: 'industry', label: '产业与制造', keys: /产业|制造|工业|集群|产业链/ },
  { id: 'tech', label: '科技与创新', keys: /科技|创新|研发|实验室|专利/ },
  { id: 'ai', label: '人工智能与数据', keys: /人工智能|智能|算力|数据|数字化/ },
  { id: 'employment', label: '就业与人才', keys: /就业|人才|用工|技能|创业/ },
  { id: 'welfare', label: '养老与社保', keys: /养老|社保|医保|救助|残疾|托育|育儿/ },
  { id: 'housing', label: '房地产与住房', keys: /住房|房地产|公积金|保障房|城中村/ },
  { id: 'business', label: '民营与中小企业', keys: /民营|中小微|中小企业|个体工商户|营商/ },
  { id: 'trade', label: '外贸与外资', keys: /外贸|出口|外资|跨境|口岸|自贸/ },
  { id: 'agri', label: '农业与乡村', keys: /农业|农村|乡村|种业|粮食|农机/ },
  { id: 'green', label: '生态与低碳', keys: /生态|绿色|低碳|碳|环保|节能|污染/ },
  { id: 'culture', label: '文旅与体育', keys: /文化|旅游|文旅|体育|赛事|非遗/ },
];

export interface AttentionCell {
  bucket: string;
  provinceId: string;
  count: number;
  share: number;
}

export interface AttentionResult {
  buckets: { id: string; label: string; total: number }[];
  provinces: { id: string; short: string; total: number }[];
  cells: Record<string, AttentionCell>;
  maxShare: number;
}

export function buildAttention(provinces: LocalProvince[]): AttentionResult | null {
  const usable = provinces.filter((province) => province.items.length >= GATE.minItems);
  if (usable.length === 0) return null;
  const cells: Record<string, AttentionCell> = {};
  const bucketTotals = ATTENTION_BUCKETS.map((bucket) => ({ id: bucket.id, label: bucket.label, total: 0 }));
  const provinceTotals = usable.map((province) => ({ id: province.id, short: province.short, total: province.items.length }));
  let maxShare = 0;

  for (const province of usable) {
    for (const bucket of ATTENTION_BUCKETS) {
      const count = province.items.filter((item) => bucket.keys.test(item.title)).length;
      const share = province.items.length > 0 ? count / province.items.length : 0;
      cells[`${bucket.id}:${province.id}`] = { bucket: bucket.id, provinceId: province.id, count, share };
      const target = bucketTotals.find((item) => item.id === bucket.id);
      if (target) target.total += count;
      if (share > maxShare) maxShare = share;
    }
  }

  return { buckets: bucketTotals, provinces: provinceTotals, cells, maxShare };
}
