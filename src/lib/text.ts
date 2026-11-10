// 语料文本清理：只处理采集环节带进来的排版残留，不改变原文语义。
//
// 处理两类问题：
//  1. HTML 实体未解码（&emsp; &nbsp; 等），在页面上会显示成字面字符串；
//  2. 门户站点的导航文字被一并抓进正文（"移动客户端""返回主站""当前位置："等），
//     表现为标题在正文开头重复出现。处理方式是定位标题最后一次出现的位置，从其后取正文。

const NAMED: Record<string, string> = {
  emsp: ' ',
  ensp: ' ',
  nbsp: ' ',
  thinsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  middot: '·',
  times: '×',
  divide: '÷',
};

export function decodeEntities(input: string): string {
  if (!input || input.indexOf('&') === -1) return input;
  return input.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

const NAV_WORDS = ['移动客户端', '客户端下载', '视频号', '抖音', '返回主站', '当前位置', '微信', '字号', '打印本页'];

/** 判断是否带上了门户导航文字 */
export function hasSiteChrome(input: string): boolean {
  const head = input.slice(0, 240);
  return NAV_WORDS.filter((word) => head.includes(word)).length >= 2;
}

/** 统一做实体解码与空白规整，不改写文字 */
export function tidyBodyText(input: string): string {
  if (!input) return '';
  return decodeEntities(input)
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/^[，、；：。\s]+/, '')
    .trim();
}

/**
 * 摘要清理：站点导航混入正文时，从标题最后一次出现处截取正文；
 * 清理后过短则退回标题，避免出现半句话。
 */
export function tidySummary(summary: string | undefined, title: string): string {
  const raw = decodeEntities(summary ?? '');
  if (hasSiteChrome(raw) && title.length >= 6) {
    const at = raw.lastIndexOf(title);
    if (at >= 0) {
      const rest = tidyBodyText(raw.slice(at + title.length));
      if (rest.length >= 20) return rest;
    }
    const firstStop = raw.search(/[。！]/);
    const cut = tidyBodyText(firstStop > 0 ? raw.slice(firstStop + 1) : '');
    return cut.length >= 20 ? cut : decodeEntities(title);
  }
  const text = tidyBodyText(raw);
  return text.length >= 20 ? text : decodeEntities(title);
}
