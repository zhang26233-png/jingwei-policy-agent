// 把图表画到 canvas，再下载成 PNG。
//
// 为什么不用「SVG → 序列化 → drawImage」这条更省事的路：
// SVG 里的中文要依赖字体声明，序列化后外部 CSS 全部丢失，中文字重和字距经常整体错位；
// canvas 直接指定系统字体族，导出结果和屏幕上看到的一致。
//
// 为什么导出图用白底：这张图的去处是 Word / PPT 浅色模板 / 打印稿，
// 网页上的深色底是为了长时间盯屏幕，两件事不该混。

const FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", sans-serif';

// 与响应矩阵的 fast / mid / slow 三档保持一致，颜色本身就是结论：
// 一眼能看出「大部分落在 30 天内，只有一两根长条拖出去」。
const TONE = [
  { limit: 30, fill: '#12967f' },
  { limit: 60, fill: '#cf9a1f' },
  { limit: Infinity, fill: '#d2603c' },
];

const toneOf = (lag: number) => (TONE.find((tone) => lag <= tone.limit) ?? TONE[2]).fill;

export interface RankDatum {
  label: string;
  sub: string;
  value: number;
}

export interface RankChartSpec {
  title: string;
  subtitle: string;
  items: RankDatum[];
  median: number | null;
  footnote: string[];
}

const W = 1240;
const PAD = 52;
const LABEL_W = 250;
const VALUE_W = 92;
const ROW_H = 42;
const HEAD_H = 148;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function drawRankChart(spec: RankChartSpec): HTMLCanvasElement {
  const rows = spec.items.length;
  const footLines: string[][] = [];
  const measure = document.createElement('canvas').getContext('2d');

  // 先把脚注按字号量一遍，才知道画布该多高。
  if (measure) {
    measure.font = `13px ${FONT}`;
    for (const note of spec.footnote) footLines.push(wrap(measure, note, W - PAD * 2));
  }
  const footH = footLines.reduce((sum, lines) => sum + lines.length * 21, 0) + 18;
  const H = HEAD_H + rows * ROW_H + 42 + footH;

  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#14211e';
  ctx.font = `600 27px ${FONT}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(spec.title, PAD, 58);

  ctx.fillStyle = '#5d726c';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(spec.subtitle, PAD, 88);

  // 三档图例放在标题行右端，不占刻度区。
  // 早先把它排在参数行下方，正好压住刻度「0」——图例宽 380px、刻度起点在 302px，必然打架。
  const legend = [
    { text: '30 天内', fill: TONE[0].fill },
    { text: '31—60 天', fill: TONE[1].fill },
    { text: '60 天以上', fill: TONE[2].fill },
  ];
  ctx.font = `13px ${FONT}`;
  const legendGap = 24;
  const itemWidths = legend.map((item) => ctx.measureText(item.text).width + 16);
  const legendTotal = itemWidths.reduce((sum, width) => sum + width, 0) + legendGap * (legend.length - 1);
  let legendX = W - PAD - legendTotal;
  ctx.textBaseline = 'middle';
  legend.forEach((item, index) => {
    ctx.fillStyle = item.fill;
    ctx.beginPath();
    ctx.roundRect(legendX, 47, 10, 10, 2);
    ctx.fill();
    ctx.fillStyle = '#5d726c';
    ctx.fillText(item.text, legendX + 16, 53);
    legendX += itemWidths[index] + legendGap;
  });
  ctx.textBaseline = 'alphabetic';

  const trackX = PAD + LABEL_W;
  const trackW = W - PAD * 2 - LABEL_W - VALUE_W;
  // 上限取整到 30 的倍数，和网页里的刻度（rankScale）用同一把尺子。
  // 早先用 max×1.08，导出的图与屏幕上的比例对不上，同一根条会读出两个天数。
  const peak = Math.max(...spec.items.map((item) => item.value), 1);
  const maxValue = Math.max(30, Math.ceil(peak / 30) * 30);

  const top = HEAD_H - 12;
  const bottom = top + rows * ROW_H;

  // 竖向参考线：每 30 天一格，让读者直接读出天数，而不是靠条形长度猜。
  ctx.strokeStyle = '#eef3f1';
  ctx.lineWidth = 1;
  ctx.textAlign = 'center';
  for (let day = 0; day <= maxValue; day += 30) {
    const x = trackX + (day / maxValue) * trackW;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.fillStyle = '#9aada8';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(`${day}`, x, top - 8);
  }
  ctx.textAlign = 'left';

  // 中位线画在条形之下：条形不透明会自然遮住它，只剩空白处露出，
  // 既保持连续感，又不会横穿右侧的天数标签（先画线、后画字）。
  if (spec.median !== null) {
    const mx = trackX + (spec.median / maxValue) * trackW;
    ctx.save();
    ctx.strokeStyle = '#8a9d98';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(mx, top - 2);
    ctx.lineTo(mx, bottom);
    ctx.stroke();
    ctx.restore();
  }

  spec.items.forEach((item, index) => {
    const y = top + index * ROW_H;
    const barH = 22;
    const barY = y + (ROW_H - barH) / 2;

    ctx.fillStyle = '#14211e';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(item.label, PAD, barY + 11);

    ctx.fillStyle = '#7f948e';
    ctx.font = `11px ${FONT}`;
    ctx.fillText(item.sub, PAD, barY + 26);

    const barW = Math.max(3, (item.value / maxValue) * trackW);
    ctx.fillStyle = toneOf(item.value);
    ctx.beginPath();
    ctx.roundRect(trackX, barY, barW, barH, 3);
    ctx.fill();

    ctx.fillStyle = '#14211e';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`+${item.value} 天`, trackX + barW + 12, barY + 15);
  });

  // 中位数的数值标签单独放到底部，标出"这一条线代表几天"。
  if (spec.median !== null) {
    const mx = trackX + (spec.median / maxValue) * trackW;
    const tag = `中位 ${spec.median} 天`;
    ctx.font = `600 12px ${FONT}`;
    const tagW = ctx.measureText(tag).width + 16;
    ctx.fillStyle = '#14211e';
    ctx.beginPath();
    ctx.roundRect(mx - tagW / 2, bottom + 6, tagW, 22, 11);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(tag, mx - tagW / 2 + 8, bottom + 21);
  }

  let fy = bottom + 52;
  ctx.fillStyle = '#6b7f7a';
  ctx.font = `13px ${FONT}`;
  for (const lines of footLines) {
    for (const line of lines) {
      ctx.fillText(line, PAD, fy);
      fy += 21;
    }
  }

  return canvas;
}

export function downloadPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    // 立刻 revoke 会让部分浏览器的下载中断，延迟释放。
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }, 'image/png');
}

/** 复制文本。navigator.clipboard 在非 https 的局域网地址下不可用，留一个 execCommand 兜底。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 继续走兜底
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
