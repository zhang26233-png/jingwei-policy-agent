// 官方来源适配器：每个源独立可失败，失败只影响自身，不影响整体采集。
// 采集分两阶段：先并发取各源列表（廉价、可全量），再按配额并发抓正文（昂贵、需限流）。
import { fetchHtml, fetchJson, extractArticle, decodeEntities, absUrl, parseDate, mapLimit } from './net.mjs';
import { readAttachments } from './pdf.mjs';

const NOISE = /^(English Version|登录|注册|首页|返回|更多|下一页|上一页|网站地图|联系我们)$/;

function dateFromHref(href) {
  const full = /t(\d{4})(\d{2})(\d{2})/.exec(href);
  if (full && Number(full[1]) >= 2000) return `${full[1]}-${full[2]}-${full[3]}`;
  // 央行内容页使用 17 位时间戳目录：/2026101615242728034/index.html
  const stamp = /\/(20\d{2})(\d{2})(\d{2})\d{9,}\//.exec(href);
  if (stamp) return `${stamp[1]}-${stamp[2]}-${stamp[3]}`;
  // 政府网内容页：/content/202608/content_7078320.htm 或 /content/2020-12/21/content_xxx.htm
  const govMonth = /\/content\/(20\d{2})-?(\d{2})\//.exec(href);
  if (govMonth) return `${govMonth[1]}-${govMonth[2]}-01`;
  return null;
}

function parseList(html, base, { linkPattern, minTitle = 8 }) {
  const seen = new Set();
  const items = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(html))) {
    const attrs = match[1];
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href || !linkPattern.test(href)) continue;
    const titleAttr = /title\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    let title = decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (title.length < minTitle) title = titleAttr.replace(/\s+/g, ' ').trim();
    if (title.length < minTitle) continue;
    const url = absUrl(href, base);
    if (!url || seen.has(url)) continue;
    if (url.includes('#')) continue;
    if (NOISE.test(title) || title.length > 90) continue;
    seen.add(url);
    items.push({ title, url, date: dateFromHref(href) });
  }
  return items;
}

// 每个源可声明文种白名单（only）、黑名单（exclude）与是否必须有日期（requireDate）。
// 部委栏目页常年把"新闻/解读/处罚决定"和"政策文件"混排，仅靠链接模式无法区分。
export const SOURCES = [
  {
    id: 'gov-central',
    name: '中国政府网 · 中央政策文件',
    org: '中共中央 / 国务院 / 国办',
    entry: 'https://www.gov.cn/zhengce/zuixin/ZUIXINZHENGCE.json',
    level: '政策原文',
    note: '政府网「最新政策」结构化接口，收录中共中央、国务院、国务院办公厅印发的中央层面文件',
    mode: 'json',
    async list() {
      const data = await fetchJson(this.entry);
      if (!Array.isArray(data)) return [];
      return data
        .map((row) => ({
          title: String(row.TITLE || '').replace(/\s+/g, ' ').trim(),
          url: row.URL,
          date: String(row.DOCRELPUBTIME || '').slice(0, 10) || null,
        }))
        .filter((item) => item.title.length >= 8 && item.url);
    },
  },
  {
    id: 'mof-policy',
    name: '财政部 · 政策发布',
    org: '财政部',
    entry: 'https://www.mof.gov.cn/zhengwuxinxi/zhengcefabu/',
    level: '政策原文',
    note: '财政部政策发布栏目，含财税政策文件与配套通知',
    list(html, base) {
      return parseList(html, base, { linkPattern: /t\d{8}_\d+\.htm/ });
    },
  },
  {
    id: 'mof-tax',
    name: '财政部 · 税政司政策发布',
    org: '财政部税政司',
    entry: 'https://szs.mof.gov.cn/zhengcefabu/',
    level: '政策原文',
    note: '税政司单独发布的税收政策公告，是财税口径最细的一手来源',
    list(html, base) {
      return parseList(html, base, { linkPattern: /t\d{8}_\d+\.htm/, minTitle: 10 });
    },
  },
  {
    id: 'ndrc-notice',
    name: '国家发展改革委 · 通知公告',
    org: '国家发展改革委',
    entry: 'https://www.ndrc.gov.cn/xxgk/zcfb/tz/',
    level: '政策原文',
    note: '发改委面向产业、投资、价格领域的规范性通知',
    only: /(通知|公告|意见|办法|规定|批复|目录|清单|决定|规划|方案)$|(通知|公告|意见|办法|规定|批复|目录|清单|决定)/,
    exclude: /一图读懂|解读|答记者问|图解|视频|新闻发布会/,
    requireDate: true,
    list(html, base) {
      return parseList(html, base, { linkPattern: /\/\d{6}\/t\d{8}_\d+\.html/ });
    },
  },
  {
    id: 'pbc-law',
    name: '中国人民银行 · 条法司',
    org: '中国人民银行',
    entry: 'http://www.pbc.gov.cn/tiaofasi/144941/3581332/index.html',
    level: '政策原文',
    note: '央行规章与规范性文件',
    list(html, base) {
      return parseList(html, base, {
        linkPattern: /\/\d{5,}\/\d{6,}\/index\.html/,
        minTitle: 10,
      }).filter((item) =>
        /公告|通知|规定|办法|意见|决定|条例|规则|指引|细则|中国人民银行/.test(item.title),
      );
    },
  },
  {
    id: 'mof-news',
    name: '财政部 · 财政新闻',
    org: '财政部',
    entry: 'https://www.mof.gov.cn/zhengwuxinxi/caizhengxinwen/',
    level: '官方发布',
    note: '财政部新闻与发布会实录，用于补充政策背景，不作为政策文件参与排序',
    list(html, base) {
      return parseList(html, base, { linkPattern: /t\d{8}_\d+\.htm/ });
    },
  },
  {
    id: 'stats-release',
    name: '国家统计局 · 数据发布',
    org: '国家统计局',
    entry: 'https://www.stats.gov.cn/sj/zxfb/',
    level: '官方发布',
    note: '统计数据与形势解读，作为政策效果的观测背景，不参与政策排序',
    list(html, base) {
      return parseList(html, base, { linkPattern: /t\d{8}_\d+\.html/, minTitle: 12 });
    },
  },
];

