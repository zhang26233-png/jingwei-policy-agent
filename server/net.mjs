// 网络抓取与正文提取：只依赖 Node 原生能力，避免额外依赖。
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export async function fetchHtml(url, { timeout = 15000 } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.subarray(0, 2048).toString('latin1');
  const match = /charset=["']?([\w-]+)/i.exec(head);
  const label = (match?.[1] || 'utf-8').toLowerCase();
  const normalized = label === 'gb2312' || label === 'gb2312-' ? 'gbk' : label;
  let html;
  try {
    html = new TextDecoder(normalized).decode(buf);
  } catch {
    html = new TextDecoder('utf-8').decode(buf);
  }
  return html;
}

// 部分官方栏目把列表渲染交给 JSON 接口（如政府网 ZUIXINZHENGCE.json），优先走结构化接口，比解析 HTML 稳定。
export async function fetchJson(url, { timeout = 15000 } = {}) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json,text/plain,*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return JSON.parse(text);
}

// 并发池：部委站点对突发并发敏感，默认压到 5 路，并允许单任务失败而不拖垮整批。
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

const ENTITIES = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&ldquo;': '“',
  '&rdquo;': '”',
  '&mdash;': '—',
  '&hellip;': '…',
};

export function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity);
}

export function stripTags(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h\d|tr)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 正文容器优先级：部委站点结构差异大，按常见 class/id 依次命中。
const ARTICLE_PATTERNS = [
  /<div[^>]+class="[^"]*TRS_Editor[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?:<\/div>|<\/td>)/i,
  /<div[^>]+id="zoom"[^>]*>([\s\S]*?)<\/div>/i,
  /<div[^>]+class="[^"]*(?:article|content|detail|zoom|txt)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
];

export function extractArticle(html) {
  let body = '';
  for (const pattern of ARTICLE_PATTERNS) {
    const match = pattern.exec(html);
    if (match && stripTags(match[1]).length > 200) {
      body = match[1];
      break;
    }
  }
  if (!body) {
    const main = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
    body = main ? main[1] : html;
  }
  const text = stripTags(body);
  return text.length > 8000 ? text.slice(0, 8000) : text;
}

export function parseDate(text) {
  const match = /(20\d{2})[-年/.／](\d{1,2})[-月/.／](\d{1,2})/.exec(text);
  if (!match) return null;
  const [, y, m, d] = match;
  if (Number(y) < 2000 || Number(y) > 2035) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function absUrl(href, base) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}
