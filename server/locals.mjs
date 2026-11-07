// 地方政策源：用于"中央发文 → 地方是否跟进、差几天"的传导测度。
//
// 现实约束先写在前面：31 个省级政府门户里，只有一部分能直接抓到"政策文件"列表
// （其余是 403、JS 渲染、或栏目结构每省一套）。所以这里维护的是一份**实测跑得通**的
// 白名单，抓不到的省份不会假装有数据——页面必须把覆盖率讲清楚。
import { fetchHtml, extractArticle, mapLimit } from './net.mjs';

/**
 * 每项包含：
 *  - list：列表首页
 *  - page：翻页模板，%d 为页码；null 表示该页已含全部或无法翻页
 *  - maxPages：最多翻几页，防止无底洞
 *  - kind：栏目性质，用于页面标注（省政府文件 / 政府文件及解读 / 信息公开目录）
 */
export const LOCAL_SOURCES = [
  {
    id: 'beijing',
    name: '北京市',
    short: '北京',
    level: '省级（直辖市）',
    list: 'https://www.beijing.gov.cn/zhengce/zhengcefagui/',
    page: null,
    maxPages: 1,
    kind: '市政府及部门文件',
  },
  {
    id: 'shanghai',
    name: '上海市',
    short: '上海',
    level: '省级（直辖市）',
    list: 'https://www.shanghai.gov.cn/nw12344/index.html',
    page: 'https://www.shanghai.gov.cn/nw12344/index_%d.html',
    maxPages: 10,
    kind: '市委市政府文件',
  },
  {
    id: 'guangdong',
    name: '广东省',
    short: '广东',
    level: '省级',
    list: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/index.html',
    page: 'https://www.gd.gov.cn/zwgk/wjk/qbwj/index_%d.html',
    maxPages: 10,
    kind: '省政府文件库',
  },
  {
    id: 'jiangsu',
    name: '江苏省',
    short: '江苏',
    level: '省级',
    list: 'https://www.jiangsu.gov.cn/col/col76558/',
    page: 'https://www.jiangsu.gov.cn/col/col76558/index_%d.html',
    maxPages: 8,
    kind: '政府文件及解读',
  },
  {
    id: 'shaanxi',
    name: '陕西省',
    short: '陕西',
    level: '省级',
    list: 'https://www.shaanxi.gov.cn/zfxxgk/',
    page: null,
    maxPages: 1,
    kind: '政府信息公开目录',
  },
];

// 列表页结构各省不同，但"一条 = 一个带日期的链接"这个共同点够用：
// 只认 160 字符内紧跟日期的 <a>，避免把导航、页脚里的链接当成文件。
const ITEM_RE =
  /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]{6,120}?)\s*<\/a>[\s\S]{0,160}?(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g;

// 人事任免、表彰、批复、常务会议报道不是政策工具，混进来会把"地方跟进"算早。
const NOISE = /(任免|任职|免职|职务任免|工作分工|表彰|表扬|烈士|聘任|追认|奖的决定|任免职|常务会议|主持召开)/;

export function parseList(html, baseUrl) {
  const out = [];
  for (const match of html.matchAll(ITEM_RE)) {
    const title = match[2].replace(/\s+/g, '');
    const date = `${match[3]}-${String(match[4]).padStart(2, '0')}-${String(match[5]).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (title.length < 6) continue;
    // 解读类不是政策本体，单独排除，否则会把"一图读懂"当成地方响应
    if (/^(一图读懂|政策解读|解读[:：]|图解)/.test(title) || /政策解读$/.test(title)) continue;
    let url;
    try {
      url = new URL(match[1], baseUrl).toString();
    } catch {
      continue;
    }
    out.push({ title, date, url });
  }
  return out;
}

const isValidDoc = (title) => title.length >= 8 && !NOISE.test(title);

async function fetchProvince(source, { since, onLog }) {
  const items = new Map();
  const seenPages = new Set();
  const errors = [];

  for (let page = 1; page <= source.maxPages; page += 1) {
    const url = page === 1 || !source.page ? source.list : source.page.replace('%d', String(page));
    if (seenPages.has(url)) break;
    seenPages.add(url);
    try {
      const html = await fetchHtml(url, { timeout: 18000 });
      const parsed = parseList(html, url);
      if (parsed.length === 0) {
        if (page === 1) errors.push('列表页未解析出条目（可能改版或需要 JS 渲染）');
        break;
      }
      let added = 0;
      let oldest = '9999-12-31';
      for (const item of parsed) {
        if (item.date < since) continue;
        if (!isValidDoc(item.title)) continue;
        if (items.has(item.url)) continue;
        items.set(item.url, item);
        added += 1;
        if (item.date < oldest) oldest = item.date;
      }
      onLog?.(`${source.short} 第 ${page} 页：解析 ${parsed.length} 条，窗口内新增 ${added} 条`);
      // 翻页到此为止：本页全部早于时间窗，后面的页只会更早
      if (oldest < since && page > 1) break;
      if (added === 0 && page > 1) break;
    } catch (error) {
      errors.push(`第 ${page} 页：${error.message}`);
      break;
    }
  }

  return {
    ...source,
    items: [...items.values()].sort((a, b) => b.date.localeCompare(a.date)),
    errors,
  };
}

export async function collectLocals({ since = '2026-05-01', provinces, onLog } = {}) {
  const targets = provinces?.length
    ? LOCAL_SOURCES.filter((source) => provinces.includes(source.id))
    : LOCAL_SOURCES;
  const results = [];
  for (const source of targets) {
    results.push(await fetchProvince(source, { since, onLog }));
  }

  // 正文只留前 3000 字：用途仅限"这份文件到底在讲什么"的二次判断，
  // 不做全文索引，也不必为几万字的地方文件撑爆 JSON。
  let bodyDone = 0;
  await mapLimit(results.filter((item) => item.items.length > 0), 3, async (province) => {
    const targets = province.items.slice(0, 420);
    await mapLimit(targets, 5, async (item) => {
      try {
        const html = await fetchHtml(item.url, { timeout: 15000 });
        item.text = extractArticle(html).slice(0, 3000);
      } catch {
        item.text = '';
      }
      bodyDone += 1;
    });
    onLog?.(`${province.short} 正文抓取完成：${targets.length} 篇`);
  });
  onLog?.(`正文合计 ${bodyDone} 篇`);
  return {
    at: new Date().toISOString(),
    since,
    coverage: {
      crawled: results.filter((item) => item.items.length > 0).length,
      attempted: results.length,
      totalProvinces: 31,
    },
    provinces: results.map(({ id, name, short, level, kind, list, items, errors }) => ({
      id,
      name,
      short,
      level,
      kind,
      list,
      count: items.length,
      earliest: items.at(-1)?.date ?? null,
      latest: items[0]?.date ?? null,
      errors,
      items,
    })),
  };
}