const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

// 阶段一：并发取各源列表。任何单源失败只记录，不抛出。
export async function fetchLists({ sources = SOURCES, since = '2024-01-01' } = {}) {
  const results = await mapLimit(sources, 5, async (source) => {
    const started = Date.now();
    try {
      const html = source.mode === 'json' ? null : await fetchHtml(source.entry, { timeout: 15000 });
      const all = await source.list(html, source.entry);
      const raw = all.filter((item) => {
        if (source.requireDate && !item.date) return false;
        if (source.only && !source.only.test(item.title)) return false;
        if (source.exclude && source.exclude.test(item.title)) return false;
        return true;
      });
      const inWindow = raw.filter((item) => !item.date || item.date >= since);
      return {
        id: source.id,
        name: source.name,
        org: source.org,
        entry: source.entry,
        level: source.level,
        note: source.note,
        ok: true,
        listed: raw.length,
        inWindow: inWindow.length,
        elapsedMs: Date.now() - started,
        items: inWindow.map((item) => ({ ...item, sourceId: source.id })),
        error: null,
      };
    } catch (error) {
      return {
        id: source.id,
        name: source.name,
        org: source.org,
        entry: source.entry,
        level: source.level,
        note: source.note,
        ok: false,
        listed: 0,
        inWindow: 0,
        elapsedMs: Date.now() - started,
        items: [],
        error: error.message,
      };
    }
  });

  return results.map((result) =>
    result && result.ok !== undefined
      ? result
      : {
          id: 'unknown',
          name: '未知来源',
          org: '',
          entry: '',
          level: '政策原文',
          note: '',
          ok: false,
          listed: 0,
          inWindow: 0,
          elapsedMs: 0,
          items: [],
          error: '采集器内部错误',
        },
  );
}

// 阶段二：按配额并发抓正文。政策原文优先，但强制给背景材料留固定额度——
// 否则政策原文条数一旦超过配额，新闻与统计数据会被整体挤掉，影响页就没有观测背景。
export async function fetchArticles(items, { limit = 60, concurrency = 5 } = {}) {
  const isPrimary = (item) => SOURCE_BY_ID.get(item.sourceId)?.level === '政策原文';
  const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  const primary = items.filter(isPrimary).sort(byDate);
  const background = items.filter((item) => !isPrimary(item)).sort(byDate);
  const bgQuota = Math.min(background.length, Math.max(6, Math.round(limit * 0.2)));
  const queue = [...primary.slice(0, Math.max(0, limit - bgQuota)), ...background.slice(0, bgQuota)];

  // 网页正文短于这个长度，就去翻同页附件：多数印发通知的实际内容都在 PDF 里。
  const THIN_BODY = 900;

  const rows = await mapLimit(queue, concurrency, async (item) => {
    const source = SOURCE_BY_ID.get(item.sourceId);
    let text = '';
    let fetchError = null;
    let attachments = [];
    let attachmentText = '';
    try {
      const page = await fetchHtml(item.url, { timeout: 14000 });
      text = extractArticle(page);
      if (text.length < THIN_BODY) {
        try {
          const parsed = await readAttachments({ html: page, baseUrl: item.url, title: item.title });
          attachments = parsed.attachments;
          attachmentText = parsed.bodyText;
        } catch (caught) {
          fetchError = fetchError ?? `附件解析失败：${caught.message}`;
        }
      }
    } catch (caught) {
      fetchError = caught.message;
    }
    // 附件正文接在网页正文之后：网页仍是权威抬头（文号、印发语），附件补的是实体内容。
    const merged = attachmentText ? `${text}\n${attachmentText}`.slice(0, 16000) : text;
    return {
      ...item,
      date: item.date || parseDate(text) || '',
      text: merged,
      attachments,
      attachmentText,
      sourceName: source?.name || item.sourceId,
      sourceLevel: source?.level || '政策原文',
      org: source?.org || '',
      fetchError,
    };
  });

  return rows.filter((row) => row && row.title && row.text && row.text.length >= 120);
}

// 兼容旧的单源采集入口（probe / 单源调试用）。
export async function collectSource(source, { limit = 12, since = '2024-01-01' } = {}) {
  const started = Date.now();
  const html = source.mode === 'json' ? null : await fetchHtml(source.entry);
  const items = (await source.list(html, source.entry))
    .filter((item) => !item.date || item.date >= since)
    .slice(0, limit);
  const detailed = await fetchArticles(
    items.map((item) => ({ ...item, sourceId: source.id })),
    { limit, concurrency: 4 },
  );
  return {
    id: source.id,
    name: source.name,
    org: source.org,
    entry: source.entry,
    level: source.level,
    note: source.note,
    ok: true,
    count: detailed.length,
    withBody: detailed.filter((item) => item.text.length > 200).length,
    elapsedMs: Date.now() - started,
    items: detailed,
    error: null,
  };
}
