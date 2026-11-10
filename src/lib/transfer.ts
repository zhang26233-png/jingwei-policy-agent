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
  // 近 90 天的政策工具类条目数。总条数会被历史存量骗：有的栏目三年攒几十条、近三个月一条没发。
  recentDocs?: number;
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

// 主题锚点全部对应本项目语料里真实存在的中央文件，日期以原文标注为准。
// 选主题的标准是"地方有对应事权、且会以本级文件接续"，不是"中央文件里最有名的那几份"——
// 早先只挑了 8 个专项工具（贴息、清欠、农业保险…），实测在 617 份地方文件里几乎全部零命中，
// 因为地方落实这类专项多走部门文件，省级门户的"政策文件"栏目收不全。改成按领域设锚点后才有观察量。
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
    id: 'consumption-infra',
    theme: '消费基础设施建设',
    short: '消费基建',
    centralTitle: /加强消费基础设施建设/,
    centralDate: '2026-10-30',
    keys: /消费基础设施|消费场景|消费新业态|商圈|促消费/,
    why: '文件明确要求地方配套项目清单，属于有硬性接续要求的政策。',
  },
  {
    id: 'elderly',
    theme: '普惠养老服务价格机制',
    short: '普惠养老',
    centralTitle: /普惠养老服务提质扩面/,
    centralDate: '2026-10-16',
    keys: /养老服务|养老机构|老龄事业|银发经济/,
    why: '价格机制需要省市定价目录与补贴政策衔接，地方不接就落不了地。',
  },
  {
    id: 'housing-loan',
    theme: '居民购房贷款贴息',
    short: '购房贴息',
    centralTitle: /居民购房贷款贴息/,
    centralDate: '2026-09-29',
    keys: /购房.{0,8}贴息|住房贷款贴息|购房补贴|住房消费/,
    why: '贴息资金由中央与地方分担，地方需要出台实施细则才能执行。',
  },
  {
    id: 'arrears',
    theme: '中小企业回款难治理',
    short: '清欠回款',
    centralTitle: /中小企业回款难/,
    centralDate: '2026-09-10',
    keys: /清欠|拖欠.{0,10}(账款|款项)|中小企业款项|回款难|账款清欠/,
    why: '清欠需要地方建立台账与督办机制，是观察地方执行力度的高频切口。',
  },
  {
    id: 'ai-jobs',
    theme: '人工智能与就业友好',
    short: 'AI+就业',
    centralTitle: /就业友好型发展方式/,
    centralDate: '2026-10-23',
    keys: /人工智能.{0,18}就业|就业友好|AI.{0,8}就业/,
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
    id: 'rv',
    theme: '房车与自驾消费',
    short: '房车消费',
    centralTitle: /促进房车消费/,
    centralDate: '2026-09-18',
    keys: /房车|自驾车|露营/,
    why: '涉及营地用地、车辆管理等地方事权，中央文件只是开口子，落地看地方。',
  },
  {
    id: 'new-quality',
    theme: '新质生产力与未来产业',
    short: '新质生产力',
    centralTitle: /发展新质生产力/,
    centralDate: '2026-10-09',
    keys: /新质生产力|未来产业|战略性新兴/,
    why: '中央提出方向后，地方一般以专项行动方案接续，是观察"抢新赛道"最快的窗口。',
  },
  {
    id: 'tech-merge',
    theme: '科技创新与产业创新融合',
    short: '科技融合',
    centralTitle: /科技创新和产业创新深度融合/,
    centralDate: '2026-10-21',
    keys: /科技创新|科技成果|中试|产业创新/,
    why: '涉及地方实验室、中试平台与成果转化，省级普遍有配套文件。',
  },
  {
    id: 'property',
    theme: '房地产与住房信贷',
    short: '房地产',
    centralTitle: /房地产信贷管理/,
    centralDate: '2026-08-28',
    keys: /房地产|住房信贷|住房市场|保障房|城中村/,
    why: '属地责任最重的领域之一，地方几乎必然会发文件。',
  },
  {
    id: 'provident',
    theme: '住房公积金制度',
    short: '公积金',
    centralTitle: /住房公积金管理条例/,
    centralDate: '2026-08-18',
    keys: /住房公积金|公积金/,
    why: '公积金政策由地方管委会执行，条例一改，地方必须跟进调整。',
  },
  {
    id: 'logistics',
    theme: '现代物流网建设',
    short: '物流',
    centralTitle: /物流网建设/,
    centralDate: '2026-08-28',
    keys: /物流|冷链|仓储|货运/,
    why: '物流枢纽、冷链设施需要地方立项与用地配套。',
  },
  {
    id: 'heritage',
    theme: '文化遗产保护传承',
    short: '文化遗产',
    centralTitle: /文化遗产保护传承/,
    centralDate: '2026-09-29',
    keys: /文化遗产|文物保护|非遗|历史文化/,
    why: '地方是文物保护与非遗传承的责任主体，规划落地必须省级配套。',
  },
  {
    id: 'education',
    theme: '义务教育与学生资助',
    short: '义务教育',
    centralTitle: /城乡义务教育补助经费/,
    centralDate: '2026-10-14',
    keys: /义务教育|学生资助|教育经费|普通高中|办学条件/,
    why: '补助经费下达后，省级要分解到市县，容易观察到文件动作。',
  },
  {
    id: 'export-tax',
    theme: '出口退税政策调整',
    short: '出口退税',
    centralTitle: /出口退税政策/,
    centralDate: '2026-10-12',
    keys: /出口退税|退税率/,
    why: '退税调整直接影响地方外贸企业，多数省份会发操作指引或宣讲通知。',
  },
  {
    id: 'e-gov',
    theme: '高效办成一件事',
    short: '政务服务',
    centralTitle: /高效办成一件事/,
    centralDate: '2026-09-23',
    keys: /高效办成一件事|政务服务|一件事/,
    why: '清单任务逐项落到省市两级政务服务平台，是最容易核对进度的领域。',
  },
  {
    id: 'power',
    theme: '新型电力系统建设',
    short: '电力',
    centralTitle: /新型电力系统建设/,
    centralDate: '2026-08-03',
    keys: /新型电力系统|电网|电力市场|电力.{0,6}(规划|建设)/,
    why: '电力规划由省级能源主管部门落地，配套文件密度高。',
  },
];

