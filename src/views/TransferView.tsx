import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import type { Policy } from '../types';
import { fetchLocals } from '../lib/api';
import { buildAttention, buildTransfer, type Cell, type LocalPayload } from '../lib/transfer';
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
  const toneOf = (id: string) =>
    PROVINCE_TONE[Math.max(0, usable.findIndex((p) => p.id === id)) % PROVINCE_TONE.length];

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
    return 'none';
  };

  return (
    <section className="trf-page">
      <header className="trf-head">
        <div className="trf-head-main">
          <span className="trf-kicker">CENTRAL → LOCAL · 央地传导</span>
          <h1>中央发文之后，地方什么时候动</h1>
          <p>
            以中央近期出台的八项重点政策为锚，到各省已公开的政策文件里找对应文本，算发文到落地的时间差。
            看三件事：地方有没有接、隔了几天、各省之间差多少。
          </p>
        </div>
        <div className="trf-hero">
          <div className="trf-hero-card">
            <span>可用省级单位</span>
            <b>
              {result.coverage.usable}
              <small> / {result.coverage.totalProvinces}</small>
            </b>
            <em>已接入 {result.coverage.attempted} 个</em>
          </div>
          <div className="trf-hero-card">
            <span>观察到跟进</span>
            <b>{result.summary.respondPairs}</b>
            <em>共 {result.summary.totalPairs} 个主题×省份组合</em>
          </div>
          <div className="trf-hero-card">
            <span>中位时滞</span>
            <b>{result.summary.medianLag ?? '—'}</b>
            <em>天（仅算已跟进样本）</em>
          </div>
        </div>
      </header>

      <div className="trf-banner">
        <Info size={15} />
        <div>
          <b>覆盖率必须先说清楚：</b>全国 31 个省级单位，本轮只跑通 {result.coverage.attempted} 个门户，其中{' '}
          {result.coverage.usable} 个达到"条目数与时间跨度可用"的门槛（
          {usable.map((province) => province.name).join('、') || '无'}），合计 {result.coverage.items} 条地方政策文件。
          其余省份抓不到，不等于没发文——这张图描述的是<strong>样本内的传导差异</strong>，不能当全国结论用。
        </div>
      </div>

      <div className="trf-prov-grid">
        {result.provinces.map((province) => (
          <div key={province.id} className={`trf-prov ${province.usable ? 'ok' : 'off'}`}>
            <div className="trf-prov-name">
              {province.name}
              <span>{province.usable ? '可用' : '未纳入'}</span>
            </div>
            <div className="trf-prov-meta">
              {province.count} 条 · {province.earliest ?? '—'} 起
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

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>响应矩阵：谁接了、隔几天</h2>
          <p>格子里的天数＝地方最早对应文件距中央发文的天数；点开可回地方原文。</p>
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
        </div>
      </section>

      <section className="trf-card">
        <header className="trf-card-head">
          <h2>读出来的三件事</h2>
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
                .filter(([, cell]) => cell.status !== 'none' && cell.status !== 'uncovered')
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
            <b>这是主题级配对，不是逐份文件配对。</b>中央与地方文件之间没有官方对应编号，只能按主题关键词在标题里匹配。
          </li>
          <li>
            <b>"未见文件"不等于"地方没做"。</b>很多落实发生在部门文件、会议部署或不出文的执行里；本页只统计省级门户政策文件栏目中能抓到的文本。
          </li>
          <li>
            <b>各栏目口径不一致。</b>
            {result.provinces
              .filter((province) => province.usable)
              .map((province) => `${province.short}（${province.kind}）`)
              .join('、')}
            ——有的含部门文件，有的只收省政府及办公厅文件，横向比较时要记住这一层差异。
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
