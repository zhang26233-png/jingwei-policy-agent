import { useMemo, useState } from 'react';
import { indicatorSeries } from '../data/policies';

export function IndicatorChart() {
  const [seriesId, setSeriesId] = useState(indicatorSeries[0].id);
  const series = indicatorSeries.find((item) => item.id === seriesId) ?? indicatorSeries[0];

  const chart = useMemo(() => {
    const width = 720;
    const height = 292;
    const left = 64;
    const right = 44;
    const top = 42;
    const bottom = 54;
    const values = series.points.map((point) => point.value);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const minValue = Math.floor((rawMin - 0.12) / 0.2) * 0.2;
    const maxValue = Math.ceil((rawMax + 0.08) / 0.2) * 0.2;
    const tickStep = 0.2;
    const xStep = (width - left - right) / Math.max(series.points.length - 1, 1);
    const points = series.points.map((point, index) => ({
      ...point,
      x: left + index * xStep,
      y: top + ((maxValue - point.value) / (maxValue - minValue)) * (height - top - bottom),
    }));

    let stepPath = `M${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      stepPath += ` H${points[index].x} V${points[index].y}`;
    }
    const areaPath = `${stepPath} V${height - bottom} H${points[0].x} Z`;
    const tickCount = Math.round((maxValue - minValue) / tickStep);
    const ticks = Array.from({ length: tickCount + 1 }, (_, index) => {
      const value = Number((minValue + tickStep * index).toFixed(1));
      return {
        value,
        y: top + ((maxValue - value) / (maxValue - minValue)) * (height - top - bottom),
      };
    });

    return { width, height, left, right, top, bottom, points, stepPath, areaPath, ticks };
  }, [series]);

  return (
    <div className="indicator-panel">
      <div className="indicator-tabs" role="tablist" aria-label="指标切换">
        {indicatorSeries.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={series.id === item.id}
            className={series.id === item.id ? 'is-active' : ''}
            onClick={() => setSeriesId(item.id)}
          >
            {item.name}
          </button>
        ))}
      </div>

      <div className="chart-scroll">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="indicator-svg"
          role="img"
          aria-label={`${series.name}政策变量变化`}
        >
          <title>{series.name}</title>
          <desc>{series.note}</desc>
          {chart.ticks.map((tick) => (
            <g key={tick.value}>
              <line
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={tick.y}
                y2={tick.y}
                stroke="#E7E3D9"
                strokeWidth="0.7"
                strokeDasharray="3 4"
              />
              <text x={chart.left - 12} y={tick.y + 4} textAnchor="end" className="chart-axis" fill="#85857A">
                {tick.value.toFixed(1)}%
              </text>
            </g>
          ))}

          <path d={chart.areaPath} fill="#264F48" opacity="0.06" />
          <path
            d={chart.stepPath}
            fill="none"
            stroke="#264F48"
            strokeWidth="2.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {chart.points.map((point, index) => (
            <g key={`${point.date}-${point.value}`}>
              <line
                x1={point.x}
                x2={point.x}
                y1={chart.top}
                y2={chart.height - chart.bottom}
                stroke="#D9D5CA"
                strokeWidth="0.7"
              />
              <circle cx={point.x} cy={point.y} r="4.2" fill="#FBFAF6" stroke="#264F48" strokeWidth="2" />
              <text
                x={point.x}
                y={point.y - 15}
                textAnchor="middle"
                className="chart-value"
                fill="#264F48"
                paintOrder="stroke"
                stroke="#FBFAF6"
                strokeWidth="3"
              >
                {point.label}
              </text>
              <text
                x={point.x}
                y={chart.height - 30}
                textAnchor="middle"
                className="chart-axis"
                fill="#6E6E65"
              >
                {point.date}
              </text>
              {index > 0 && (
                <text
                  x={point.x}
                  y={chart.top - 12}
                  textAnchor="middle"
                  className="chart-event"
                  fill="#A6633D"
                  paintOrder="stroke"
                  stroke="#FBFAF6"
                  strokeWidth="3"
                >
                  政策调整
                </text>
              )}
            </g>
          ))}

          <text x={chart.width - chart.right} y={chart.height - 8} textAnchor="end" className="chart-axis" fill="#9A988E">
            单位：%
          </text>
        </svg>
      </div>

      <div className="chart-caption">
        <p>{series.note}</p>
        <span>来源：{series.source}</span>
      </div>
    </div>
  );
}
