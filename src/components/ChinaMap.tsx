import { useEffect, useMemo, useState } from 'react';
import type { ProvinceScore } from '../types';

interface GeoFeature {
  type: 'Feature';
  properties: { name: string; adcode: string; line?: string };
  geometry: { type: string; coordinates: unknown };
}

interface Shape {
  name: string;
  adcode: string;
  d: string;
}

// 中国标准 Albers 等积圆锥投影，避免直接用经纬度造成东西向拉伸失真。
const DEG = Math.PI / 180;
const LON0 = 105 * DEG;
const LAT0 = 35 * DEG;
const LAT1 = 25 * DEG;
const LAT2 = 47 * DEG;
const N = (Math.sin(LAT1) + Math.sin(LAT2)) / 2;
const C = Math.cos(LAT1) ** 2 + 2 * N * Math.sin(LAT1);
const RHO0 = Math.sqrt(C - 2 * N * Math.sin(LAT0)) / N;

function project(lon: number, lat: number) {
  const theta = N * (lon * DEG - LON0);
  const rho = Math.sqrt(C - 2 * N * Math.sin(lat * DEG)) / N;
  return [rho * Math.sin(theta), RHO0 - rho * Math.cos(theta)] as [number, number];
}

// 深色底上的暴露度色阶：低→高 走 深墨青 → 信号青，避免低暴露省份被刷成白色块
const SCALE_COLORS = ['#132a2d', '#1a3d3c', '#1d5a4e', '#218066', '#2ab68e', '#57f0c4'];
const H = 560;
const PAD = 10;
const GAP = 14;
const INSET = { width: 104, height: 150 };

function colorFor(value: number) {
  const index = Math.min(SCALE_COLORS.length - 1, Math.floor((value / 100) * SCALE_COLORS.length));
  return SCALE_COLORS[Math.max(0, index)];
}

type Point = number[];

function walk(coords: unknown, fn: (lon: number, lat: number) => void) {
  if (Array.isArray(coords) && typeof coords[0] === 'number') {
    fn(coords[0] as number, coords[1] as number);
    return;
  }
  if (Array.isArray(coords)) for (const child of coords) walk(child, fn);
}

