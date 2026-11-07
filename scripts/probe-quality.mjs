// 第三轮：对候选栏目做质量体检——近 90 天有多少条、多少是政策工具类文件。
import { fetchHtml, mapLimit } from '../server/net.mjs';

const CANDS = [
  ['beijing', '北京', 'https://www.beijing.gov.cn/zhengce/zhengcefagui/'],
  ['shanghai', '上海', 'https://www.shanghai.gov.cn/nw12344/index.html'],
  ['guangdong', '广东', 'https://www.gd.gov.cn/zwgk/wjk/qbwj/index.html'],
  ['hebei', '河北', 'https://www.hebei.gov.cn/columns/49f13cc2-db03-4d0c-b4fe-2f3f659d3b6e/index.html'],
  ['heilongjiang', '黑龙江', 'https://www.hlj.gov.cn/hlj/c108369/zfxxgk.shtml'],
  ['liaoning', '辽宁', 'https://www.ln.gov.cn/web/zwgkx/zfwj/index.shtml'],
  ['shanxi', '山西', 'http://www.shanxi.gov.cn/zfxxgk/'],
  ['anhui', '安徽', 'https://www.ah.gov.cn/public/column/1681?type=4&catId=6711421&action=list'],
  ['guizhou', '贵州', 'https://www.guizhou.gov.cn/zwgk/'],
  ['neimenggu', '内蒙古', 'https://www.nmg.gov.cn/zwgk/'],
  ['sichuan', '四川', 'https://www.sc.gov.cn/10462/c111441/list_ft.shtml'],
];

const ITEM_RE =
  /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]{6,120}?)\s*<\/a>[\s\S]{0,160}?(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g;
const DOC_LIKE = /(通知|意见|方案|办法|措施|规划|细则|实施|规定|指引|清单|计划|决定|批复)/;
const NOISE = /(任免|任职|免职|表彰|表扬|烈士|聘任|追认|常务会议|主持召开)/;

const parse = (html) => {
  const out = [];
  for (const m of html.matchAll(ITEM_RE)) {
    const date = `${m[3]}-${String(m[4]).padStart(2, '0')}-${String(m[5]).padStart(2, '0')}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const title = m[2].replace(/\s+/g, '');
    if (title.length < 6) continue;
    out.push({ title, date });
  }
  return out;
};

await mapLimit(CANDS, 3, async ([id, name, url]) => {
  try {
    const html = await fetchHtml(url, { timeout: 12000 });
    const items = parse(html);
    const recent = items.filter((i) => i.date >= '2026-08-09');
    const docs = recent.filter((i) => DOC_LIKE.test(i.title) && !NOISE.test(i.title));
    const dates = items.map((i) => i.date).sort();
    console.log(
      `\n${name} 总${items.length} 近90天${recent.length} 其中文件类${docs.length} 范围${dates[0]}~${dates.at(-1)}`,
    );
    docs.slice(0, 4).forEach((d) => console.log('    ', d.date, d.title.slice(0, 34)));
  } catch (e) {
    console.log(`\n${name} 失败 ${e.message}`);
  }
});