// 地方文件得是"政策工具"而不是通知类事务性文件；标题里没有这些词的多为会议、批复、公告。
const DOC_LIKE = /(通知|意见|方案|办法|措施|规划|细则|实施|规定|指引|清单|计划|决定)/;

// 事务性文件也常以"通知"结尾，但不是政策工具：培训班、课题征集、名录公布、人员解聘、采购公告……
// 不排掉它们，时滞会被这些文件压短，甚至出现"中央发文当天地方就响应"的假象。
// 这一条是拿真实命中逐条核对出来的：北京 +0 天那次命中的是"人工智能领域颠覆性技术方向储备课题征集"，
// 文化遗产 +14 天命中的是"文物保护工程资质单位培训班"，都不是政策接续。
const EXCLUDE_DOC =
  /(培训|征集|课题|名录|名单|解聘|聘任|招聘|笔试|面试|遴选|公示|资质|年检|考核|评比|竞赛|表彰|获奖|采购|招标|中标|预算公开|决算|职称|考试|批复|复函)/;

const isPolicyDoc = (title: string) => DOC_LIKE.test(title) && !EXCLUDE_DOC.test(title);

export type CellStatus = 'respond' | 'pre' | 'likely' | 'none' | 'outside' | 'uncovered';

export interface Cell {
  status: CellStatus;
  date?: string;
  lag?: number;
  title?: string;
  url?: string;
  later?: number;
  // 疑似承接：标题没命中，但正文里同一主题出现多次且晚于中央发文
  mentions?: number;
  // 超出观测窗时，写明是该省栏目还没更新到那一天，还是栏目最早只回溯到那一天
  windowGap?: { kind: 'before' | 'after'; province: string };
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
    // 落在该省栏目观测窗之外、无法判断的组合数
    outsidePairs: number;
    observablePairs: number;
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

// 可用性闸门：不数历史存量，只看"近三个月还在不在更新"。
// 一个栏目三年攒了 40 条、近 90 天只发 2 条，用它判断"地方是否跟进"必然大量假阴性——
// 那不是"没跟进"，是"栏目不更新了"。
const GATE = { minRecentDocs: 6, minLatest: '2026-10-20' };

// 地理归属只用于提示样本偏向，不参与计算。
const REGION: Record<string, string> = {
  beijing: '京津冀',
  hebei: '京津冀',
  shanghai: '长三角',
  jiangsu: '长三角',
  guangdong: '珠三角',
  guangzhou: '珠三角',
  shanxi: '中部',
  shaanxi: '西部',
};

export const regionOf = (id: string) => REGION[id] ?? '其他';

export function buildTransfer(payload: LocalPayload | null, policies: { id: string; title: string; date: string }[]): TransferResult | null {
  if (!payload?.ready || payload.provinces.length === 0) return null;

  const centralIndex = policies.map((policy) => ({ id: policy.id, title: policy.title, date: policy.date }));

  const provinces = payload.provinces.map((province) => {
    const spanDays =
      province.earliest && province.latest ? dayDiff(province.latest, province.earliest) : 0;
    const recentDocs = province.recentDocs ?? province.count;
    const thin = recentDocs < GATE.minRecentDocs;
    const stale = !province.latest || province.latest < GATE.minLatest;
    return {
      ...province,
      spanDays,
      recentDocs,
      usable: !thin && !stale,
      reason: thin
        ? `近 90 天仅 ${recentDocs} 份文件，栏目更新过疏`
        : stale
          ? `栏目只更新到 ${province.latest ?? '未知'}，10 月下旬之后的政策无法观察`
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
      // 每省的观测窗不一样宽：上海的栏目只回溯到 7 月，广州的能回溯到去年。
      // 中央发文日落在窗口外时，这一格不能判"未见"——判了就是拿栏目边界当政策事实。
      if (province.latest && centralDate > province.latest) {
        cells[province.id] = {
          status: 'outside',
          windowGap: { kind: 'after', province: province.latest },
        };
        continue;
      }
      if (province.earliest && centralDate < province.earliest) {
        cells[province.id] = {
          status: 'outside',
          windowGap: { kind: 'before', province: province.earliest },
        };
        continue;
      }
      const hits = province.items
        .filter((item) => theme.keys.test(item.title) && isPolicyDoc(item.title))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (hits.length === 0) {
        // 标题没命中，但正文里同一主题反复出现、且文件晚于中央发文 —— 判为"疑似承接"，
        // 单独标出来供人工核，不计入时滞统计，避免把"顺带提到"算成"落实"。
        const bodyHit = province.items
          .filter((item) => item.text && item.date >= centralDate && !EXCLUDE_DOC.test(item.title))
          .map((item) => {
            const mentions = (item.text?.match(new RegExp(theme.keys.source, 'g')) ?? []).length;
            return { item, mentions };
          })
          .filter((row) => row.mentions >= 5)
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
  const outsidePairs = rows.reduce(
    (sum, row) => sum + Object.values(row.cells).filter((cell) => cell.status === 'outside').length,
    0,
  );
  const totalPairs = rows.length * usable.length;
  const observablePairs = totalPairs - outsidePairs;
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
    totalPairs,
    outsidePairs,
    observablePairs,
    respondPairs,
    prePairs,
    fastest: sortedFlat[0] ?? null,
    slowest: sortedFlat.at(-1) ?? null,
    medianLag: median(sortedFlat.map((item) => item.lag)),
  };

  const regions = [...new Set(usable.map((province) => regionOf(province.id)))];

  // 按地方单元统计"跟进"与"先行"，用来识别两个容易被误读的模式：
  //  ① 某个地方占了大多数跟进，但它的栏目收录范围本来就更宽（含委办局与区级文件）；
  //  ② 某个地方看起来"跟进少"，其实是"早就做了"——那些格子落在 pre 里。
  const byProvince = usable
    .map((province) => ({
      short: province.short,
      items: province.count,
      recentDocs: province.recentDocs ?? province.count,
      respond: rows.filter((row) => row.cells[province.id]?.status === 'respond').length,
      pre: rows.filter((row) => row.cells[province.id]?.status === 'pre').length,
    }))
    .sort((a, b) => b.respond - a.respond || b.recentDocs - a.recentDocs);

  const findings: string[] = [];
  findings.push(
    `在 ${usable.length} 个地方单元、${rows.length} 项重点中央政策之间，可比对的组合为 ${observablePairs} 个` +
      `（另有 ${outsidePairs} 个落在观测窗之外，不作判断）。其中观察到 ${respondPairs} 组地方跟进，` +
      `覆盖 ${summary.respondedThemes} 项政策，中位时滞 ${summary.medianLag ?? '—'} 天。`,
  );
  findings.push(
    `样本覆盖${regions.join('、')}，共 ${usable.length} 个单元，以东部与华北为主，中部与西南部分单元未纳入。` +
      `本页结论适用于上述单元之间的比较，不对全国分布作推断。`,
  );

  const top = byProvince[0];
  if (top && respondPairs > 0 && top.respond / respondPairs >= 0.4) {
    findings.push(
      `${top.short}占 ${top.respond}/${respondPairs} 组跟进。该单元栏目同时收录市属委办局与区级文件` +
        `（近 90 天 ${top.recentDocs} 份，其余单元多在数十份以内），文件公开密度明显较高。` +
        `跨单元比较时滞，在很大程度上反映的是各栏目的文件公开密度，而非行政效率差异。`,
    );
  }

  const preHeavy = byProvince.filter((item) => item.pre >= 2 && item.pre > item.respond);
  if (preHeavy.length > 0) {
    findings.push(
      `${preHeavy.map((item) => `${item.short}先行 ${item.pre} 组`).join('、')}，其先行组合多于跟进组合，多数动作早于中央发文。` +
        `相关领域内，中央文件更多是对地方已有做法的确认；将其计为"响应滞后"，方向与实际不符。`,
    );
  }

  if (summary.fastest) {
    findings.push(
      `响应最快的一组为${summary.fastest.province}的${summary.fastest.theme}，中央发文后 ${summary.fastest.lag} 天出台对应文件；` +
        `最慢一组为${summary.slowest?.province}，间隔 ${summary.slowest?.lag} 天。`,
    );
  }
  const likelyRows = rows.flatMap((row) =>
    Object.entries(row.cells)
      .filter(([, cell]) => cell.status === 'likely')
      .map(([id, cell]) => ({ province: provinces.find((item) => item.id === id)?.short ?? id, theme: row.theme.short, lag: cell.lag ?? 0 })),
  );
  if (likelyRows.length > 0) {
    findings.push(
      `另有 ${likelyRows.length} 组为标题未命中、正文多次提及的相关文件（如${likelyRows
        .slice(0, 2)
        .map((item) => `${item.province}·${item.theme} +${item.lag} 天`)
        .join('、')}），单独标注待核，不计入时滞统计。`,
    );
  }
  // 没有"跟进"的主题要分两种，混在一起说会自相矛盾：
  // 一种是地方早在中央之前就发过文件（pre/likely），只是观察窗内没有新动作；
  // 另一种是标题层面完全没匹配到，只能靠正文提及来提示。
  const noRespond = rows.filter((row) => row.responders === 0);
  const preOnly = noRespond.filter((row) =>
    Object.values(row.cells).some((cell) => cell.status === 'pre' || cell.status === 'likely'),
  );
  const emptyRows = noRespond.filter((row) => !preOnly.includes(row));
  if (preOnly.length > 0) {
    findings.push(
      `${preOnly.map((row) => row.theme.short).join('、')}共 ${preOnly.length} 项在观测窗内无新增地方文件，` +
        `但此前已发布同领域文件，属已有部署，不计为未跟进。`,
    );
  }
  if (emptyRows.length > 0) {
    findings.push(
      `余下 ${emptyRows.length} 项政策（${emptyRows.map((row) => row.theme.short).join('、')}）在已抓取文本中未见标题与正文匹配，` +
        `既可能尚未发文，也可能体现在部门文件或非文本形式的执行环节，不作未落实判断。`,
    );
  }
  if (prePairs > 0) {
    // 方法论提示只留一句，细节已在上面按主题分类说明，避免同一件事讲三遍。
    findings.push(
      `合计 ${prePairs} 组地方文件早于中央文件。此类组合的因果方向与响应关系相反，多为中央文件吸收地方已有做法；` +
        `若计入时滞统计，中位数将系统性偏低。`,
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
// 时滞排行：把矩阵里所有"已跟进"的格子拉平，按天数从小到大排。
//
// 矩阵回答的是"谁接了"，回答不了"差异有多大"。老师问的原话是"时间差是不是有差异"，
// 那需要的是分布形状而不是格子——7 组样本画不出概率分布，能画且诚实的只有排序条形图：
// 每根条是一个已观察到的跟进，长短就是天数，中位线告诉你典型值在哪。
// ---------------------------------------------------------------------------

export interface LagRankItem {
  provinceId: string;
  province: string;
  themeId: string;
  theme: string;
  lag: number;
  date: string;
  centralDate: string;
  title: string;
  url: string;
}

export interface LagRanking {
  items: LagRankItem[];
  median: number | null;
  max: number;
  /** 30 天内 / 31—60 天 / 60 天以上 各几组，用来写结论句 */
  bands: { fast: number; mid: number; slow: number };
}

export function buildLagRanking(result: TransferResult): LagRanking {
  const items: LagRankItem[] = [];
  for (const row of result.rows) {
    for (const province of result.provinces) {
      const cell = row.cells[province.id];
      if (!cell || cell.status !== 'respond') continue;
      items.push({
        provinceId: province.id,
        province: province.short,
        themeId: row.theme.id,
        theme: row.theme.short,
        lag: cell.lag ?? 0,
        date: cell.date ?? '',
        centralDate: row.centralDate,
        title: cell.title ?? '',
        url: cell.url ?? '',
      });
    }
  }
  items.sort((a, b) => a.lag - b.lag || a.province.localeCompare(b.province));

  return {
    items,
    median: median(items.map((item) => item.lag)),
    max: items.reduce((max, item) => Math.max(max, item.lag), 0),
    bands: {
      fast: items.filter((item) => item.lag <= 30).length,
      mid: items.filter((item) => item.lag > 30 && item.lag <= 60).length,
      slow: items.filter((item) => item.lag > 60).length,
    },
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
  const usable = provinces.filter(
    (province) => (province.recentDocs ?? province.count) >= GATE.minRecentDocs,
  );
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
