import { useState } from 'react';
import { ArrowRight, CircleAlert, Info } from 'lucide-react';
import type { AnalysisResult, Policy } from '../types';

interface TransmissionGraphProps {
  result: AnalysisResult;
  policies: Policy[];
  onOpenPolicy: (id: string) => void;
}

const NODE_WIDTH = 170;
const NODE_HEIGHT = 64;
const GAP_Y = 18;
const START_Y = 56;
const COLUMN_X = [20, 270, 520, 770];
const COLUMN_TITLES = ['政策工具', '直接效果', '主体反应', '宏观目标'];

const PALETTE = [
  { fill: '#F3EFE2', stroke: '#C2AE78', title: '#5E4C1F', sub: '#7A6A3A' },
  { fill: '#E8F1F3', stroke: '#91B2BE', title: '#234B58', sub: '#436E7A' },
  { fill: '#EDF0E7', stroke: '#A7B58C', title: '#3F512C', sub: '#5E7049' },
  { fill: '#F3E9E4', stroke: '#C99E8C', title: '#6B3929', sub: '#835443' },
];

export function TransmissionGraph({ result, policies, onOpenPolicy }: TransmissionGraphProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counts = [0, 1, 2, 3].map(
    (column) => result.nodes.filter((node) => node.column === column).length,
  );
  const maxCount = Math.max(...counts, 1);
  const height = START_Y + maxCount * NODE_HEIGHT + (maxCount - 1) * GAP_Y + 56;
  const selected = result.nodes.find((node) => node.id === selectedId) ?? null;

  const positioned = result.nodes.map((node) => {
    const sameColumn = result.nodes.filter((item) => item.column === node.column);
    const index = sameColumn.findIndex((item) => item.id === node.id);
    return {
      ...node,
      x: COLUMN_X[node.column],
      y: START_Y + index * (NODE_HEIGHT + GAP_Y),
    };
  });

  const getNode = (id: string) => positioned.find((node) => node.id === id);

  return (
    <div className="graph-wrap">
      <div className="graph-scroll">
        <svg
          viewBox={`0 0 942 ${height}`}
          className="transmission-svg"
          role="img"
          aria-label="政策影响传导链示意图"
        >
          <title>政策影响传导链</title>
          <desc>从政策工具到直接效果、主体反应和宏观目标的条件性传导路径。</desc>
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path
                d="M2 1L8 5L2 9"
                fill="none"
                stroke="#7C837D"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </marker>
          </defs>

          {COLUMN_TITLES.map((title, index) => (
            <text
              key={title}
              x={COLUMN_X[index]}
              y="28"
              className="graph-column-title"
              fill="#7A7A70"
            >
              {String(index + 1).padStart(2, '0')} / {title}
            </text>
          ))}

          {result.edges.map((edge) => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            if (!from || !to) return null;
            const x1 = from.x + NODE_WIDTH;
            const y1 = from.y + NODE_HEIGHT / 2;
            const x2 = to.x;
            const y2 = to.y + NODE_HEIGHT / 2;
            const midX = (x1 + x2) / 2;
            const dashed = edge.label.includes('条件') || edge.label.includes('可能');
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <path
                  d={`M${x1} ${y1} C${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke="#7F8A83"
                  strokeWidth="1.4"
                  strokeDasharray={dashed ? '4 4' : undefined}
                  markerEnd="url(#graph-arrow)"
                />
                <text
                  x={midX}
                  y={(y1 + y2) / 2 - 9}
                  textAnchor="middle"
                  className="graph-edge-label"
                  fill="#777970"
                  paintOrder="stroke"
                  stroke="#FBFAF6"
                  strokeWidth="3"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}

          {positioned.map((node) => {
            const palette = PALETTE[node.column];
            return (
              <g
                key={node.id}
                className={`graph-node ${selectedId === node.id ? 'is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`查看${node.label}的机制说明`}
                onClick={() => setSelectedId(selectedId === node.id ? null : node.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedId(selectedId === node.id ? null : node.id);
                  }
                }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="9"
                  fill={palette.fill}
                  stroke={selectedId === node.id ? palette.title : palette.stroke}
                  strokeWidth={selectedId === node.id ? '1.4' : '0.6'}
                />
                <text x={node.x + 14} y={node.y + 25} fill={palette.title} className="graph-node-title">
                  {node.label}
                </text>
                <text x={node.x + 14} y={node.y + 45} fill={palette.sub} className="graph-node-sub">
                  {node.sub}
                </text>
                <circle cx={node.x + NODE_WIDTH - 14} cy={node.y + 15} r="2.2" fill={palette.stroke} />
              </g>
            );
          })}
        </svg>
      </div>

      <div className="graph-legend">
        <span>
          <i className="legend-line" />
          机制推断
        </span>
        <span>
          <i className="legend-line dashed" />
          条件性传导
        </span>
        <span className="graph-hint">
          <Info size={13} />
          点击节点查看证据与不确定性
        </span>
      </div>

      {selected ? (
        <div className="graph-detail">
          <div className="graph-detail-head">
            <div>
              <span className="section-kicker">传导节点解释</span>
              <h3>{selected.label}</h3>
            </div>
            <button className="text-button" onClick={() => setSelectedId(null)}>
              收起
            </button>
          </div>
          <p>{selected.note}</p>
          <div className="uncertainty-line">
            <CircleAlert size={15} />
            <span>{selected.uncertainty}</span>
          </div>
          <div className="graph-detail-refs">
            <span>证据</span>
            {selected.refs.map((ref) => {
              const policy = policies.find((item) => item.id === ref);
              if (!policy) return null;
              return (
                <button key={ref} onClick={() => onOpenPolicy(ref)}>
                  {policy.shortTitle}
                  <ArrowRight size={13} />
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
