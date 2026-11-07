// 临时探测脚本：为各省找"能解析出最多政策条目"的栏目地址。
// 只用于确定白名单，不参与运行时。
import { fetchHtml, mapLimit } from '../server/net.mjs';
import fs from 'node:fs';

const HOMES = [
  ['henan', '河南省', 'https://www.henan.gov.cn/'],
  ['hubei', '湖北省', 'https://www.hubei.gov.cn/'],
  ['hunan', '湖南省', 'https://www.hunan.gov.cn/'],
  ['anhui', '安徽省', 'https://www.ah.gov.cn/'],
  ['fujian', '福建省', 'https://www.fj.gov.cn/'],
  ['jiangxi', '江西省', 'https://www.jiangxi.gov.cn/'],
  ['tianjin', '天津市', 'https://www.tj.gov.cn/'],
  ['chongqing', '重庆市', 'https://www.cq.gov.cn/'],
  ['sichuan', '四川省', 'https://www.sc.gov.cn/'],
  ['liaoning', '辽宁省', 'https://www.ln.gov.cn/'],
  ['hebei', '河北省', 'https://www.hebei.gov.cn/'],
  ['shanxi', '山西省', 'https://www.shanxi.gov.cn/'],
  ['neimenggu', '内蒙古', 'https://www.nmg.gov.cn/'],
  ['guangxi', '广西', 'http://www.gxzf.gov.cn/'],
  ['yunnan', '云南省', 'https://www.yn.gov.cn/'],
  ['guizhou', '贵州省', 'https://www.guizhou.gov.cn/'],
  ['gansu', '甘肃省', 'https://www.gansu.gov.cn/'],
  ['xinjiang', '新疆', 'https://www.xinjiang.gov.cn/'],
  ['jilin', '吉林省', 'http://www.jl.gov.cn/'],
  ['heilongjiang', '黑龙江省', 'https://www.hlj.gov.cn/'],
  ['hainan', '海南省', 'https://www.hainan.gov.cn/'],
  ['ningxia', '宁夏', 'https://www.nx.gov.cn/'],
  ['qinghai', '青海省', 'https://www.qinghai.gov.cn/'],
  ['xizang', '西藏', 'https://www.xizang.gov.cn/'],
];

const ITEM_RE =
  /<a[^>]+href="([^"]+)"[^>]*>\s*([^<]{6,120}?)\s*<\/a>[\s\S]{0,160}?(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/g;

const countItems = (html) => {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 政府门户对短时间并发很敏感（UND_ERR_CONNECT_TIMEOUT），失败一次就退避重试一次。
async function get(url, timeout = 12000) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetchHtml(url, { timeout });
    } catch (e) {
      if (attempt === 1) throw e;
      await sleep(900);
    }
  }
  return null;
}

async function probeProvince([id, name, home]) {
  let html;
  try {
    html = await get(home);
  } catch (e) {
    return { id, name, home, status: 'home-fail', error: e.message, best: null, cands: [] };
  }

  const anchors = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]{0,40}?)<\/a>/g)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    let url;
    try {
      url = new URL(m[1], home).toString();
    } catch {
      continue;
    }
    const textHit = /(政策文件|省政府文件|政府文件|规范性文件|文件库|政府规章|政策库|信息公开|公报|文件)/.test(text);
    const pathHit = /zcwj|zfwj|szfwj|wjk|zcwjk|zhengce|xxgk|gongbao|zcfg|zcjd/.test(url);
    if (!textHit && !pathHit) continue;
    if (/\.(jpg|png|pdf|doc|xls)/i.test(url)) continue;
    anchors.push({ url, text });
  }
  const uniq = [...new Map(anchors.map((a) => [a.url, a])).values()].slice(0, 4);

  const cands = [];
  for (const cand of uniq) {
    try {
      await sleep(400);
      const page = await get(cand.url, 10000);
      const items = countItems(page);
      if (items.length >= 8) {
        const dates = items.map((i) => i.date).sort();
        cands.push({
          url: cand.url,
          text: cand.text,
          n: items.length,
          earliest: dates[0],
          latest: dates.at(-1),
          sample: items.slice(0, 2).map((i) => `${i.date} ${i.title.slice(0, 24)}`),
        });
      }
    } catch {
      /* 单个候选失败不影响整体 */
    }
  }
  cands.sort((a, b) => b.n - a.n);
  return { id, name, home, status: 'ok', cands, best: cands[0] ?? null };
}

const out = [];
await mapLimit(HOMES, 2, async (item) => {
  const r = await probeProvince(item);
  out.push(r);
  const label = r.best ? `${String(r.best.n).padStart(3)} 条 ${r.best.earliest}~${r.best.latest}` : '无可用栏目';
  console.log(`${r.name.padEnd(5)} ${label}  ${r.best?.url ?? r.error ?? ''}`);
});

fs.writeFileSync('./probe-provinces.json', JSON.stringify(out, null, 1));
console.log('\n写出 probe-provinces.json');
const ok = out.filter((r) => r.best && r.best.n >= 30);
console.log(`可用（≥30 条）: ${ok.length} ->`, ok.map((r) => r.name).join('、'));