// 把常用 GeoJSON 几何（Polygon / MultiPolygon / LineString / MultiLineString）转成 path。
function geometryPath(geometry: GeoFeature['geometry'], toXY: (lon: number, lat: number) => [number, number]) {
  const parts: string[] = [];
  const drawRing = (ring: Point[], close: boolean) => {
    if (ring.length < 2) return;
    ring.forEach((point, index) => {
      const [x, y] = toXY(point[0], point[1]);
      parts.push(`${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    });
    if (close) parts.push('Z');
  };

  if (geometry.type === 'Polygon') {
    for (const ring of geometry.coordinates as Point[][]) drawRing(ring, true);
  } else if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates as Point[][][]) {
      for (const ring of polygon) drawRing(ring, true);
    }
  } else if (geometry.type === 'LineString') {
    drawRing(geometry.coordinates as Point[], false);
  } else if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates as Point[][]) drawRing(line, false);
  }
  return parts.join(' ');
}

export function ChinaMap({
  provinces,
  selected,
  onSelect,
}: {
  provinces: ProvinceScore[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const [features, setFeatures] = useState<GeoFeature[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/data/china-provinces.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (alive) setFeatures(data.features ?? []);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      });
    return () => {
      alive = false;
    };
  }, []);

  const { shapes, inset, width } = useMemo(() => {
    if (features.length === 0) return { shapes: [] as Shape[], inset: null, width: 620 };

    const mainland = features.filter((feature) => feature.properties.line !== 'nine-dash');
    const islands = features.filter((feature) => feature.properties.line === 'nine-dash');

    // 主体只按省级行政区计算包围盒：南海诸岛另行做插图，避免为了容纳九段线把大陆压得很小。
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const feature of mainland) {
      walk(feature.geometry.coordinates, (lon, lat) => {
        const [x, y] = project(lon, lat);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      });
    }

    // 以高度为准铺满，宽度按实际大陆比例动态计算，画布不做无意义的留白。
    const scale = (H - PAD * 2) / (maxY - minY);
    const mainlandW = (maxX - minX) * scale;
    const width = Math.round(PAD * 2 + mainlandW + GAP + INSET.width);
    const toXY = (lon: number, lat: number): [number, number] => {
      const [x, y] = project(lon, lat);
      return [PAD + (x - minX) * scale, PAD + (maxY - y) * scale];
    };

    const shapes: Shape[] = mainland.map((feature) => ({
      name: feature.properties.name,
      adcode: feature.properties.adcode,
      d: geometryPath(feature.geometry, toXY),
    }));

    // 南海诸岛插图：单独缩放并固定在大陆右侧的空白海域，保持岛礁要素完整。
    let inset: { d: string; x: number; y: number } | null = null;
    if (islands.length > 0) {
      let iMinX = Infinity;
      let iMaxX = -Infinity;
      let iMinY = Infinity;
      let iMaxY = -Infinity;
      for (const feature of islands) {
        walk(feature.geometry.coordinates, (lon, lat) => {
          const [x, y] = project(lon, lat);
          iMinX = Math.min(iMinX, x);
          iMaxX = Math.max(iMaxX, x);
          iMinY = Math.min(iMinY, y);
          iMaxY = Math.max(iMaxY, y);
        });
      }
      const boxX = PAD + mainlandW + GAP;
      const boxY = H - PAD - INSET.height;
      const innerW = INSET.width - 12;
      const innerH = INSET.height - 20;
      const iScale = Math.min(innerW / (iMaxX - iMinX), innerH / (iMaxY - iMinY));
      const iOffsetX = boxX + (INSET.width - (iMaxX - iMinX) * iScale) / 2;
      const iOffsetY = boxY + (INSET.height - (iMaxY - iMinY) * iScale) / 2 - 4;
      const toInset = (lon: number, lat: number): [number, number] => {
        const [x, y] = project(lon, lat);
        return [(x - iMinX) * iScale + iOffsetX, (y - iMinY) * iScale + iOffsetY];
      };
      inset = {
        d: islands.map((feature) => geometryPath(feature.geometry, toInset)).join(' '),
        x: boxX,
        y: boxY,
      };
    }

    return { shapes, inset, width };
  }, [features]);

  const scoreByCode = useMemo(() => {
    const map = new Map<string, ProvinceScore>();
    for (const item of provinces) map.set(item.code, item);
    return map;
  }, [provinces]);

  if (error) {
    return (
      <div className="map-fallback">
        <strong>地图数据未加载</strong>
        <p>省级边界文件读取失败（{error}）。下方排名表仍可正常查看。</p>
      </div>
    );
  }

  const activeCode = hover ?? selected;

  return (
    <div className="china-map">
      <svg viewBox={`0 0 ${width} ${H}`} role="img" aria-label="省级政策影响分布示意图">
        {shapes.map((shape) => {
          const score = scoreByCode.get(shape.adcode);
          const isActive = activeCode === shape.adcode;
          const isSelected = selected === shape.adcode;
          const fill = score ? colorFor(score.exposure) : '#141f21';
          return (
            <path
              key={`${shape.adcode}-${shape.name}`}
              d={shape.d}
              fill={fill}
              stroke={isSelected ? '#2ee6b2' : isActive ? '#4a7d74' : '#08100f'}
              strokeWidth={isSelected ? 2 : isActive ? 1.6 : 0.8}
              className={score ? 'map-region is-scored' : 'map-region'}
              onMouseEnter={() => setHover(shape.adcode)}
              onMouseLeave={() => setHover(null)}
              onClick={() => score && onSelect(shape.adcode)}
            >
              <title>{score ? `${shape.name}：暴露度 ${score.exposure}` : `${shape.name}：不参与评估`}</title>
            </path>
          );
        })}

        {inset && (
          <g className="map-inset">
            <rect
              x={inset.x}
              y={inset.y}
              width={INSET.width}
              height={INSET.height}
              fill="#0b1416"
              stroke="#24393c"
              strokeWidth="0.8"
            />
            <path d={inset.d} fill="#101c1f" stroke="#2f4b4e" strokeWidth="1" strokeLinejoin="round" />
            <text x={inset.x + INSET.width / 2} y={inset.y + INSET.height - 5} textAnchor="middle" className="map-inset-label">
              南海诸岛
            </text>
          </g>
        )}
      </svg>
      <div className="map-legend">
        <span className="map-legend-title">受影响强度</span>
        <span className="map-legend-low">低</span>
        {SCALE_COLORS.map((color) => (
          <span key={color} className="map-legend-swatch" style={{ background: color }} />
        ))}
        <span className="map-legend-high">高</span>
        <span className="map-legend-na">灰：不参与评估</span>
      </div>
    </div>
  );
}
