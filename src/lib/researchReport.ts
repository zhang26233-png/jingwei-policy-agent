// 研究报告（研报版式）：把央地传导的观测结果写成一份可以单独交出去的文档。
//
// 为什么不用页面截图或 PDF 库：
//  - 截图不可检索、不可复制、老师在 Word 里没法引用；
//  - 前端 PDF 库要额外 2MB 依赖，而浏览器自带「打印 → 存为 PDF」已经够用。
// 所以这里自己拼一份自包含 HTML：内联样式 + 内联 SVG 图表，双击就能打开，也能直接打印成 A4。
//
// 关键约束：预览与下载必须是同一份字符串。两处各写一遍必然漂移（上一轮导出图就吃过这个亏：
// 网页刻度取整到 30 的倍数、导出图用 max×1.08，同一根条读出两个天数）。

import type { Policy } from '../types';
import { buildLagRanking, regionOf, type LagRankItem, type LagRanking, type LocalPayload, type TransferResult } from './transfer';

// --------------------------------------------------------------------------- 模型

export interface UnitStat {
  id: string;
  short: string;
  name: string;
  level: string;
  region: string;
  items: number;
  recent90: number;
  earliest: string | null;
  latest: string | null;
  usable: boolean;
  reason: string | null;
  observable: number;
  respond: number;
  pre: number;
  likely: number;
  none: number;
  medianLag: number | null;
}

export interface PreRow {
  province: string;
  theme: string;
  date: string;
  centralDate: string;
  lead: number;
  title: string;
  url: string;
}

export interface ReportModel {
  generatedAt: Date;
  dataAt: string | null;
  since: string;
  corpus: { count: number; from: string; to: string };
  coverage: { target: number; crawled: number; usable: number };
  counts: {
    total: number;
    observable: number;
    respond: number;
    pre: number;
    likely: number;
    none: number;
    outside: number;
    uncovered: number;
  };
  themes: { total: number; covered: number; responded: number };
  lag: LagRanking;
  units: UnitStat[];
  excluded: UnitStat[];
  preRows: PreRow[];
  respondRows: LagRankItem[];
}

const median = (values: number[]) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
};

