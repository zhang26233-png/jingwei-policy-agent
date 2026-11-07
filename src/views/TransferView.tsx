import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, Info } from 'lucide-react';
import type { Policy } from '../types';
import { fetchLocals } from '../lib/api';
import { buildAttention, buildLagRanking, buildTransfer, regionOf, type Cell, type LocalPayload } from '../lib/transfer';
import { copyText, downloadPng, drawRankChart } from '../lib/exportImage';
import './transfer.css';

interface TransferViewProps {
  policies: Policy[];
}

const ROW_H = 46;
const PLOT_W = 820;
const PROVINCE_TONE = ['#2ee6b2', '#ff8f6b', '#7fb2ff', '#ffc247', '#b9a5ff'];

const dayMs = 86400000;
const toTime = (date: string) => new Date(`${date}T00:00:00`).getTime();
const mmdd = (date: string) => date.slice(5).replace('-', '/');

export function TransferView({ policies }: TransferViewProps) {
  const [payload, setPayload] = useState<LocalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchLocals()
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        setError(null);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const result = useMemo(
    () =>
      buildTransfer(
        payload,
        policies.map((policy) => ({ id: policy.id, title: policy.title, date: policy.date })),
      ),
    [payload, policies],
  );

  const attention = useMemo(() => (payload ? buildAttention(payload.provinces) : null), [payload]);
  const ranking = useMemo(() => (result ? buildLagRanking(result) : null), [result]);

  if (loading) {
    return (
      <section className="trf-page">
        <header className="trf-head">
          <span className="trf-kicker">CENTRAL → LOCAL</span>
          <h1>央地传导：中央发文之后，地方什么时候动</h1>
          <p className="trf-muted">正在读取地方政策语料……</p>
        </header>
      </section>
    );
  }

  if (error || !result) {
    return (
      <section className="trf-page">
        <header className="trf-head">
          <span className="trf-kicker">CENTRAL → LOCAL</span>
          <h1>央地传导：中央发文之后，地方什么时候动</h1>
          <p className="trf-muted">
            {error
              ? `地方语料读取失败：${error}`
              : '地方语料尚未采集。服务端执行一次采集后，这里会出现主题—省份的响应时间。'}
          </p>
        </header>
        <div className="trf-empty">
          <Info size={16} />
          <span>
            这个页面依赖各省政府门户的"政策文件"栏目。目前只接入了实测能抓通的省份，抓不到的不会补造数据——
            宁可少画一个省，也不把空白当成"地方没做"。
          </span>
        </div>
      </section>
    );
  }

  const usable = result.provinces.filter((province) => province.usable);
  // 广州是市级单元，混进"31 个省级单位"的分母会把覆盖率说大，必须分开计数。
  // 注意用前缀判断：广州的 level 是"市级（副省级省会）"，includes('省级') 会把它误判成省级。
  const provincialUsable = usable.filter((province) => province.level.startsWith('省级')).length;
  const cityUsable = usable.length - provincialUsable;
  const regionCount = usable.reduce<Record<string, number>>((acc, province) => {
    const key = regionOf(province.id);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const toneOf = (id: string) =>
    PROVINCE_TONE[Math.max(0, usable.findIndex((p) => p.id === id)) % PROVINCE_TONE.length];

  // 导出的图必须能脱离网页独立成立：标题、样本量、排序、中位线、脚注一个都不能少。
  // 只截一张没有脚注的图贴进报告，就会被读成"6 个地方代表全国"。
  const exportRankingPng = () => {
    if (!result || !ranking || ranking.items.length === 0) return;
    const canvas = drawRankChart({
      title: '中央发文之后，这几个地方隔了多久才动',
      subtitle: `${result.coverage.usable} 个地方单元 × ${result.summary.themes} 项中央政策｜观察到 ${ranking.items.length} 组跟进｜中位 ${ranking.median ?? '—'} 天`,
      items: ranking.items.map((item) => ({
        label: `${item.province} · ${item.theme}`,
        sub: `中央 ${item.centralDate} → 地方 ${item.date}`,
        value: item.lag,
      })),
      median: ranking.median,
      footnote: [
        `样本：${usable.map((province) => province.name).join('、')}，共 ${result.coverage.items} 份地方政策文件。全国 31 个省级单位中仅 ${result.coverage.usable} 个地方门户（含 1 个市级）能稳定抓到政策文件列表，其余为拒访、脚本渲染或栏目停更，故本图为便利样本，不代表全国分布。`,
        '读数提醒：条形长度只代表「首份对应文件的公开日期距中央发文的天数」，不评价配套资金与执行力度；某地占比偏高源于其栏目同时收录委办局与区级文件，属文件公开密度差异，不应读成行政效率差异。',
      ],
    });
    // 文件名里的日期用「数据日期」而不是下载日期：同一份语料导出的图应该是同一张，
    // 否则每周导一次会出现多个内容相同、名字不同的文件。
    const stamp = (payload?.at ?? result.coverage.latest ?? 'latest').slice(0, 10);
    downloadPng(canvas, `宏策智研_央地时滞_${stamp}.png`);
  };

  const copyRankingText = async () => {
    if (!result || !ranking || ranking.items.length === 0) return;
    const fastest = ranking.items[0];
    const slowest = ranking.items[ranking.items.length - 1];
    const lines = [
      '中央发文之后地方跟进的时滞（宏策智研 · 央地传导）',
      `样本：${result.coverage.usable} 个地方单元 × ${result.summary.themes} 项中央政策，共 ${result.coverage.items} 份地方政策文件；观察到 ${ranking.items.length} 组「中央发文—地方跟进」。`,
      `中位时滞 ${ranking.median ?? '—'} 天；最快 ${fastest.province}·${fastest.theme} +${fastest.lag} 天，最慢 ${slowest.province}·${slowest.theme} +${slowest.lag} 天。`,
      `分布：30 天内 ${ranking.bands.fast} 组，31—60 天 ${ranking.bands.mid} 组，60 天以上 ${ranking.bands.slow} 组。`,
      '',
      '逐条：',
      ...ranking.items.map(
        (item, index) =>
          `${index + 1}. ${item.province}·${item.theme} +${item.lag} 天（中央 ${item.centralDate} → 地方 ${item.date}）`,
      ),
      '',
      '口径：主题级配对而非逐份文件配对；只算首份对应文件；未见文件不等于地方未做；本样本为便利样本（东部与华北为主），不能外推为全国差异。',
    ];
    const ok = await copyText(lines.join('\n'));
    setCopied(ok);
    setTimeout(() => setCopied(false), 2200);
  };

  const times: number[] = [];
  for (const row of result.rows) {
    times.push(toTime(row.centralDate));
    for (const cell of Object.values(row.cells)) if (cell.date) times.push(toTime(cell.date));
  }
  const minT = Math.min(...times) - 8 * dayMs;
  const maxT = Math.max(...times) + 8 * dayMs;
  const px = (date: string) => 8 + ((toTime(date) - minT) / (maxT - minT)) * (PLOT_W - 16);
  const plotH = result.rows.length * ROW_H;

  const ticks: { x: number; label: string }[] = [];
  const cursor = new Date(minT);
  cursor.setDate(1);
  while (cursor.getTime() <= maxT) {
    const iso = new Date(cursor.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
    if (toTime(iso) >= minT) ticks.push({ x: px(iso), label: `${cursor.getMonth() + 1}月` });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const cellTone = (cell: Cell) => {
    if (cell.status === 'respond') {
      const lag = cell.lag ?? 99;
      if (lag <= 30) return 'fast';
      if (lag <= 60) return 'mid';
      return 'slow';
    }
    if (cell.status === 'likely') return 'likely';
    if (cell.status === 'pre') return 'pre';
    if (cell.status === 'outside') return 'outside';
    return 'none';
  };

  // 刻度按 30 天一档取整，保证中位线与条形长度用同一把尺子。
  const rankScale = Math.max(30, Math.ceil((ranking?.max ?? 0) / 30) * 30);
  const rankTicks: number[] = [];
  for (let day = 0; day <= rankScale; day += 30) rankTicks.push(day);
  const medianPct = ranking?.median != null ? (ranking.median / rankScale) * 100 : null;
  const bandOf = (lag: number) => (lag <= 30 ? 'fast' : lag <= 60 ? 'mid' : 'slow');

  return (
    <section className="trf-page">
      <header className="trf-head">
        <div className="trf-head-main">
          <span className="trf-kicker">CENTRAL → LOCAL · 央地传导</span>
          <h1>中央发文之后，这几地什么时候动</h1>
          <p>
            以中央近期出台的八项政策为锚，逐份核对地方已公开的政策文件，记录"有没有接、隔了几天"。
            这是一份<strong>可复现的多案例观察</strong>：每一个判断都能点回地方原文，但样本只覆盖少数地方，不是全国抽样。
          </p>
        </div>
        <div className="trf-hero">
          <div className="trf-hero-card">
            <span>可用地方单元</span>
            <b>
              {result.coverage.usable}
              <small> 个</small>
            </b>
            <em>
              省级 {provincialUsable} + 市级 {cityUsable}，全国共 {result.coverage.totalProvinces} 个省级单位
            </em>
          </div>
          <div className="trf-hero-card">
            <span>可观察组合</span>
            <b>{result.summary.observablePairs}</b>
            <em>共 {result.summary.totalPairs} 个主题×地方组合</em>
          </div>
          <div className="trf-hero-card">
            <span>中位时滞</span>
            <b>{result.summary.medianLag ?? '—'}</b>
            <em>天（仅算已跟进的 {result.summary.respondPairs} 组）</em>
          </div>
        </div>
      </header>

      <div className="trf-banner">
        <Info size={15} />
        <div>
          <b>这不是全国样本，先把边界说清楚：</b>全国共 31 个省级单位，本轮接入 {result.coverage.attempted} 个地方政府门户、
          {result.coverage.usable} 个达到"近三个月仍在正常更新"的门槛（
          {usable.map((province) => province.name).join('、') || '无'}
          ——其中省级 {provincialUsable} 个、市级 {cityUsable} 个），合计 {result.coverage.items} 份地方政策文件。
          其余门户要么拒绝访问、要么列表由脚本渲染、要么栏目已停更。所以本页能回答<strong>这几地之间差多少</strong>，
          不能回答<strong>全国有没有差异</strong>。
        </div>
      </div>

      <section className="trf-card trf-design">
        <header className="trf-card-head">
          <h2>这份材料能回答什么、不能回答什么</h2>
          <p>研究设计是"多案例比较"，不是抽样调查。提前把边界写出来，答辩时不必临场找补。</p>
        </header>
        <div className="trf-design-grid">
          <div className="trf-design-col yes">
            <h3>能回答</h3>
            <ul>
              <li>某项中央政策出台后，这几个地方各自隔几天发了对应文件——每条都能点回原文核对。</li>
              <li>同一项政策在不同地方的时间差有多大：最快 {result.summary.fastest?.lag ?? '—'} 天、最慢{' '}
                {result.summary.slowest?.lag ?? '—'} 天（仅限 {result.summary.respondPairs} 组已观察到跟进的样本）。
              </li>
              <li>哪几项政策在这些地方的政策文件里始终找不到对应文本，可以据此提出"落实在部门文件"的追问。</li>
            </ul>
          </div>
          <div className="trf-design-col no">
            <h3>不能回答</h3>
            <ul>
              <li>
                全国 31 个省级单位的时间差排序：可用的只有 {provincialUsable} 个省级单位和 {cityUsable} 个市级单位，
                分母不齐，排序没有意义。
              </li>
              <li>
                地域覆盖不全：样本分布是{' '}
                {Object.entries(regionCount)
                  .map(([region, count]) => `${region} ${count}`)
                  .join('、')}
                ，东北、中部大部与西南缺席，缺失的地方不能靠推断补上。
              </li>
              <li>"地方到底做没做"：未见文件只代表省级门户的政策文件栏目里没有，很多落实在部门文件或不出文的执行环节。</li>
              <li>响应力度：这里只记首份文件的日期，不评价配套资金、实施细则的强度。</li>
            </ul>
          </div>
        </div>
      </section>

      <div className="trf-prov-grid">
        {result.provinces.map((province) => (
          <div key={province.id} className={`trf-prov ${province.usable ? 'ok' : 'off'}`}>
            <div className="trf-prov-name">
              {province.name}
              <span>{province.usable ? '可用' : '未纳入'}</span>
            </div>
            <div className="trf-prov-meta">
              {province.count} 份文件 · 近 90 天 {province.recentDocs ?? province.count} 份
            </div>
            <div className="trf-prov-window">
              观测窗 {province.earliest ?? '—'} ~ {province.latest ?? '—'}
            </div>
            {province.reason && <div className="trf-prov-why">{province.reason}</div>}
          </div>
        ))}
      </div>

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>时间轴：中央发文日与地方跟进日</h2>
          <p>每行一项中央政策。虚线是中央发文日；实心点是地方出台对应文件的日期，空心点表示地方文件早于中央（先行或存量）。</p>
        </header>

        <div className="trf-timeline">
          <div className="trf-tl-labels">
            {result.rows.map((row) => (
              <div key={row.theme.id} className="trf-tl-label">
                <b>{row.theme.theme}</b>
                <span>中央 {mmdd(row.centralDate)}</span>
              </div>
            ))}
          </div>
          <div className="trf-tl-plot">
            <svg viewBox={`0 0 ${PLOT_W} ${plotH + 22}`} role="img" aria-label="中央政策与地方跟进文件的时间分布">
              {ticks.map((tick) => (
                <g key={tick.label}>
                  <line className="trf-grid" x1={tick.x} y1={14} x2={tick.x} y2={plotH} />
                  <text className="trf-axis" x={tick.x} y={9} textAnchor="middle">
                    {tick.label}
                  </text>
                </g>
              ))}

              {result.rows.map((row, index) => {
                const y = index * ROW_H + ROW_H / 2;
                const cx = px(row.centralDate);
                const dots = Object.entries(row.cells)
                  .filter(([, cell]) => cell.status !== 'none' && cell.status !== 'uncovered' && cell.date)
                  .map(([id, cell]) => ({ id, cell, x: px(cell.date as string) }));
                return (
                  <g key={row.theme.id}>
                    <line className="trf-row" x1={0} y1={y} x2={PLOT_W} y2={y} />
                    <line className="trf-central" x1={cx} y1={y - 14} x2={cx} y2={y + 14} />
                    <title>{`${row.theme.theme}｜中央 ${row.centralDate}`}</title>
                    {dots.map((dot) => (
                      <g key={`${row.theme.id}-${dot.id}`}>
                        <circle
                          cx={dot.x}
                          cy={y}
                          r={dot.cell.status === 'respond' ? 5 : dot.cell.status === 'likely' ? 3.2 : 4.5}
                          fill={dot.cell.status === 'respond' ? toneOf(dot.id) : 'transparent'}
                          stroke={toneOf(dot.id)}
                          strokeWidth={dot.cell.status === 'likely' ? 1.2 : 1.6}
                          strokeDasharray={dot.cell.status === 'likely' ? '2 2' : undefined}
                          opacity={dot.cell.status === 'likely' ? 0.75 : 1}
                        />
                        <title>{`${dot.cell.title}\n${dot.cell.date}｜${dot.cell.lag && dot.cell.lag > 0 ? `+${dot.cell.lag}` : dot.cell.lag} 天`}</title>
                      </g>
                    ))}
                  </g>
                );
              })}
              <text className="trf-axis" x={0} y={plotH + 18}>
                {new Date(minT).toISOString().slice(0, 10)} — {new Date(maxT).toISOString().slice(0, 10)}
              </text>
            </svg>
          </div>
        </div>

        <div className="trf-legend">
          {usable.map((province) => (
            <span key={province.id}>
              <i style={{ background: toneOf(province.id) }} />
              {province.short}
            </span>
          ))}
          <span>
            <i className="hollow" />
            早于中央
          </span>
          <span>
            <i className="dash" />
            中央发文日
          </span>
          <span>
            <i className="hollow dashed" />
            疑似承接（待核）
          </span>
        </div>
      </section>

      {ranking && ranking.items.length > 0 && (
        <section className="trf-card">
          <header className="trf-card-head">
            <h2>时滞排行：中央发文之后，隔了多久才动</h2>
            <p>
              把上面所有已观察到的跟进拉平，按天数从短到长排。条形越长＝隔得越久，虚线是中位数。
              这一张图回答"差异有多大"，下面的矩阵回答"谁接了"——两件事要分开看。
            </p>
            <div className="trf-actions">
              <button className="trf-btn" onClick={exportRankingPng} title="白底、带样本说明，适合放进论文、报告或 PPT">
                <Download size={14} /> 导出图（PNG）
              </button>
              <button className="trf-btn" onClick={copyRankingText}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '已复制' : '复制文字'}
              </button>
            </div>
          </header>

          <div className="trf-rank">
            <div className="trf-rank-axis">
              <span />
              <div className="trf-rank-axis-track">
                {rankTicks.map((day) => (
                  <i key={day} style={{ left: `${(day / rankScale) * 100}%` }}>
                    {day}
                  </i>
                ))}
              </div>
              <span className="trf-rank-axis-unit">天</span>
            </div>

            {ranking.items.map((item) => (
              <div className="trf-rank-row" key={`${item.themeId}-${item.provinceId}`}>
                <div className="trf-rank-label">
                  <b>
                    {item.province} · {item.theme}
                  </b>
                  <span>
                    中央 {mmdd(item.centralDate)} → 地方 {mmdd(item.date)}
                  </span>
                </div>
                <div className="trf-rank-track">
                  <div
                    className="trf-rank-bar"
                    data-band={bandOf(item.lag)}
                    style={{ width: `${Math.max(1.5, (item.lag / rankScale) * 100)}%` }}
                    title={item.title}
                  />
                  {medianPct !== null && (
                    <i className="trf-rank-med" style={{ left: `${medianPct}%` }} aria-hidden />
                  )}
                </div>
                <div className="trf-rank-val">+{item.lag} 天</div>
              </div>
            ))}
          </div>

          <p className="trf-foot">
            只画 {ranking.items.length} 组已观察到跟进的样本：30 天内 {ranking.bands.fast} 组、31—60 天{' '}
            {ranking.bands.mid} 组、60 天以上 {ranking.bands.slow} 组，中位 {ranking.median ?? '—'} 天。
            样本量这么小，能说的是"这几组之间的差有多大"，不能说是"全国的分布形状"——7 个点画不出分布。
          </p>
        </section>
      )}

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>响应矩阵：谁接了、隔几天</h2>
          <p>
            格子里的天数＝地方最早对应文件距中央发文的天数；点开可回地方原文。
            "超出窗口"指该地栏目覆盖不到这一天——既不能说做了，也不能说没做。
          </p>
        </header>
        <div
          className="trf-matrix"
          style={{ gridTemplateColumns: `170px repeat(${result.provinces.length}, minmax(92px, 1fr))` }}
        >
          <div className="trf-mx-head">政策主题</div>
          {result.provinces.map((province) => (
            <div key={province.id} className={`trf-mx-head ${province.usable ? '' : 'off'}`}>
              {province.short}
              {!province.usable && <em>未纳入</em>}
            </div>
          ))}

          {result.rows.map((row) => (
            <div key={row.theme.id} className="trf-mx-row">
              <div className="trf-mx-label">
                <b>{row.theme.theme}</b>
                <span>中央 {mmdd(row.centralDate)}</span>
              </div>
              {result.provinces.map((province) => {
                const cell = row.cells[province.id];
                const tone = cellTone(cell);
                return (
                  <a
                    key={province.id}
                    className={`trf-mx-cell ${tone}`}
                    href={cell.url}
                    target="_blank"
                    rel="noreferrer"
                    title={cell.title || '未在已抓取的地方文件中找到对应文本'}
                  >
                    {cell.status === 'respond' && (
                      <>
                        <b>+{cell.lag} 天</b>
                        <span>{mmdd(cell.date ?? '')}</span>
                      </>
                    )}
                    {cell.status === 'pre' && (
                      <>
                        <b>{cell.lag} 天</b>
                        <span>早于中央</span>
                      </>
                    )}
                    {cell.status === 'likely' && (
                      <>
                        <b>~+{cell.lag} 天</b>
                        <span>待核</span>
                      </>
                    )}
                    {cell.status === 'none' && <span className="trf-none">未见</span>}
                    {cell.status === 'outside' && (
                      <span
                        className="trf-outside"
                        title={
                          cell.windowGap?.kind === 'after'
                            ? `该地栏目只更新到 ${cell.windowGap.province}，这一天之后的发文无法观察`
                            : `该地栏目最早只回溯到 ${cell.windowGap?.province}，此前的发文无法观察`
                        }
                      >
                        超出窗口
                      </span>
                    )}
                    {cell.status === 'uncovered' && <span className="trf-none">—</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
        <div className="trf-legend trf-legend-note">
          <span><i className="chip fast" />30 天内</span>
          <span><i className="chip mid" />31—60 天</span>
          <span><i className="chip slow" />60 天以上</span>
          <span><i className="chip pre" />地方早于中央</span>
          <span><i className="chip outside" />超出该地观测窗</span>
        </div>
      </section>

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>这批数据能读出什么</h2>
          <p>每一条都由上面的矩阵直接算出，可回到原文逐条核对。</p>
        </header>
        <ol className="trf-findings">
          {result.findings.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
      </section>

      {attention && (
        <section className="trf-card">
          <header className="trf-card-head">
            <h2>各省政策注意力结构</h2>
            <p>
              这一块不依赖与中央一一对应，只看各地自己发的文件在关注什么。数值是命中条数，括号内为占本省政策文件的比重——
              用来观察地区之间的结构性差异。
            </p>
          </header>
          <div
            className="trf-heat"
            style={{ gridTemplateColumns: `150px repeat(${attention.provinces.length}, minmax(88px, 1fr))` }}
          >
            <div className="trf-heat-head">主题</div>
            {attention.provinces.map((province) => (
              <div key={province.id} className="trf-heat-head">
                {province.short}
                <em>{province.total} 条</em>
              </div>
            ))}
            {attention.buckets.map((bucket) => (
              <div key={bucket.id} className="trf-heat-row">
                <div className="trf-heat-label">{bucket.label}</div>
                {attention.provinces.map((province) => {
                  const cell = attention.cells[`${bucket.id}:${province.id}`];
                  const intensity = attention.maxShare > 0 ? cell.share / attention.maxShare : 0;
                  return (
                    <div
                      key={province.id}
                      className="trf-heat-cell"
                      style={{ background: `rgba(46, 230, 178, ${(intensity * 0.42).toFixed(3)})` }}
                      title={`${province.short}｜${bucket.label}｜${cell.count} 条，占 ${(cell.share * 100).toFixed(1)}%`}
                    >
                      <b>{cell.count}</b>
                      <span>{(cell.share * 100).toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="trf-foot">
            注：一条文件可同时命中多个主题（例如"促进养老服务消费"同时计入养老与消费），因此各主题之和不等于文件总数。
            另需注意各地样本量差异极大（从十几份到近四百份），占比只能横向看结构，不能当成强度比较。
          </p>
        </section>
      )}

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>逐条对照</h2>
          <p>只列观察到跟进或先行的地方文件，未匹配的不在此表。</p>
        </header>
        <table className="trf-table">
          <thead>
            <tr>
              <th>主题</th>
              <th>省份</th>
              <th>地方文件</th>
              <th>发布日期</th>
              <th>时滞</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.flatMap((row) =>
              Object.entries(row.cells)
                .filter(([, cell]) => cell.status !== 'none' && cell.status !== 'uncovered' && cell.status !== 'outside')
                .map(([id, cell]) => {
                  const province = result.provinces.find((item) => item.id === id);
                  return (
                    <tr key={`${row.theme.id}-${id}`} className={cell.status === 'pre' ? 'pre' : cell.status === 'likely' ? 'likely' : ''}>
                      <td>{row.theme.theme}</td>
                      <td>{province?.short}</td>
                      <td>
                        <a href={cell.url} target="_blank" rel="noreferrer">
                          {cell.title}
                          <ArrowUpRight size={12} />
                        </a>
                      </td>
                      <td className="trf-num">{cell.date}</td>
                      <td className="trf-num">
                        {cell.status === 'respond'
                          ? `+${cell.lag} 天`
                          : cell.status === 'likely'
                            ? `~+${cell.lag} 天（待核）`
                            : `早 ${Math.abs(cell.lag ?? 0)} 天`}
                      </td>
                    </tr>
                  );
                }),
            )}
          </tbody>
        </table>
      </section>

      <section className="trf-card trf-scope">
        <header className="trf-card-head">
          <h2>口径与边界</h2>
        </header>
        <ul>
          <li>
            <b>这一页和「省级影响」不是同一套东西，不能互相印证。</b>省级影响给全国 31 个省级单位打的分数，
            是"政策渠道权重 × 省份经济结构"的<strong>推算值</strong>——不依赖任何地方发文，所以每个省都有分。
            本页的时滞是<strong>实测值</strong>——只在抓得到政策文件的这 {result.coverage.usable} 个地方单元存在，
            抓不到的地方宁可留空。前者回答"如果落地，哪里受影响更大"，后者回答"实际发文隔了几天"；一个是模型，一个是观测。
          </li>
          <li>
            <b>可用性按"近 90 天还在不在更新"判，不数历史存量。</b>门槛是近 90 天至少 6 份政策文件、且栏目更新到
            10 月 20 日之后。有的栏目三年攒了几十条、近三个月一条没发，拿它判断"地方是否跟进"必然大量假阴性。
          </li>
          <li>
            <b>每地的观测窗不一样宽，窗外的不做判断。</b>各栏目回溯深度从数月到数年不等，
            {usable
              .map((province) => `${province.short} ${province.earliest ?? '—'} 起`)
              .join('、')}
            。中央发文日落在窗口外的格子标"超出窗口"——既不能说做了，也不能说没做。
          </li>
          <li>
            <b>这是主题级配对，不是逐份文件配对。</b>中央与地方文件之间没有官方对应编号，只能按主题关键词在标题里匹配。
          </li>
          <li>
            <b>"未见文件"不等于"地方没做"。</b>很多落实发生在部门文件、会议部署或不出文的执行里；本页只统计各地门户政策文件栏目中能抓到的文本。
          </li>
          <li>
            <b>各栏目口径不一致。</b>
            {result.provinces
              .filter((province) => province.usable)
              .map((province) => `${province.short}（${province.kind}）`)
              .join('、')}
            ——有的含部门文件，有的只收政府及办公厅文件，横向比较时要记住这一层差异。
          </li>
          <li>
            <b>只算"最早一份"。</b>同一主题下地方可能连发多份文件，这里只看首份日期，用于回答"什么时候开始动"，不评价后续力度。
          </li>
          <li>
            <b>时滞为负要换个方向解释。</b>地方文件早于中央文件，更可能是地方先行试点、后来被中央吸收，而不是"地方响应中央"。
          </li>
        </ul>
      </section>
    </section>
  );
}
