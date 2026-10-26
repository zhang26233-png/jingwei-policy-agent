// 政策关系图：环形布局 + 关系类型着色。点击节点查看该政策与其他政策的关系。
import type { RelationResult } from '../lib/relations';
import { RELATION_META } from '../lib/relations';

interface Props {
  data: RelationResult;
  activeId: string | null;
  onSelect: (id: string) => void;
}

const WIDTH = 760;
const HEIGHT = 570;
const CX = WIDTH / 2;
const CY = 284;
const RX = 236;
const RY = 188;

const GRADE_COLOR: Record<string, { fill: string; stroke: string }> = {
  S: { fill: '#e3ece7', stroke: '#244f44' },
  A: { fill: '#e6eef4', stroke: '#355e7c' },
  B: { fill: '#f6eeDC', stroke: '#9b6b18' },
  C: { fill: '#eeeadf', stroke: '#96998f' },
};

export function RelationGraph({ data, activeId, onSelect }: Props) {
  const { nodes, edges, combination } = data;
  if (nodes.length === 0) {
    return <p className="bp-empty">本轮没有可用的政策关系数据。</p>;
  }

  const positions = new Map<string, { x: number; y: number; angle: number }>();
  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
    positions.set(node.id, {
      x: CX + Math.cos(angle) * RX,
      y: CY + Math.sin(angle) * RY,
      angle,
    });
  });

  const activeEdges = new Set(
    activeId ? edges.filter((edge) => edge.from === activeId || edge.to === activeId).map((edge) => edge.id) : [],
  );
  const activeNeighbors = new Set<string>();
  if (activeId) {
    for (const edge of edges) {
      if (edge.from === activeId) activeNeighbors.add(edge.to);
      if (edge.to === activeId) activeNeighbors.add(edge.from);
    }
  }

  return (
    <div className="rg-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="rg-svg" role="img" aria-label="政策相互关系网络图">
        <defs>
          {Object.entries(RELATION_META).map(([kind, meta]) => (
            <marker
              key={kind}
              id={`rg-arrow-${kind}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={meta.color} />
            </marker>
          ))}
        </defs>

        <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill="none" stroke="#dfdacd" strokeDasharray="3 6" />

        {edges.map((edge, index) => {
          const a = positions.get(edge.from);
          const b = positions.get(edge.to);
          if (!a || !b) return null;
          const meta = RELATION_META[edge.kind];
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length = Math.hypot(dx, dy) || 1;
          const bow = (edge.strength * 52 + 14) * (index % 2 === 0 ? 1 : -1);
          const controlX = mx + (-dy / length) * bow;
          const controlY = my + (dx / length) * bow;
          const dimmed = activeId ? !activeEdges.has(edge.id) : false;
          return (
            <g key={edge.id} opacity={dimmed ? 0.12 : 1}>
              <path
                d={`M ${a.x} ${a.y} Q ${controlX} ${controlY} ${b.x} ${b.y}`}
                fill="none"
                stroke={meta.color}
                strokeWidth={1 + edge.strength * 2.4}
                strokeDasharray={meta.dash}
                markerEnd={`url(#rg-arrow-${edge.kind})`}
                opacity={0.78}
              >
                <title>{`${meta.label}：${edge.note}`}</title>
              </path>
            </g>
          );
        })}

        {nodes.map((node) => {
          const position = positions.get(node.id);
          if (!position) return null;
          const radius = 15 + (node.score / 100) * 11;
          const palette = GRADE_COLOR[node.grade] ?? GRADE_COLOR.C;
          const isActive = activeId === node.id;
          const isNeighbor = activeNeighbors.has(node.id);
          const dimmed = activeId && !isActive && !isNeighbor;
          const labelX = CX + Math.cos(position.angle) * (RX + 30);
          const labelY = CY + Math.sin(position.angle) * (RY + 26);
          return (
            <g
              key={node.id}
              opacity={dimmed ? 0.28 : 1}
              onClick={() => onSelect(node.id)}
              className="rg-node"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') onSelect(node.id);
              }}
            >
              <title>{`${node.label}\n优先级 ${node.score}（${node.grade}）｜${node.issuer} ${node.date}`}</title>
              {isActive && <circle cx={position.x} cy={position.y} r={radius + 7} fill="none" stroke={palette.stroke} strokeDasharray="2 3" />}
              <circle
                cx={position.x}
                cy={position.y}
                r={radius}
                fill={palette.fill}
                stroke={palette.stroke}
                strokeWidth={isActive ? 2.6 : 1.4}
              />
              <text x={position.x} y={position.y + 4} textAnchor="middle" className="rg-grade" fill={palette.stroke}>
                {node.grade}
              </text>
              <text
                x={labelX}
                y={labelY}
                textAnchor={Math.cos(position.angle) > 0.35 ? 'start' : Math.cos(position.angle) < -0.35 ? 'end' : 'middle'}
                className="rg-label"
                fill="#1c2521"
              >
                {node.short}
              </text>
            </g>
          );
        })}

        <text x={CX} y={CY - 6} textAnchor="middle" className="rg-center-main" fill="#244f44">
          {combination.direction}
        </text>
        <text x={CX} y={CY + 18} textAnchor="middle" className="rg-center-sub" fill="#70756d">
          {`${nodes.length} 项 · 扩张 ${combination.expansive} / 收紧 ${combination.restrictive}`}
        </text>
      </svg>

      <ul className="rg-legend">
        {(Object.keys(RELATION_META) as (keyof typeof RELATION_META)[]).map((kind) => {
          const meta = RELATION_META[kind];
          return (
            <li key={kind}>
              <span className="rg-legend-line" style={{ background: meta.color }} />
              <strong>{meta.label}</strong>
              <small>{meta.desc}</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