export function buildReportModel(
  result: TransferResult,
  payload: LocalPayload | null,
  policies: Policy[],
  generatedAt = new Date(),
): ReportModel {
  // 语料统计只取自动采集条目：内置 8 条 2025 年校订样例会把日期区间拉到一年前，
  // 报告里写着"2024/09/24 起"，读者会以为本期覆盖了两年。
  const auto = policies.filter((policy) => policy.origin !== 'seed');
  const corpusSet = auto.length > 0 ? auto : policies;
  const dates = corpusSet.map((policy) => policy.date).filter(Boolean).sort();

  const units: UnitStat[] = result.provinces.map((province) => {
    const stat: UnitStat = {
      id: province.id,
      short: province.short,
      name: province.name,
      level: province.level,
      region: regionOf(province.id),
      items: province.count,
      recent90: province.recentDocs ?? province.count,
      earliest: province.earliest,
      latest: province.latest,
      usable: province.usable,
      reason: province.reason,
      observable: 0,
      respond: 0,
      pre: 0,
      likely: 0,
      none: 0,
      medianLag: null,
    };
    const lags: number[] = [];
    for (const row of result.rows) {
      const cell = row.cells[province.id];
      if (!cell) continue;
      if (cell.status === 'respond') {
        stat.respond += 1;
        stat.observable += 1;
        if (typeof cell.lag === 'number') lags.push(cell.lag);
      } else if (cell.status === 'pre') {
        stat.pre += 1;
        stat.observable += 1;
      } else if (cell.status === 'likely') {
        stat.likely += 1;
        stat.observable += 1;
      } else if (cell.status === 'none') {
        stat.none += 1;
        stat.observable += 1;
      }
    }
    stat.medianLag = median(lags);
    return stat;
  });

  const preRows: PreRow[] = [];
  for (const row of result.rows) {
    for (const province of result.provinces) {
      const cell = row.cells[province.id];
      if (!cell || cell.status !== 'pre') continue;
      preRows.push({
        province: province.short,
        theme: row.theme.short,
        date: cell.date ?? '',
        centralDate: row.centralDate,
        lead: Math.abs(cell.lag ?? 0),
        title: cell.title ?? '',
        url: cell.url ?? '',
      });
    }
  }
  preRows.sort((a, b) => b.lead - a.lead);

  const lag = buildLagRanking(result);
  const coveredThemes = result.rows.filter((row) => row.responders > 0 || Object.values(row.cells).some((cell) => cell.status === 'pre')).length;

  return {
    generatedAt,
    dataAt: payload?.at ?? null,
    since: payload?.since ?? '',
    corpus: { count: corpusSet.length, from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' },
    coverage: {
      target: payload?.coverage?.totalProvinces ?? 31,
      crawled: payload?.coverage?.crawled ?? result.provinces.length,
      usable: result.provinces.filter((province) => province.usable).length,
    },
    counts: {
      total: result.rows.length * result.provinces.length,
      observable: result.summary.observablePairs,
      respond: result.summary.respondPairs,
      pre: result.summary.prePairs,
      likely: result.rows.reduce(
        (sum, row) => sum + Object.values(row.cells).filter((cell) => cell.status === 'likely').length,
        0,
      ),
      none: result.rows.reduce(
        (sum, row) => sum + Object.values(row.cells).filter((cell) => cell.status === 'none').length,
        0,
      ),
      outside: result.summary.outsidePairs,
      uncovered: result.rows.reduce(
        (sum, row) => sum + Object.values(row.cells).filter((cell) => cell.status === 'uncovered').length,
        0,
      ),
    },
    themes: {
      total: result.rows.length,
      covered: coveredThemes,
      responded: result.rows.filter((row) => row.responders > 0).length,
    },
    lag,
    units: units.filter((unit) => unit.usable),
    excluded: units.filter((unit) => !unit.usable),
    preRows,
    respondRows: lag.items,
  };
}

// --------------------------------------------------------------------------- 绘图工具

const C = {
  ink: '#16232b',
  soft: '#465a64',
  mute: '#8496a0',
  line: '#dde4e7',
  grid: '#eef2f4',
  green: '#1f6f52',
  amber: '#b07d24',
  rust: '#a4442f',
  slate: '#4a6a7a',
  sand: '#c9b89a',
};

const FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',-apple-system,'Segoe UI',sans-serif";

const esc = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const clip = (value: string, max: number) => (value.length <= max ? value : `${value.slice(0, max - 1)}…`);

const barTone = (lag: number) => (lag <= 30 ? C.green : lag <= 60 ? C.amber : C.rust);

const STATUS_TONE: Record<string, { fill: string; label: string }> = {
  respond: { fill: C.green, label: '确认跟进' },
  pre: { fill: C.amber, label: '地方先行' },
  likely: { fill: '#d8c39a', label: '相关文件' },
  none: { fill: '#e7ebed', label: '未见' },
  outside: { fill: '#f5f2ea', label: '超出观测窗' },
};

// 图 1：时滞排行。条长就是天数，虚线是中位。
function svgLagRank(lag: LagRanking): string {
  const W = 664;
  const padTop = 52;
  const rowH = 32;
  const labelW = 190;
  const trackX = labelW + 12;
  const trackW = W - trackX - 74;
  const H = padTop + lag.items.length * rowH + 30;
  const max = Math.max(30, Math.ceil(lag.max / 30) * 30);
  const x = (day: number) => trackX + (day / max) * trackW;

  const parts: string[] = [];
  // 刻度与竖向参考线
  for (let day = 0; day <= max; day += 30) {
    const gx = x(day);
    parts.push(`<line x1="${gx.toFixed(1)}" y1="${padTop - 10}" x2="${gx.toFixed(1)}" y2="${H - 22}" stroke="${C.grid}" stroke-width="1"/>`);
    parts.push(
      `<text x="${gx.toFixed(1)}" y="${padTop - 18}" text-anchor="middle" font-size="10.5" fill="${C.mute}">${day} 天</text>`,
    );
  }

  lag.items.forEach((item, index) => {
    const y = padTop + index * rowH;
    const w = Math.max(4, (item.lag / max) * trackW);
    parts.push(
      `<text x="${labelW}" y="${y + 15}" text-anchor="end" font-size="12.5" fill="${C.ink}">${esc(
        clip(`${item.province} · ${item.theme}`, 13),
      )}</text>`,
    );
    parts.push(
      `<rect x="${trackX}" y="${y + 5}" width="${w.toFixed(1)}" height="16" rx="2" fill="${barTone(item.lag)}"/>`,
    );
    parts.push(
      `<text x="${(trackX + w + 8).toFixed(1)}" y="${y + 17}" font-size="12" font-weight="600" fill="${C.soft}">+${item.lag} 天</text>`,
    );
  });

  if (lag.median !== null) {
    const mx = x(lag.median);
    parts.push(
      `<line x1="${mx.toFixed(1)}" y1="${padTop - 10}" x2="${mx.toFixed(1)}" y2="${H - 22}" stroke="${C.ink}" stroke-width="1.2" stroke-dasharray="5 4" opacity="0.55"/>`,
    );
    parts.push(
      `<text x="${mx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${C.ink}">中位 ${lag.median} 天</text>`,
    );
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="央地时滞排行">${parts.join('')}</svg>`;
}

// 图 2：响应矩阵。18 个主题 × 6 个地方单元，一格一种状态。
function svgMatrix(result: TransferResult, units: UnitStat[]): string {
  const rows = result.rows;
  const W = 664;
  const labelW = 148;
  const headerH = 34;
  const rowH = 18;
  const gap = 16;
  const colW = (W - labelW - gap) / Math.max(1, units.length);
  const H = headerH + rows.length * rowH + 42;
  const parts: string[] = [];

  units.forEach((unit, index) => {
    const cx = labelW + index * colW + colW / 2;
    parts.push(
      `<text x="${cx.toFixed(1)}" y="18" text-anchor="middle" font-size="11.5" fill="${C.ink}">${esc(unit.short)}</text>`,
    );
    parts.push(
      `<text x="${cx.toFixed(1)}" y="30" text-anchor="middle" font-size="9.5" fill="${C.mute}">${unit.recent90} 份/90天</text>`,
    );
  });

  rows.forEach((row, rowIndex) => {
    const y = headerH + rowIndex * rowH;
    parts.push(
      `<text x="${labelW - 8}" y="${y + 12.5}" text-anchor="end" font-size="11.5" fill="${C.soft}">${esc(clip(row.theme.short, 9))}</text>`,
    );
    units.forEach((unit, colIndex) => {
      const cell = row.cells[unit.id];
      const status = cell?.status ?? 'none';
      const tone = STATUS_TONE[status] ?? STATUS_TONE.none;
      const cx = labelW + colIndex * colW + 3;
      parts.push(
        `<rect x="${cx.toFixed(1)}" y="${y + 2}" width="${(colW - 6).toFixed(1)}" height="14" rx="2" fill="${tone.fill}"${
          status === 'none' ? ' opacity="0.85"' : ''
        }/>`,
      );
    });
  });

  const legendY = H - 22;
  let lx = labelW - 46;
  const items = ['respond', 'pre', 'likely', 'none'];
  items.forEach((status) => {
    const tone = STATUS_TONE[status];
    parts.push(`<rect x="${lx}" y="${legendY - 8}" width="9" height="9" rx="1.5" fill="${tone.fill}"/>`);
    parts.push(`<text x="${lx + 13}" y="${legendY}" font-size="10" fill="${C.mute}">${tone.label}</text>`);
    lx += 13 + tone.label.length * 10 + 14;
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="响应矩阵">${parts.join('')}</svg>`;
}

// 图 3：可判组合的状态构成。用一根堆叠条回答"107 个格子里到底有多少是确认的"。
function svgStatusBar(counts: ReportModel['counts']): string {
  const W = 664;
  const H = 112;
  const barY = 22;
  const barH = 34;
  const total = Math.max(1, counts.observable);
  const segments = [
    { key: 'respond', value: counts.respond },
    { key: 'pre', value: counts.pre },
    { key: 'likely', value: counts.likely },
    { key: 'none', value: counts.none },
  ].filter((segment) => segment.value > 0);

  const parts: string[] = [];
  let cursor = 0;
  segments.forEach((segment) => {
    const width = (segment.value / total) * W;
    const tone = STATUS_TONE[segment.key];
    parts.push(`<rect x="${cursor.toFixed(1)}" y="${barY}" width="${Math.max(1, width).toFixed(1)}" height="${barH}" fill="${tone.fill}"/>`);
    if (width > 46) {
      parts.push(
        `<text x="${(cursor + width / 2).toFixed(1)}" y="${barY + 22}" text-anchor="middle" font-size="12" font-weight="600" fill="${segment.key === 'none' ? C.soft : '#ffffff'}">${segment.value}</text>`,
      );
    }
    cursor += width;
  });

  // 图例排成两列两行：单行排列时中文标签宽度估算不准，四段文字必然挤在一起。
  segments.forEach((segment, index) => {
    const tone = STATUS_TONE[segment.key];
    const share = ((segment.value / total) * 100).toFixed(1);
    const col = index % 2;
    const row = Math.floor(index / 2);
    const lx = col * 300;
    const ly = barY + barH + 20 + row * 20;
    parts.push(`<rect x="${lx}" y="${ly - 9}" width="9" height="9" rx="1.5" fill="${tone.fill}"/>`);
    parts.push(
      `<text x="${lx + 14}" y="${ly}" font-size="10.5" fill="${C.soft}">${tone.label} ${segment.value} 组（${share}%）</text>`,
    );
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="可判组合状态构成">${parts.join('')}</svg>`;
}

// 图 4：文件公开密度 vs 观察到的跟进组数。横轴取对数，否则 215 会把其余五个点压成一根线。
function svgDensityScatter(units: UnitStat[]): string {
  const W = 664;
  const H = 292;
  const left = 58;
  const right = 24;
  const top = 22;
  const bottom = 52;
  const plotW = W - left - right;
  const plotH = H - top - bottom;
  const xMin = 6;
  const xMax = 300;
  const yMax = Math.max(4, ...units.map((unit) => unit.respond)) + 1;
  const lg = (value: number) => Math.log10(Math.max(xMin, value));
  const x = (value: number) => left + ((lg(value) - lg(xMin)) / (lg(xMax) - lg(xMin))) * plotW;
  const y = (value: number) => top + plotH - (value / yMax) * plotH;

  const parts: string[] = [];
  for (const tick of [0, 1, 2, 3, 4, 5]) {
    if (tick > yMax) continue;
    parts.push(`<line x1="${left}" y1="${y(tick).toFixed(1)}" x2="${left + plotW}" y2="${y(tick).toFixed(1)}" stroke="${C.grid}"/>`);
    parts.push(`<text x="${left - 10}" y="${(y(tick) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="${C.mute}">${tick}</text>`);
  }
  for (const tick of [10, 30, 100, 300]) {
    parts.push(
      `<line x1="${x(tick).toFixed(1)}" y1="${top}" x2="${x(tick).toFixed(1)}" y2="${top + plotH}" stroke="${C.grid}" stroke-dasharray="2 3"/>`,
    );
    parts.push(
      `<text x="${x(tick).toFixed(1)}" y="${top + plotH + 16}" text-anchor="middle" font-size="10" fill="${C.mute}">${tick}</text>`,
    );
  }
  parts.push(`<line x1="${left}" y1="${top + plotH}" x2="${left + plotW}" y2="${top + plotH}" stroke="${C.line}"/>`);
  parts.push(`<text x="${left + plotW / 2}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="${C.soft}">该单元近 90 天公开的政策类文件数（对数刻度）</text>`);
  parts.push(`<text x="${left - 44}" y="${top + 4}" font-size="10.5" fill="${C.soft}">跟进组数</text>`);

  // 六个点里有四个的"跟进组数"为 0，横向位置又只差 1—2 份文件，标签必然叠在一起。
  // 做法是：相邻点的标签逐级上抬，并用一条细引线指回原点，而不是给坐标加随机抖动——
  // 抖动会让人以为那些位置有真实数据。
  const ordered = [...units].sort((a, b) => a.recent90 - b.recent90);
  let prevX = -999;
  let level = 0;
  ordered.forEach((unit) => {
    const px = x(unit.recent90);
    const py = y(unit.respond);
    if (px - prevX < 44) level += 1;
    else level = 0;
    prevX = px;

    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" fill="${C.slate}" opacity="0.9"/>`);
    const dy = -12 - level * 13;
    if (level > 0) {
      parts.push(
        `<line x1="${px.toFixed(1)}" y1="${(py - 5).toFixed(1)}" x2="${px.toFixed(1)}" y2="${(py + dy + 4).toFixed(1)}" stroke="${C.line}" stroke-width="1"/>`,
      );
    }
    parts.push(
      `<text x="${px.toFixed(1)}" y="${(py + dy).toFixed(1)}" text-anchor="middle" font-size="10.5" fill="${C.ink}">${esc(
        `${unit.short} ${unit.respond}/${unit.observable}`,
      )}</text>`,
    );
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="公开密度与跟进组数">${parts.join('')}</svg>`;
}

// 图 5：观测可得性。31 → 8 → 6 这条收缩链本身就是"全国"这个词的真实边界。
function svgCoverage(model: ReportModel): string {
  const W = 664;
  const rows = [
    { label: '目标省级单位', value: model.coverage.target, note: '按行政区划计' },
    { label: '实际接通栏目', value: model.coverage.crawled, note: '门户可访问、栏目可解析' },
    { label: '满足更新门槛', value: model.coverage.usable, note: '近 90 天 ≥6 份且仍在更新' },
  ];
  const rowH = 46;
  const H = rows.length * rowH + 14;
  const labelW = 118;
  const trackX = labelW + 10;
  const trackW = 300;
  const max = Math.max(...rows.map((row) => row.value));
  const parts: string[] = [];

  rows.forEach((row, index) => {
    const y = index * rowH + 8;
    const width = (row.value / max) * trackW;
    parts.push(`<text x="${labelW}" y="${y + 19}" text-anchor="end" font-size="11.5" fill="${C.soft}">${row.label}</text>`);
    parts.push(`<rect x="${trackX}" y="${y + 6}" width="${trackW}" height="18" rx="2" fill="${C.grid}"/>`);
    parts.push(
      `<rect x="${trackX}" y="${y + 6}" width="${width.toFixed(1)}" height="18" rx="2" fill="${index === 2 ? C.green : C.sand}"/>`,
    );
    parts.push(`<text x="${trackX + width + 10}" y="${y + 20}" font-size="12" font-weight="600" fill="${C.ink}">${row.value}</text>`);
    parts.push(`<text x="${trackX + trackW + 46}" y="${y + 20}" font-size="10" fill="${C.mute}">${row.note}</text>`);
  });

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="观测可得性">${parts.join('')}</svg>`;
}

// --------------------------------------------------------------------------- HTML

const css = `
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  background: #edebe6;
  font-family: ${FONT};
  color: ${C.ink};
  font-size: 14px;
  line-height: 1.85;
}
.sheet {
  width: 794px;
  margin: 24px auto;
  padding: 56px 64px 64px;
  background: #ffffff;
  box-shadow: 0 8px 30px rgba(22, 35, 43, 0.12);
}
.kicker {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 10px;
  border-bottom: 2px solid ${C.ink};
  font-size: 11px;
  letter-spacing: 0.12em;
  color: ${C.soft};
}
.kicker b { font-family: ${FONT}; font-weight: 600; letter-spacing: 0.06em; }
h1 {
  margin: 28px 0 6px;
  font-size: 30px;
  line-height: 1.34;
  letter-spacing: -0.01em;
}
.subtitle {
  margin: 0 0 22px;
  font-size: 14.5px;
  color: ${C.soft};
}
.meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 24px;
  padding: 14px 16px;
  background: #f7f6f2;
  border-left: 3px solid ${C.sand};
  font-size: 12px;
  color: ${C.soft};
  margin-bottom: 30px;
}
.meta span b { color: ${C.ink}; font-weight: 600; }
h2 {
  margin: 34px 0 12px;
  padding-bottom: 7px;
  border-bottom: 1px solid ${C.line};
  font-size: 18px;
}
h2 .num {
  display: inline-block;
  margin-right: 8px;
  color: ${C.sand};
  font-weight: 700;
}
h3 { margin: 22px 0 8px; font-size: 14.5px; }
p { margin: 0 0 12px; }
ul, ol { margin: 0 0 14px; padding-left: 22px; }
li { margin-bottom: 6px; }
.lead {
  padding: 18px 20px;
  background: #f8f7f3;
  border: 1px solid ${C.line};
  margin-bottom: 8px;
}
.lead ol { margin: 0; padding-left: 20px; }
.lead li { margin-bottom: 9px; line-height: 1.78; }
.lead li b { color: ${C.green}; }
table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 10px 0 6px;
  font-size: 12px;
  line-height: 1.6;
}
caption {
  caption-side: top;
  text-align: left;
  font-size: 12px;
  color: ${C.soft};
  padding-bottom: 6px;
}
caption b { color: ${C.ink}; }
th {
  text-align: left;
  font-weight: 600;
  padding: 7px 8px;
  border-top: 1.5px solid ${C.ink};
  border-bottom: 1px solid ${C.ink};
  background: #fafaf7;
  white-space: normal;
}
td { padding: 7px 8px; border-bottom: 1px solid ${C.grid}; vertical-align: top; word-break: break-word; }
/* 日期一旦允许换行就会被拆成「2026/08/1」+「8」，比溢出更难读 */
td.date { white-space: nowrap; font-size: 11.5px; }
tbody tr:last-child td { border-bottom: 1.5px solid ${C.line}; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
figure { margin: 18px 0 22px; }
figure svg { display: block; }
figcaption {
  margin-top: 8px;
  font-size: 11.5px;
  color: ${C.soft};
  line-height: 1.7;
}
figcaption b { color: ${C.ink}; }
.source { margin-top: 4px; font-size: 10.5px; color: ${C.mute}; }
.note {
  padding: 11px 14px;
  background: #fbf8f1;
  border-left: 3px solid ${C.amber};
  font-size: 12.5px;
  color: ${C.soft};
  margin: 14px 0;
}
.warn {
  padding: 11px 14px;
  background: #fbf2ef;
  border-left: 3px solid ${C.rust};
  font-size: 12.5px;
  color: ${C.soft};
  margin: 14px 0;
}
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 14px 0; }
.card { padding: 12px 14px; border: 1px solid ${C.line}; background: #fcfcfa; }
.card h4 { margin: 0 0 6px; font-size: 12.5px; }
.card ul { margin: 0; padding-left: 18px; font-size: 12px; }
.card.ok h4 { color: ${C.green}; }
.card.no h4 { color: ${C.rust}; }
.foot {
  margin-top: 36px;
  padding-top: 14px;
  border-top: 1px solid ${C.line};
  font-size: 10.5px;
  color: ${C.mute};
  line-height: 1.75;
}
@media print {
  body { background: #ffffff; }
  .sheet { width: auto; margin: 0; padding: 0; box-shadow: none; }
  figure, table { break-inside: avoid; }
  h2 { break-after: avoid; }
}
@media (max-width: 860px) {
  .sheet { width: auto; margin: 0; padding: 28px 20px; }
  .two-col, .meta { grid-template-columns: 1fr; }
}
`;

const fmtDate = (date: string) => (date ? date.replace(/-/g, '/') : '—');

/**
 * 生成一份自包含的研究报告 HTML。预览与下载都用这一份，避免两处口径漂移。
 */
export function renderReportHtml(model: ReportModel, result: TransferResult): string {
  const { lag, counts, coverage, corpus, themes, units } = model;
  const generated = model.generatedAt;
  const stamp = `${generated.getFullYear()}年${generated.getMonth() + 1}月${generated.getDate()}日`;
  const clock = `${String(generated.getHours()).padStart(2, '0')}:${String(generated.getMinutes()).padStart(2, '0')}`;
  const fastest = lag.items[0];
  const slowest = lag.items[lag.items.length - 1];
  const ratio = fastest && slowest && fastest.lag > 0 ? (slowest.lag / fastest.lag).toFixed(1) : '—';
  const peekUnit = [...units].sort((a, b) => b.respond - a.respond)[0];
  const lagMedian = lag.median ?? 0;
  const respondShare = ((counts.respond / Math.max(1, counts.observable)) * 100).toFixed(1);

  const respondTable = model.respondRows
    .map(
      (item, index) => `<tr>
        <td>${index + 1}</td>
        <td>${esc(item.province)}</td>
        <td>${esc(item.theme)}</td>
        <td class="date">${fmtDate(item.centralDate)}</td>
        <td class="date">${fmtDate(item.date)}</td>
        <td class="num">+${item.lag}</td>
        <td>${esc(clip(item.title, 30))}</td>
      </tr>`,
    )
    .join('');

  const preTable = model.preRows
    .slice(0, 10)
    .map(
      (row, index) => `<tr>
        <td>${index + 1}</td>
        <td>${esc(row.province)}</td>
        <td>${esc(row.theme)}</td>
        <td class="date">${fmtDate(row.date)}</td>
        <td class="date">${fmtDate(row.centralDate)}</td>
        <td class="num">${row.lead}</td>
        <td>${esc(clip(row.title, 28))}</td>
      </tr>`,
    )
    .join('');

  const unitTable = [...units]
    .sort((a, b) => b.respond - a.respond || b.recent90 - a.recent90)
    .map(
      (unit) => `<tr>
        <td>${esc(unit.short)}</td>
        <td>${esc(unit.level)}</td>
        <td class="num">${unit.recent90}</td>
        <td class="num">${unit.observable}</td>
        <td class="num">${unit.respond}</td>
        <td class="num">${unit.pre}</td>
        <td class="num">${unit.medianLag === null ? '—' : `+${unit.medianLag}`}</td>
        <td>${unit.latest ? fmtDate(unit.latest) : '—'}</td>
      </tr>`,
    )
    .join('');

  const excludedTable = model.excluded
    .map(
      (unit) => `<tr>
        <td>${esc(unit.short)}</td>
        <td>${esc(unit.level)}</td>
        <td class="num">${unit.recent90}</td>
        <td>${unit.latest ? fmtDate(unit.latest) : '—'}</td>
        <td>${esc(unit.reason ?? '未达标')}</td>
      </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>中央政策发布后的地方跟进：时滞特征与观测范围 · 经纬纵横</title>
<style>${css}</style>
</head>
<body>
<div class="sheet">
  <div class="kicker">
    <b>经纬纵横 · 宏观政策研究平台</b>
    <span>央地政策传导观察 · 第 01 期</span>
  </div>

  <h1>中央政策发布后的地方跟进：时滞特征与观测范围</h1>
  <p class="subtitle">基于 ${units.length} 个地方单元、${themes.total} 个政策领域、${counts.observable} 组有效样本的实测观察</p>

  <div class="meta">
    <span><b>报告日期</b>　${stamp} ${clock}</span>
    <span><b>数据快照</b>　${model.dataAt ? fmtDate(model.dataAt.slice(0, 10)) : '—'}</span>
    <span><b>中央语料</b>　${corpus.count} 份（${fmtDate(corpus.from)} 至 ${fmtDate(corpus.to)}）</span>
    <span><b>地方语料</b>　${coverage.crawled} 个单元接通，${coverage.usable} 个可用</span>
  </div>

  <h2><span class="num">摘要</span>核心结论</h2>
  <div class="lead">
    <ol>
      <li><b>${counts.observable} 组有效样本中，确认跟进 ${counts.respond} 组，中位时滞 ${lagMedian} 天。</b>确认跟进占有效样本的 ${respondShare}%。按中位数判断，地方在中央发文后约半个月出台同领域文件。</li>
      <li><b>组间差距 ${ratio} 倍，差异主要来自尾部。</b>最快 ${fastest ? `+${fastest.lag} 天（${fastest.province}·${fastest.theme}）` : '—'}，最慢 ${slowest ? `+${slowest.lag} 天（${slowest.province}·${slowest.theme}）` : '—'}。30 天以内 ${lag.bands.fast} 组，31 至 60 天 ${lag.bands.mid} 组，60 天以上 ${lag.bands.slow} 组。</li>
      <li><b>跨单元比较首先反映文件公开密度。</b>${peekUnit ? `${peekUnit.short}观察到 ${peekUnit.respond} 组跟进，该单元栏目近 90 天公开文件 ${peekUnit.recent90} 份` : ''}，其余单元同期公开量多在 10 份上下，各自观察到 0 至 2 组。观察到的组数与时滞同时受栏目收录范围影响，不宜直接解读为行政效率差异。</li>
      <li><b>全国分布不具备推断条件。</b>${coverage.target} 个省级单位中，${coverage.crawled} 个接通栏目，${coverage.usable} 个满足更新门槛。本报告给出上述单元之间的差异，不作全国分布推断。</li>
      <li><b>${themes.total} 个政策领域中，${themes.covered} 个出现地方同类文件，其中 ${themes.responded} 个有确认跟进。</b>其余 ${themes.total - themes.covered} 个领域在有效样本中未见匹配。相关政策事项通常由部门文件或非公开文本部署，未必经由省级门户的政策文件栏目发布。</li>
    </ol>
  </div>

  <h2><span class="num">一</span>研究问题与观察指标</h2>
  <p>本报告考察中央政策文件发布之后，地方是否出台对应文件、间隔多久，以及该间隔在不同地方单元之间的差异。观察指标与不在范围内的内容分列如下。</p>
  <div class="two-col">
    <div class="card ok">
      <h4>观察指标</h4>
      <ul>
        <li>已接通栏目中，某政策领域是否出现晚于中央发文的地方文件；</li>
        <li>出现时，两者相隔天数，以及中位数与区间；</li>
        <li>不同地方单元之间，跟进组数与间隔的分布；</li>
        <li>出现地方先行文件的政策领域。</li>
      </ul>
    </div>
    <div class="card no">
      <h4>不在本报告范围</h4>
      <ul>
        <li>${coverage.target} 个省级单位的时滞分布，本报告覆盖 ${coverage.crawled} 个栏目；</li>
        <li>地方政策的执行情况，本报告仅统计文件发布；</li>
        <li>时滞差异的成因，现有样本不支持归因分析；</li>
        <li>政策效果评估，本报告不涉及。</li>
      </ul>
    </div>
  </div>

  <h2><span class="num">二</span>数据与方法</h2>
  <p><b>中央语料。</b>取自国务院、财政部、国家发展改革委、中国人民银行、国家统计局等官方栏目，本期共 ${corpus.count} 份政策文件，日期区间为 ${fmtDate(corpus.from)} 至 ${fmtDate(corpus.to)}。据此设定 ${themes.total} 个政策领域的中央锚点，每个领域对应一份中央文件及其发文日期。</p>
  <p><b>地方语料。</b>覆盖目标为 ${coverage.target} 个省级单位。本轮对其中 ${coverage.crawled} 个门户的栏目执行抓取并全部解析成功，${coverage.usable} 个满足可用性门槛。其余单元未纳入本轮采集，原因包括门户拒绝访问、列表由脚本渲染、栏目长期停更。</p>
  <p><b>准入门槛。</b>近 90 天发布政策类文件不少于 6 份，且栏目更新日期晚于 2026 年 10 月 20 日。历史存量不作为准入依据：三年累计数十条、近三个月无更新的栏目，无法用于判断是否跟进。</p>
  <p><b>判定规则。</b>某组合判为"确认跟进"须同时满足三项条件：地方文件标题命中该领域关键词；发布日期晚于中央发文日期；文件属政策文件，而非事务性通知。第三项为必要条件，早期版本曾将课题征集、培训班通知计入，导致时滞明显偏短。</p>
  <p><b>观测窗。</b>各单元栏目可回溯的时间范围不同。中央发文日期落在某单元栏目窗口之外时，该组合标注为"超出观测窗"，不作"未见"处理。</p>
  <p><b>样本构成。</b>${coverage.target} 个省级单位与 ${themes.total} 个政策领域构成 ${counts.total} 组名义组合，扣除 ${counts.uncovered} 组不可用单元、${counts.outside} 组超出观测窗，得到 ${counts.observable} 组有效样本。</p>

  <h2><span class="num">三</span>时滞特征：中位 ${lagMedian} 天，尾部延伸至 ${slowest ? slowest.lag : '—'} 天</h2>
  <p>将 ${counts.respond} 组确认跟进按天数排序，分布明显右偏：${lag.bands.fast} 组集中在 30 天以内，31 至 60 天 ${lag.bands.mid} 组，60 天以上 ${lag.bands.slow} 组。中位数为 ${lagMedian} 天；均值受尾部影响偏高，故以中位数描述典型情况。</p>
  <figure>
    ${svgLagRank(lag)}
    <figcaption><b>图 1　地方跟进时滞排行（${counts.respond} 组确认跟进，单位：天）。</b>条形长度为时滞天数，绿色表示 30 天以内、赭色表示 31 至 60 天、砖红色表示 60 天以上；虚线为中位数 ${lagMedian} 天。<div class="source">数据来源：中央政策语料（${corpus.count} 份）与 ${coverage.usable} 个地方单元的政策文件栏目，截至 ${model.dataAt ? fmtDate(model.dataAt.slice(0, 10)) : '—'}。</div></figcaption>
  </figure>
  <p>尾部两组单独列出：${slowest ? `${slowest.province}·${slowest.theme} 为 +${slowest.lag} 天` : ''}，与最快一组相差 ${ratio} 倍。同一批中央文件在不同领域、不同单元的落地节奏差异较大，未见统一的跟进周期。</p>

  <h2><span class="num">四</span>跟进确认比例：${counts.observable} 组有效样本中确认 ${counts.respond} 组</h2>
  <p>响应矩阵一格对应"某政策领域的中央文件在某单元栏目中能否找到后续文件"。矩阵中多数格未匹配到标题命中的文件。这一结果既可能对应尚未发文，也可能对应文件发布在部门文件、会议部署或未形成公开文本的执行环节，需结合具体领域核查。</p>
  <figure>
    ${svgMatrix(result, units)}
    <figcaption><b>图 2　政策领域与地方单元的响应矩阵（${themes.total} 个领域 × ${units.length} 个单元）。</b>列顶标注该单元近 90 天公开文件数。深绿为确认跟进，赭色为地方先行，浅褐为相关文件（正文相关、标题未命中），浅灰为未见。<div class="source">仅列示 ${coverage.usable} 个可用单元；不可用单元整列不画，以免以空白示意全国一致。</div></figcaption>
  </figure>
  <figure>
    ${svgStatusBar(counts)}
    <figcaption><b>图 3　${counts.observable} 组有效样本的状态构成。</b>确认跟进 ${counts.respond} 组（${respondShare}%），地方先行 ${counts.pre} 组，相关文件 ${counts.likely} 组，未见 ${counts.none} 组。<div class="source">相关文件不计入时滞统计。正文提及与文件发布属不同情形，合并计算将使时滞偏短。</div></figcaption>
  </figure>
  <div class="note">"未见"在本报告中的含义限于：在已接通的地方栏目中，未检索到标题层面匹配的对应文件。</div>

  <h2><span class="num">五</span>地区差异：跟进组数与文件公开密度同向变动</h2>
  <p>各单元观察到的跟进组数差异较大。将"近 90 天公开文件数"一并列示可见，跟进组数较多的单元，公开文件数量同样较多。栏目收录范围与更新频率直接影响文件被匹配到的概率，该关系不宜解读为行政效率差异。</p>
  <figure>
    ${svgDensityScatter(units)}
    <figcaption><b>图 4　文件公开密度与观察到的跟进组数。</b>横轴为该单元近 90 天公开的政策类文件数（对数刻度），纵轴为确认跟进组数，点旁标注跟进组数与有效样本组数。<div class="source">仅 ${units.length} 个观测点，本图为描述性比较，不作回归与显著性检验，亦不支持"公开越多、跟进越快"一类因果表述。</div></figcaption>
  </figure>
  <table>
    <caption><b>表 1　地方单元台账</b>（按确认跟进组数排序）</caption>
    <colgroup><col style="width:12%"/><col style="width:19%"/><col style="width:12%"/><col style="width:9%"/><col style="width:8%"/><col style="width:8%"/><col style="width:11%"/><col style="width:21%"/></colgroup>
    <thead><tr><th>单元</th><th>层级</th><th class="num">近90天文件</th><th class="num">有效样本</th><th class="num">跟进</th><th class="num">先行</th><th class="num">中位时滞</th><th>栏目更新至</th></tr></thead>
    <tbody>${unitTable}</tbody>
  </table>
  ${
    excludedTable
      ? `<table>
    <caption><b>表 2　未纳入的单元及原因</b></caption>
    <colgroup><col style="width:13%"/><col style="width:17%"/><col style="width:12%"/><col style="width:16%"/><col style="width:42%"/></colgroup>
    <thead><tr><th>单元</th><th>层级</th><th class="num">近90天文件</th><th>栏目更新至</th><th>未纳入原因</th></tr></thead>
    <tbody>${excludedTable}</tbody>
  </table>
  <p class="source">未纳入指该栏目更新频率不足，无法支撑是否跟进的判断，不代表该单元未出台相关文件。</p>`
      : ''
  }

  <h2><span class="num">六</span>观测范围与推断限度</h2>
  <p>本节列示观测可得性，用以说明结论的适用范围。</p>
  <figure>
    ${svgCoverage(model)}
    <figcaption><b>图 5　观测可得性。</b>${coverage.target} 个省级单位中，${coverage.crawled} 个栏目可解析，${coverage.usable} 个满足"近 90 天不少于 6 份且仍在更新"的准入门槛，进入判定。<div class="source">未接通单元多为门户反爬、栏目结构调整或列表由脚本渲染，此类缺口无法以推测补齐。</div></figcaption>
  </figure>
  <p>据此，本报告结论适用于 ${coverage.usable} 个可用单元。回答"全国层面是否存在差异"，所需的是更多可稳定抓取的省级栏目，而非更复杂的模型。</p>
  <div class="note">未接通单元在本报告中留空，不作插补；${counts.respond} 组样本用于描述现象，不作地区间显著性检验；区域差异不在本报告的解释范围内。</div>

  <h2><span class="num">七</span>明细与证据</h2>
  <table>
    <caption><b>表 3　确认跟进明细</b>（${counts.respond} 组，时滞单位为天）</caption>
    <colgroup><col style="width:4%"/><col style="width:9%"/><col style="width:14%"/><col style="width:13%"/><col style="width:13%"/><col style="width:9%"/><col style="width:38%"/></colgroup>
    <thead><tr><th>#</th><th>单元</th><th>领域</th><th>中央发文</th><th>地方发文</th><th class="num">时滞</th><th>地方文件（节选）</th></tr></thead>
    <tbody>${respondTable}</tbody>
  </table>
  <p class="source">各格均可回溯至原始栏目核对。地方文件名称作节选，完整标题与链接见平台对应页面。</p>
  ${
    preTable
      ? `<table>
    <caption><b>表 4　地方先行明细</b>（地方同类文件早于中央锚点，共 ${counts.pre} 组，提前天数为绝对值）</caption>
    <colgroup><col style="width:4%"/><col style="width:9%"/><col style="width:14%"/><col style="width:13%"/><col style="width:13%"/><col style="width:9%"/><col style="width:38%"/></colgroup>
    <thead><tr><th>#</th><th>单元</th><th>领域</th><th>地方发文</th><th>中央发文</th><th class="num">提前</th><th>地方文件（节选）</th></tr></thead>
    <tbody>${preTable}</tbody>
  </table>
  <p class="source">"先行"仅表示时间在前，不表示因果方向。地方试点先于中央统一部署属常见情形。个别先行组间隔超过 3 个月，多为地方在该领域的常态化部署，与中央锚点未必针对同一事项，仅作并列参考。</p>`
      : ''
  }

  <h2><span class="num">八</span>说明事项</h2>
  <ul>
    <li><b>配对方式。</b>按政策领域匹配，非逐份文件对应。中央与地方文件之间无官方对应编号，存在错配与漏配的可能。</li>
    <li><b>统计对象。</b>仅统计公开的政策文件文本。会议部署、指标分解、资金下达等未形成公开文本的落实情形，不在统计范围内。</li>
    <li><b>样本量。</b>${counts.respond} 组观测用于描述现象，不作分布估计与组间检验。</li>
    <li><b>数据时点。</b>基于 ${model.dataAt ? fmtDate(model.dataAt.slice(0, 10)) : '—'} 的采集结果。地方栏目持续更新，重新采集后数值会变化。</li>
    <li><b>单位口径。</b>地方文件数量受栏目设置影响，不宜直接作为治理强度指标。</li>
  </ul>

  <h2><span class="num">附</span>口径定义与生成信息</h2>
  <table>
    <caption><b>表 5　关键口径</b></caption>
    <colgroup><col style="width:20%"/><col style="width:80%"/></colgroup>
    <thead><tr><th>术语</th><th>定义</th></tr></thead>
    <tbody>
      <tr><td>确认跟进</td><td>地方文件标题命中领域关键词，发布日期晚于中央锚点发文日期，且属政策文件</td></tr>
      <tr><td>地方先行</td><td>同类地方文件早于中央锚点发文日期，时滞记为负</td></tr>
      <tr><td>相关文件</td><td>标题未命中，正文中同一主题多次出现且晚于中央发文；单列，不计入时滞</td></tr>
      <tr><td>超出观测窗</td><td>中央发文日期落在该单元栏目可回溯范围之外，无法判断</td></tr>
      <tr><td>有效样本</td><td>排除不可用单元与超出观测窗后的组合数，本期 ${counts.observable} 组</td></tr>
      <tr><td>中位时滞</td><td>${counts.respond} 组时滞的中位数，用于减少长尾影响</td></tr>
    </tbody>
  </table>
  <div class="foot">
    本报告由经纬纵横（宏观政策研究平台）于 ${stamp} ${clock} 生成，数据快照 ${model.dataAt ? fmtDate(model.dataAt.slice(0, 10)) : '—'}。<br/>
    报告结论与明细均可回溯至原始栏目。引用时请一并标注样本量与统计口径。<br/>
    报告版本 v1.0 · 生成方式：平台报告引擎（内联样式与矢量图，无外部依赖，可离线打开与打印）
  </div>
</div>
</body>
</html>`;
}

/** 下载为自包含 HTML，双击可打开，浏览器「打印 → 存为 PDF」即为 A4 报告 */
export function downloadReportHtml(model: ReportModel, result: TransferResult): void {
  const html = renderReportHtml(model, result);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const date = model.generatedAt;
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
  anchor.href = url;
  anchor.download = `经纬纵横_央地传导观察报告_${stamp}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
