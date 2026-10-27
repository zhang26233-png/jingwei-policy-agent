import { useMemo } from 'react';
import type { SourceStatus } from '../lib/api';
import './SourceRadar.css';

interface SourceRadarProps {
  sources: SourceStatus[];
  total: number;
  updatedAt: string;
  windowDays: number;
}

/** 七个源的名字太长，图例里放不下。按机构给短名，认不出时才截断。 */
const SHORT_LABELS: Array<[RegExp, string]> = [
  [/税政/, '税政司'],
  [/财政新闻/, '财政新闻'],
  [/条法|人民银行|央行/, '人民银行'],
  [/通知公告|发改/, '发改委'],
  [/统计|数据发布/, '统计局'],
  [/中央政策|国务院/, '国务院'],
  [/政策发布/, '财政部'],
];

function shortName(name: string) {
  for (const [pattern, label] of SHORT_LABELS) {
    if (pattern.test(name)) return label;
  }
  const tail = name.includes('·') ? name.split('·').pop()!.trim() : name;
  return tail.length > 4 ? tail.slice(0, 4) : tail;
}

function clock(iso: string) {
  if (!iso || iso.length < 16) return '—';
  return `${iso.slice(5, 7)}/${iso.slice(8, 10)} ${iso.slice(11, 16)}`;
}

/**
 * 首页待机态的信源雷达。
 * 存在的理由：待机时右侧原本是一张空卡片，等于把首屏最大的视觉位置浪费掉。
 * 这里把它换成一个"正在监听"的仪表——7 个官方源环绕中心，条数决定半径。
 */
export function SourceRadar({ sources, total, updatedAt, windowDays }: SourceRadarProps) {
  const nodes = useMemo(() => {
    const list = sources.length > 0 ? sources : [];
    const max = Math.max(1, ...list.map((item) => item.count || 0));
    const step = 360 / Math.max(1, list.length);
    return list.map((item, index) => {
      const angle = (-90 + index * step) * (Math.PI / 180);
      const ratio = (item.count || 0) / max;
      const radius = 44 + ratio * 52;
      return {
        id: item.id,
        label: shortName(item.name),
        count: item.count || 0,
        ok: item.ok,
        x: 120 + Math.cos(angle) * radius,
        y: 120 + Math.sin(angle) * radius,
        lx: 120 + Math.cos(angle) * 104,
        ly: 120 + Math.sin(angle) * 104,
      };
    });
  }, [sources]);

  const okCount = sources.filter((item) => item.ok).length;

  return (
    <div className="radar">
      <div className="radar-head">
        <span className="radar-live">
          <i /> 监听中
        </span>
        <span className="radar-window">近 {windowDays} 天窗口</span>
      </div>

      <div className="radar-stage">
        <svg viewBox="0 0 240 240" className="radar-svg" role="img" aria-label="官方信源分布">
          <defs>
            <radialGradient id="radar-core" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2ee6b2" stopOpacity="0.22" />
              <stop offset="60%" stopColor="#2ee6b2" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#2ee6b2" stopOpacity="0" />
            </radialGradient>
          </defs>

          <circle cx="120" cy="120" r="106" fill="url(#radar-core)" />

          {[38, 68, 98].map((r) => (
            <circle key={r} cx="120" cy="120" r={r} className="radar-ring" />
          ))}

          {/* 外圈刻度：仪表盘的关键暗示，比单纯的同心圆更有"机器在转"的感觉 */}
          {Array.from({ length: 60 }).map((_, index) => {
            const angle = (index * 6 * Math.PI) / 180;
            const inner = index % 5 === 0 ? 98 : 102;
            return (
              <line
                key={index}
                x1={120 + Math.cos(angle) * inner}
                y1={120 + Math.sin(angle) * inner}
                x2={120 + Math.cos(angle) * 106}
                y2={120 + Math.sin(angle) * 106}
                className="radar-tick"
              />
            );
          })}
          <line x1="22" y1="120" x2="218" y2="120" className="radar-axis" />
          <line x1="120" y1="22" x2="120" y2="218" className="radar-axis" />

          {nodes.map((node) => (
            <line
              key={`spoke-${node.id}`}
              x1="120"
              y1="120"
              x2={node.x}
              y2={node.y}
              className="radar-spoke"
            />
          ))}

          {nodes.map((node) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={node.count > 0 ? 4.4 : 2.6}
                className={node.ok && node.count > 0 ? 'radar-dot is-ok' : 'radar-dot'}
              />
              {node.ok && node.count > 0 && (
                <circle cx={node.x} cy={node.y} r="4.4" className="radar-dot-halo" />
              )}
            </g>
          ))}

          <circle cx="120" cy="120" r="2" className="radar-core" />
        </svg>

        <div className="radar-sweep" aria-hidden="true" />

        <div className="radar-center">
          <span className="radar-center-num">{total}</span>
          <span className="radar-center-cap">条语料</span>
        </div>
      </div>

      <ul className="radar-legend">
        {nodes.map((node) => (
          <li key={node.id} className={node.ok ? '' : 'is-down'}>
            <i className={node.ok ? 'is-ok' : ''} />
            <span>{node.label}</span>
            <b>{node.count}</b>
          </li>
        ))}
        {nodes.length === 0 && <li className="is-muted">来源状态待连接</li>}
      </ul>

      <p className="radar-foot">
        {okCount}/{sources.length || 7} 源在线 · 最近入库 {clock(updatedAt)}
      </p>
    </div>
  );
}
