// 探测候选官方信源：只做可达性 + 列表结构识别率，不改动任何数据。
import { fetchHtml } from './net.mjs';

const CANDIDATES = [
  { id: 'ndrc', name: '国家发展改革委', entry: 'https://www.ndrc.gov.cn/xxgk/zcfb/tz/' },
  { id: 'ndrc2', name: '发改委·政策发布', entry: 'https://www.ndrc.gov.cn/xxgk/zcfb/' },
  { id: 'miit', name: '工业和信息化部', entry: 'https://www.miit.gov.cn/zwgk/zcwj/index.html' },
  { id: 'miit2', name: '工信部·政策文件', entry: 'https://www.miit.gov.cn/zwgk/zcwj/wjfb/index.html' },
  { id: 'mofcom', name: '商务部', entry: 'http://www.mofcom.gov.cn/zfxxgk/article/gkml/zwgk.shtml' },
  { id: 'mofcom2', name: '商务部·政策发布', entry: 'http://www.mofcom.gov.cn/article/zcfb/' },
  { id: 'stats', name: '国家统计局', entry: 'https://www.stats.gov.cn/sj/zxfb/' },
  { id: 'gov-latest', name: '中国政府网·最新政策', entry: 'https://www.gov.cn/zhengce/zuixin/' },
  { id: 'gov-gwy', name: '国务院政策文件库', entry: 'https://www.gov.cn/zhengce/xxgk/gjgzk/index.htm' },
  { id: 'gov-bm', name: '部门文件库', entry: 'https://www.gov.cn/zhengce/xxgk/bmwj/index.htm' },
  { id: 'nfra', name: '金融监管总局', entry: 'https://www.nfra.gov.cn/cn/view/pages/ItemList.html?itemPId=923&itemId=931' },
  { id: 'csrc', name: '证监会', entry: 'http://www.csrc.gov.cn/csrc/c101803/common_list.shtml' },
  { id: 'mohurd', name: '住房城乡建设部', entry: 'https://www.mohurd.gov.cn/gongkai/zhengce/zhengcefilelib/index.html' },
  { id: 'mohrss', name: '人力资源社会保障部', entry: 'https://www.mohrss.gov.cn/xxgk2020/fdzdgknr/zcfg/gfxwj/' },
  { id: 'nhsa', name: '国家医保局', entry: 'https://www.nhsa.gov.cn/col/col37/index.html' },
  { id: 'pbc-mmp', name: '人民银行·货币政策', entry: 'http://www.pbc.gov.cn/zhengcehuobisi/125207/125213/index.html' },
  { id: 'pbc-gk', name: '人民银行·公开市场', entry: 'http://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/index.html' },
  { id: 'mof-tax', name: '财政部·税政司', entry: 'https://szs.mof.gov.cn/zhengcefabu/' },
  { id: 'sasac', name: '国资委', entry: 'http://www.sasac.gov.cn/n2588035/n2588320/index.html' },
  { id: 'nea', name: '国家能源局', entry: 'https://www.nea.gov.cn/policy/zcwj.htm' },
];

const headers = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36',
};

for (const candidate of CANDIDATES) {
  const started = Date.now();
  try {
    const html = await fetchHtml(candidate.entry, { timeout: 15000, headers });
    const anchors = [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)];
    const dated = anchors.filter((m) => /20\d{2}/.test(m[1]));
    const samples = anchors
      .filter((m) => m[2].replace(/<[^>]+>/g, '').trim().length >= 10 && /20\d{2}/.test(m[1]))
      .slice(0, 3)
      .map((m) => m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 34));
    console.log(
      `${candidate.id.padEnd(12)} ${String(html.length).padStart(7)}B  anchors=${String(anchors.length).padStart(4)}  dated=${String(dated.length).padStart(4)}  ${Date.now() - started}ms`,
    );
    if (samples.length === 0) console.log('             x 无可识别条目');
    else samples.forEach((s) => console.log(`             - ${s}`));
  } catch (error) {
    console.log(`${candidate.id.padEnd(12)} FAIL ${String(error.message).slice(0, 70)}`);
  }
}
