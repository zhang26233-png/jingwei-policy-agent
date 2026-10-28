import { useMemo, useState } from 'react';
import { ArrowUpRight, Download, Info } from 'lucide-react';
import type { Policy } from '../types';
import { QUADRANT_META, buildSynergy, type Quadrant } from '../lib/synergy';
import { polarityEvidence } from '../lib/province';
import { buildSynergyReport, downloadText } from '../lib/report';
import './synergy.css';

interface SynergyViewProps {
  policies: Policy[];
  onOpenPolicy: (id: string) => void;
}

// 画布与绘图区：自适应域由数据决定，但必须把真实刻度标出来，不能只给一个好看的框
const PLOT = { x: 64, y: 36, w: 556, h: 312 };

const quadrantTone = (quadrant: Quadrant) => QUADRANT_META[quadrant].tone;

export function SynergyView({ policies, onOpenPolicy }: SynergyViewProps) {
  const result = useMemo(() => buildSynergy(policies), [policies]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const channels = result.channels;
  const selected = channels.find((channel) => channel.id === selectedId) ?? channels[0] ?? null;

  // 抽检样本按渠道分层：只抽头条会把大渠道占满，看不出各渠道的判定质量
  const policyById = useMemo(() => new Map(policies.map((item) => [item.id, item])), [policies]);
  const sample = useMemo(() => {
    const rows: {
      id: string;
      short: string;
      date: string;
      issuer: string;
      channel: string;
      polarity: number;
      up: string[];
      down: string[];
    }[] = [];
    const queues = channels.map((channel) => ({ channel: channel.short, members: channel.coherence.members }));
    const seen = new Set<string>();
    for (let round = 0; rows.length < 30; round += 1) {
      let added = false;
      for (const queue of queues) {
        const member = queue.members[round];
        if (!member || seen.has(member.id)) continue;
        const policy = policyById.get(member.id);
        if (!policy) continue;
        const evidence = polarityEvidence(policy);
        seen.add(member.id);
        rows.push({
          id: member.id,
          short: member.title,
          date: member.date,
          issuer: member.issuer,
          channel: queue.channel,
          polarity: evidence.polarity,
          up: evidence.up,
          down: evidence.down,
        });
        added = true;
        if (rows.length >= 30) break;
      }
      if (!added) break;
    }
    return rows;
  }, [channels, policyById]);

  const exportSample = () => {
    const head = ['政策ID', '标题', '发文机关', '发布日期', '所属渠道', '系统判定方向', '扩张词', '收紧词', '人工判定', '备注'];
    const body = sample.map((row) => [
      row.id,
      row.short,
      row.issuer,
      row.date,
      row.channel,
      row.polarity === 1 ? '扩张' : row.polarity === -1 ? '收紧' : '未定',
      row.up.join(' '),
      row.down.join(' '),
      '',
      '',
    ]);
    const csv = [head, ...body]
      .map((cols) => cols.map((col) => `"${String(col).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadText(`宏策智研_编码抽检_${new Date().toISOString().slice(0, 10)}.csv`, `\ufeff${csv}`, 'text/csv;charset=utf-8');
  };

  if (channels.length === 0) {
    return (
      <section className="syn-page">
        <header className="syn-head">
          <span className="syn-kicker">POLICY SYNERGY</span>
          <h1>政策协同：一致性与可执行性</h1>
          <p>当前语料里没有可用的政策文件，先采集再回来看。</p>
        </header>
      </section>
    );
  }

  // 轴域：按本期分布自适应并留边距，两端标真实分数，避免"看起来很散"的假象
  const pcis = channels.map((channel) => channel.pci);
  const peis = channels.map((channel) => channel.pei);
  const domain = (values: number[]) => {
    const min = Math.max(0, Math.min(...values) - 8);
    const max = Math.min(100, Math.max(...values) + 8);
    return { min, max, span: Math.max(12, max - min) };
  };
  const dx = domain(pcis);
  const dy = domain(peis);
  const px = (value: number) => PLOT.x + ((value - dx.min) / dx.span) * PLOT.w;
  const py = (value: number) => PLOT.y + PLOT.h - ((value - dy.min) / dy.span) * PLOT.h;
  const splitX = Math.min(PLOT.x + PLOT.w - 6, Math.max(PLOT.x + 6, px(result.split.pci)));
  const splitY = Math.min(PLOT.y + PLOT.h - 6, Math.max(PLOT.y + 6, py(result.split.pei)));

  // 点只标序号，名字放到图下的图例里——九个中文渠道名挤在散点周围必然会压字
  const points = channels.map((channel) => ({
    channel,
    index: channels.indexOf(channel) + 1,
    cx: px(channel.pci),
    cy: py(channel.pei),
  }));

  const quadrantCount = channels.reduce<Record<Quadrant, number>>(
    (acc, channel) => ({ ...acc, [channel.quadrant]: acc[channel.quadrant] + 1 }),
    { synergy: 0, single: 0, idle: 0, conflict: 0 },
  );

  return (
    <section className="syn-page">
      <header className="syn-head">
        <div>
          <span className="syn-kicker">POLICY SYNERGY · 协同测度</span>
          <h1>政策协同：取向一致性与可执行性</h1>
          <p>
            把"政策之间合不合拍"拆成两个可复算的指数：横轴衡量同一渠道上的政策是否朝一个方向使劲，
            纵轴衡量这些政策写没写清目标、责任、资金、时限和考核安排。九条渠道落在哪个象限，比任何单项得分更有解释力。
          </p>
        </div>
        <div className="syn-hero">
          <div className="syn-hero-card">
            <span>总体一致性 PCI</span>
            <b>{result.overall.pci}</b>
            <small>按渠道政策数加权</small>
          </div>
          <div className="syn-hero-card">
            <span>总体可执行性 PEI</span>
            <b>{result.overall.pei}</b>
            <small>{result.overall.policyCount} 份政策文件均值</small>
          </div>
          <button
            type="button"
            className="syn-export"
            onClick={() =>
              downloadText(`宏策智研_协同测度_${new Date().toISOString().slice(0, 10)}.md`, buildSynergyReport(result))
            }
          >
            <Download size={13} />
            导出测度报告
          </button>
        </div>
      </header>

      <div className="syn-readout">
        {result.narrative.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      <div className="syn-grid">
        <div className="syn-chart-card">
          <div className="syn-card-head">
            <h2>渠道协同分布</h2>
            <span>点击任意点查看该渠道的分项与证据</span>
          </div>
          <svg
            className="syn-chart"
            viewBox={`0 0 ${PLOT.x * 2 + PLOT.w} ${PLOT.y * 2 + PLOT.h + 46}`}
            role="img"
            aria-label="政策协同四象限散点图"
          >
            <rect
              x={PLOT.x}
              y={PLOT.y}
              width={PLOT.w}
              height={PLOT.h}
              fill="none"
              stroke="var(--line)"
              strokeWidth={0.5}
            />
            <line x1={splitX} y1={PLOT.y} x2={splitX} y2={PLOT.y + PLOT.h} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3 4" />
            <line x1={PLOT.x} y1={splitY} x2={PLOT.x + PLOT.w} y2={splitY} stroke="var(--line)" strokeWidth={0.5} strokeDasharray="3 4" />

            <text x={PLOT.x + PLOT.w - 8} y={PLOT.y + 16} textAnchor="end" className="syn-zone is-good">
              {QUADRANT_META.synergy.label}
            </text>
            <text x={PLOT.x + 8} y={PLOT.y + 16} className="syn-zone">
              {QUADRANT_META.single.label}
            </text>
            <text x={PLOT.x + 8} y={PLOT.y + PLOT.h - 8} className="syn-zone">
              {QUADRANT_META.conflict.label}
            </text>
            <text x={PLOT.x + PLOT.w - 8} y={PLOT.y + PLOT.h - 8} textAnchor="end" className="syn-zone">
              {QUADRANT_META.idle.label}
            </text>

            {points.map(({ channel, index, cx, cy }) => {
              const active = selected?.id === channel.id;
              return (
                <g
                  key={channel.id}
                  className={`syn-dot is-${quadrantTone(channel.quadrant)} ${active ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(channel.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') setSelectedId(channel.id);
                  }}
                >
                  <title>{`${index} ${channel.name}｜一致性 ${channel.pci}｜可执行性 ${channel.pei}｜${channel.policyCount} 项`}</title>
                  <circle cx={cx} cy={cy} r={active ? 8 : 6.5} />
                  <circle cx={cx} cy={cy} r={13} className="syn-dot-hit" />
                  <text x={cx} y={cy + 3} textAnchor="middle" className="syn-dot-num">
                    {index}
                  </text>
                </g>
              );
            })}

            <text x={PLOT.x} y={PLOT.y + PLOT.h + 22} className="syn-axis">
              一致性 {dx.min}
            </text>
            <text x={PLOT.x + PLOT.w} y={PLOT.y + PLOT.h + 22} textAnchor="end" className="syn-axis">
              {dx.max}
            </text>
            <text x={PLOT.x + PLOT.w / 2} y={PLOT.y + PLOT.h + 22} textAnchor="middle" className="syn-axis is-name">
              政策一致性 PCI →
            </text>
            <text x={PLOT.x} y={PLOT.y - 12} className="syn-axis">
              可执行性 {dy.max}
            </text>
            <text x={PLOT.x} y={PLOT.y + PLOT.h - 10} className="syn-axis">
              {dy.min}
            </text>
            <text x={PLOT.x} y={PLOT.y + PLOT.h + 42} className="syn-axis is-name">
              纵轴：政策可执行性 PEI ↑
            </text>
          </svg>
          <ul className="syn-legend">
            {points.map(({ channel, index }) => (
              <li key={channel.id}>
                <button
                  type="button"
                  className={selected?.id === channel.id ? 'is-active' : ''}
                  onClick={() => setSelectedId(channel.id)}
                >
                  <i className={`syn-legend-idx is-${quadrantTone(channel.quadrant)}`}>{index}</i>
                  <span>{channel.short}</span>
                  <em>{channel.policyCount} 项</em>
                  <b>
                    {channel.pci} / {channel.pei}
                  </b>
                </button>
              </li>
            ))}
          </ul>
          <p className="syn-legend-foot">图例数值为「一致性 PCI / 可执行性 PEI」。</p>
          <div className="syn-read-guide">
            <h3>怎么看这张图</h3>
            <ul>
              <li>
                <b>右上</b>方向一致、条件相对最齐——本期 {quadrantCount.synergy} 条渠道落在这里。
              </li>
              <li>
                <b>右下</b>方向一致但缺条件，本期 {quadrantCount.idle} 条——政策口径统一，目标刻度、资金或考核跟不上。
              </li>
              <li>
                <b>左上</b>单个文件写得实，但渠内方向互相抵消，本期 {quadrantCount.single} 条。
              </li>
              <li>
                <b>左下</b>方向散、条件也虚，本期 {quadrantCount.conflict} 条，是最需要往下拆解的一类。
              </li>
            </ul>
            <p>分界线取本期九条渠道的中位数（一致性 {result.split.pci} 分、可执行性 {result.split.pei} 分），是相对位置，不是合格线。</p>
          </div>
        </div>

        <div className="syn-detail">
          {selected && (
            <>
              <div className="syn-card-head">
                <h2>{selected.name}</h2>
                <span className={`syn-tag is-${quadrantTone(selected.quadrant)}`}>
                  {QUADRANT_META[selected.quadrant].label}
                </span>
              </div>
              <p className="syn-detail-desc">{QUADRANT_META[selected.quadrant].desc}。</p>
              <div className="syn-detail-nums">
                <div>
                  <b>{selected.pci}</b>
                  <span>一致性 PCI</span>
                </div>
                <div>
                  <b>{selected.pei}</b>
                  <span>可执行性 PEI</span>
                </div>
                <div>
                  <b>{selected.policyCount}</b>
                  <span>本渠道政策数</span>
                </div>
              </div>

              <h3>一致性分项</h3>
              <ul className="syn-parts">
                {selected.coherence.parts.map((part) => (
                  <li key={part.id}>
                    <span className="syn-part-label">{part.label}</span>
                    <span className={`syn-part-score ${part.score === null ? 'is-na' : ''}`}>
                      {part.score === null ? '不可判定' : part.score}
                    </span>
                    <span className="syn-part-detail">{part.detail}</span>
                  </li>
                ))}
              </ul>

              <h3>可执行性分项</h3>
              <ul className="syn-parts">
                {selected.effectiveness.items.map((item) => (
                  <li key={item.id}>
                    <span className="syn-part-label">{item.label}</span>
                    <span className="syn-part-score">{item.score}</span>
                    <span className="syn-part-detail">{item.note}</span>
                  </li>
                ))}
              </ul>

              {selected.coherence.opposing.expansion.length > 0 && selected.coherence.opposing.restriction.length > 0 && (
                <>
                  <h3>方向并存</h3>
                  <ul className="syn-conflicts">
                    <li>
                      <i className="syn-pol is-up">扩张</i>
                      <div>
                        {selected.coherence.opposing.expansion.map((item) => (
                          <button key={item.id} type="button" onClick={() => onOpenPolicy(item.id)}>
                            {quoted(item.title)}
                          </button>
                        ))}
                      </div>
                    </li>
                    <li>
                      <i className="syn-pol is-down">收紧</i>
                      <div>
                        {selected.coherence.opposing.restriction.map((item) => (
                          <button key={item.id} type="button" onClick={() => onOpenPolicy(item.id)}>
                            {quoted(item.title)}
                          </button>
                        ))}
                      </div>
                    </li>
                    <li className="is-hint">
                      <span>
                        两条方向并列，但系统只判方向、不判对象是否相同；是否构成实质冲突需回原文比对。本渠道净效应见下方分项。
                      </span>
                    </li>
                  </ul>
                </>
              )}

              <h3>本渠道文件</h3>
              <ul className="syn-members">
                {selected.coherence.members.slice(0, 6).map((member) => (
                  <li key={member.id}>
                    <i className={`syn-pol is-${member.polarity === 1 ? 'up' : member.polarity === -1 ? 'down' : 'flat'}`}>
                      {member.polarity === 1 ? '扩张' : member.polarity === -1 ? '收紧' : '未定'}
                    </i>
                    <button type="button" onClick={() => onOpenPolicy(member.id)}>
                      {member.title}
                      <ArrowUpRight size={11} />
                    </button>
                    <span>{member.date}</span>
                  </li>
                ))}
              </ul>

              {selected.coherence.notes.length > 0 && (
                <p className="syn-note">{selected.coherence.notes.join('；')}</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="syn-table-card">
        <div className="syn-card-head">
          <h2>九渠道对账表</h2>
          <span>同一份数据，逐项列出，便于复核</span>
        </div>
        <table className="syn-table">
          <thead>
            <tr>
              <th>渠道</th>
              <th>政策</th>
              <th>PCI</th>
              <th>横向</th>
              <th>时序</th>
              <th>目标—工具</th>
              <th>PEI</th>
              <th>最弱项</th>
              <th>象限</th>
            </tr>
          </thead>
          <tbody>
            {channels.map((channel) => (
              <tr
                key={channel.id}
                className={selected?.id === channel.id ? 'is-active' : ''}
                onClick={() => setSelectedId(channel.id)}
              >
                <td>
                  <b>{channel.short}</b>
                  <small>{channel.desc}</small>
                </td>
                <td className="is-num">{channel.policyCount}</td>
                <td className="is-num">{channel.pci}</td>
                <td className="is-num">{fmt(channel.coherence.parts[0].score)}</td>
                <td className="is-num">{fmt(channel.coherence.parts[1].score)}</td>
                <td className="is-num">{fmt(channel.coherence.parts[2].score)}</td>
                <td className="is-num">{channel.pei}</td>
                <td>{channel.effectiveness.weakestItem?.label ?? '—'}</td>
                <td>
                  <span className={`syn-tag is-${quadrantTone(channel.quadrant)}`}>
                    {QUADRANT_META[channel.quadrant].label}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="syn-sample">
        <div className="syn-card-head">
          <h2>方向编码抽检</h2>
          <span>按渠道分层抽 30 条，供人工复核</span>
        </div>
        <p className="syn-sample-note">
          下表每一行都给出系统判定的方向与命中的关键词。请只判断"系统判得对不对"，不必评估政策本身。
          复核完把一致性比例填进论文的信度一节——没有这个数字，"方向由 AI 判定"就是不可信的。
        </p>
        <div className="syn-sample-scroll">
          <table className="syn-sample-table">
            <thead>
              <tr>
                <th>政策</th>
                <th>渠道</th>
                <th>系统判定</th>
                <th>命中词</th>
              </tr>
            </thead>
            <tbody>
              {sample.map((row) => (
                <tr key={row.id}>
                  <td>
                    <button type="button" onClick={() => onOpenPolicy(row.id)}>
                      {row.short}
                    </button>
                  </td>
                  <td>{row.channel}</td>
                  <td className={row.polarity === 1 ? 'is-up' : row.polarity === -1 ? 'is-down' : ''}>
                    {row.polarity === 1 ? '扩张' : row.polarity === -1 ? '收紧' : '未定'}
                  </td>
                  <td>
                    <div className="syn-sample-words">
                      {row.up.slice(0, 3).map((word) => (
                        <i key={word} className="is-up">
                          {word}
                        </i>
                      ))}
                      {row.down.slice(0, 3).map((word) => (
                        <i key={word} className="is-down">
                          {word}
                        </i>
                      ))}
                      {row.up.length === 0 && row.down.length === 0 && <span>无方向词</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="syn-sample-foot">
          <p>共 {sample.length} 条。导出后新增两列填写人工判定与备注，即可算出编码一致率。</p>
          <button type="button" onClick={exportSample}>
            <Download size={13} />
            导出标注表 CSV
          </button>
        </div>
      </div>

      <div className="syn-method">
        <div className="syn-card-head">
          <h2>
            <Info size={13} /> 口径与边界
          </h2>
          <span>换一条线会改变归属，所以口径要写出来</span>
        </div>
        <div className="syn-method-cols">
          <div>
            <h3>指数怎么算</h3>
            <ul>
              {result.method.map((item) => (
                <li key={item.id}>
                  <b>{item.label}</b>
                  <span>{item.how}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>这套东西测不到什么</h3>
            <ul>
              {result.caveats.map((caveat) => (
                <li key={caveat}>
                  <span>{caveat}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

const fmt = (value: number | null) => (value === null ? '—' : String(value));

// 文件标题本身常带书名号，再包一层会变成《《…》，这里统一剥掉原有的
const quoted = (text: string) => `《${text.replace(/[《》]/g, '')}》`;
