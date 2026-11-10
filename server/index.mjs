// 经纬纵横后端：政策采集 API + 静态资源托管（生产模式单端口即可演示）。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, fetchLists, fetchArticles } from './sources.mjs';
import { extractPolicy } from './extract.mjs';
import { readAttachments } from './pdf.mjs';
import { fetchHtml, extractArticle, mapLimit } from './net.mjs';
import { load, save, getPolicies, upsertPolicies, recordRun, summary } from './store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 托管前端产物：本地用 vite 的 dist；部署环境里 dist 属于构建产物不会随源码上传，
// 因此额外保留一份 webdist 作为随源码分发的静态目录。
const DIST =
  [path.join(ROOT, 'dist'), path.join(ROOT, 'webdist')].find((dir) =>
    fs.existsSync(path.join(dir, 'index.html')),
  ) || path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 8787);
// 部署环境必须监听 0.0.0.0 才能被反向代理访问；本地访问 0.0.0.0 同样可用。
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const json = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });

let collecting = false;

// 单次采集的实际节奏写进进度里，前端按阶段点亮流水线，而不是放一段假动画。
const progress = { phase: 'idle', startedAt: null, lists: 0, bodies: 0, total: 0, log: [] };
const logLine = (text) => {
  progress.log = [...progress.log, `${new Date().toISOString().slice(11, 19)} ${text}`].slice(-40);
};

async function runCollection(options = {}) {
  if (collecting) return { busy: true };
  collecting = true;
  const at = new Date().toISOString();
  const selected = options.sources?.length
    ? SOURCES.filter((source) => options.sources.includes(source.id))
    : SOURCES;
  const windowDays = Math.min(Math.max(Number(options.windowDays) || 120, 7), 730);
  const limit = Math.min(Math.max(Number(options.limit) || 60, 5), 160);
  const since = options.since || new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10);

  Object.assign(progress, { phase: 'lists', startedAt: at, lists: 0, bodies: 0, total: 0, log: [] });
  logLine(`开始采集：${selected.length} 个官方来源，时间窗 ${since} 起`);

  const lists = await fetchLists({ sources: selected, since });
  progress.lists = lists.filter((item) => item.ok).length;
  lists.forEach((item) => {
    logLine(
      item.ok
        ? `${item.name}：列表 ${item.listed} 条，窗口内 ${item.inWindow} 条（${item.elapsedMs}ms）`
        : `${item.name}：失败 ${item.error}`,
    );
  });

  // 跨源去重：同一份文件常同时出现在部委栏目和政府网，按 URL 归一化后只留先到的一条。
  const seen = new Set();
  const queue = [];
  for (const list of lists) {
    for (const item of list.items) {
      const key = String(item.url || '').replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      queue.push(item);
    }
  }
  logLine(`跨源合并去重后待抓正文 ${queue.length} 条，按政策原文优先取前 ${limit} 条`);

  progress.phase = 'bodies';
  const articles = await fetchArticles(queue, { limit, concurrency: 5 });
  progress.bodies = articles.length;
  logLine(`正文抓取完成：${articles.length} 条可用（去掉空正文与过短页面）`);

  const extracted = [];
  for (const item of articles) {
    const policy = extractPolicy({
      title: item.title,
      text: item.text,
      issuer: item.org,
      date: item.date,
      url: item.url,
      sourceName: item.sourceName,
      sourceLevel: item.sourceLevel,
      attachments: item.attachments ?? [],
      attachmentText: item.attachmentText ?? '',
    });
    if (!policy.date) policy.date = item.date || '';
    extracted.push({ ...policy, sourceId: item.sourceId });
  }
  logLine(`结构化抽取完成：${extracted.length} 条，其中政策文件 ${extracted.filter((item) => item.docType === '政策文件').length} 条`);
  const fromPdf = extracted.filter((item) => item.bodySource === 'page+pdf').length;
  if (fromPdf > 0) logLine(`附件补全：${fromPdf} 条正文来自 PDF 附件`);

  const merge = upsertPolicies(extracted);
  const perSource = new Map();
  for (const item of extracted) {
    perSource.set(item.sourceId, (perSource.get(item.sourceId) || 0) + 1);
  }

  const run = {
    at,
    requested: selected.length,
    ok: lists.filter((item) => item.ok).length,
    fetched: extracted.length,
    since,
    windowDays,
    ...merge,
    sources: lists.map((list) => ({
      id: list.id,
      name: list.name,
      org: list.org,
      entry: list.entry,
      level: list.level,
      note: list.note,
      ok: list.ok,
      listed: list.listed,
      inWindow: list.inWindow,
      count: perSource.get(list.id) || 0,
      withBody: perSource.get(list.id) || 0,
      error: list.error,
      elapsedMs: list.elapsedMs,
    })),
  };
  recordRun(run);
  save();
  collecting = false;
  progress.phase = 'done';
  logLine(`入库完成：新增 ${merge.added}，更新 ${merge.updated}，语料共 ${merge.total} 项`);
  return { busy: false, run, summary: summary() };
}

/**
 * 附件补全：对已入库但正文偏薄的条目，重新回源读一次附件。
 * 不做全量重采——只补结构性缺口，避免为一个字段把七个源全抓一遍。
 * 失败条目保持原样，绝不用空结果覆盖已有语料。
 */
async function runAttachmentBackfill(options = {}) {
  if (collecting) return { busy: true };
  collecting = true;
  progress.phase = 'attachments';
  const at = new Date().toISOString();

  // 候选：明确标了"正文在附件"，或正文短到装不下一份完整文件。
  // all=true 时全量回源重解析，用于抽取规则或正文上限调整后把整库刷一遍。
  const candidates = getPolicies().filter((policy) => {
    if (Array.isArray(options.ids) && options.ids.length > 0) return options.ids.includes(policy.id);
    if (options.all === true) return true;
    if (policy.docType !== '政策文件') return false;
    return policy.attachmentOnly === true || (policy.bodyLength || 0) < 900;
  });
  logLine(`附件补全开始：候选 ${candidates.length} 条`);

  const rows = await mapLimit(candidates, 4, async (policy) => {
    const before = {
      bodyLength: policy.bodyLength || 0,
      attachmentOnly: policy.attachmentOnly === true,
    };
    try {
      const page = await fetchHtml(policy.sourceUrl, { timeout: 16000 });
      const pageText = extractArticle(page);
      // 正文已经够长就不用翻附件——附件只用来补短正文，无差别下载只会拖慢速度
      const worthDigging = pageText.length < 900 || (policy.attachments ?? []).length > 0;
      const parsed = worthDigging
        ? await readAttachments({ html: page, baseUrl: policy.sourceUrl, title: policy.title })
        : { attachments: policy.attachments ?? [], bodyText: '' };
      // 网页都抓不到内容时，保留原记录，不让补全把数据改坏
      if (pageText.length < 120 && !parsed.bodyText) {
        return { id: policy.id, title: policy.title, status: 'skipped', before, after: before, attachments: parsed.attachments, note: '回源为空，保留原记录' };
      }
      const merged = parsed.bodyText ? `${pageText}\n${parsed.bodyText}`.slice(0, 16000) : pageText;
      const next = extractPolicy({
        title: policy.title,
        text: merged,
        issuer: policy.issuer,
        date: policy.date,
        url: policy.sourceUrl,
        sourceName: policy.sourceName,
        sourceLevel: policy.sourceLevel,
        attachments: parsed.attachments,
        attachmentText: parsed.bodyText,
      });
      upsertPolicies([{ ...next, sourceId: policy.sourceId, id: policy.id }]);
      const main = parsed.attachments.find((item) => item.role === 'main');
      const status = !worthDigging ? 'checked' : parsed.bodyText ? 'filled' : main ? 'blocked' : 'checked';
      return {
        id: policy.id,
        title: policy.title,
        status,
        before,
        after: { bodyLength: next.bodyLength, attachmentOnly: next.attachmentOnly === true },
        gained: Math.max(0, next.bodyLength - before.bodyLength),
        attachments: parsed.attachments,
        note: !worthDigging
          ? '正文已足够长，未重读附件'
          : parsed.bodyText
            ? '正文附件已解析并入'
            : main
              ? `正文附件未解析：${main.error || '未知原因'}`
              : parsed.attachments.length > 0
                ? `仅 ${parsed.attachments.length} 个清单类附件，正文本身完整`
                : '页面未挂附件',
      };
    } catch (error) {
      return { id: policy.id, title: policy.title, status: 'failed', before, after: before, attachments: [], note: error.message };
    }
  });

  const filled = rows.filter((row) => row.status === 'filled');
  save();
  progress.phase = 'done';
  logLine(`附件补全完成：${filled.length} 条从 PDF 补齐，${rows.filter((row) => row.status === 'checked').length} 条无正文附件`);
  collecting = false;
  return {
    busy: false,
    at,
    checked: rows.length,
    filled: filled.length,
    gained: filled.reduce((sum, row) => sum + (row.gained || 0), 0),
    rows,
    summary: summary(),
  };
}

const server = http.createServer(async (req, res) => {
  // 请求行里的路径可能是 "//"、"*" 或畸形串，new URL 会抛错。
  // 这里必须兜住，否则单个畸形请求就能把整个服务进程打挂。
  let url;
  try {
    url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('bad request');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      time: new Date().toISOString(),
      collecting,
      sources: SOURCES.length,
      policies: getPolicies().length,
    });
  }

  if (url.pathname === '/api/progress' && req.method === 'GET') {
    return json(res, 200, { collecting, ...progress });
  }

  if (url.pathname === '/api/policy' && req.method === 'GET') {
    const id = url.searchParams.get('id');
    const item = getPolicies().find((policy) => policy.id === id);
    if (!item) return json(res, 404, { error: '未找到该政策' });
    return json(res, 200, { policy: item });
  }

  if (url.pathname === '/api/corpus' && req.method === 'GET') {
    return json(res, 200, {
      summary: summary(),
      policies: getPolicies(),
      catalog: SOURCES.map(({ id, name, org, entry, level, note }) => ({ id, name, org, entry, level, note })),
    });
  }

  // 地方政策语料：由 scripts/collect-locals.mjs 落盘，读不到就如实返回空，
  // 前端据此显示"尚未抓取"，而不是编一份看起来有数据的矩阵。
  if (url.pathname === '/api/locals' && req.method === 'GET') {
    const file = path.join(ROOT, 'data', 'locals.json');
    if (!fs.existsSync(file)) {
      return json(res, 200, { ready: false, at: null, coverage: null, provinces: [] });
    }
    try {
      const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
      return json(res, 200, { ready: true, ...payload });
    } catch (error) {
      return json(res, 200, { ready: false, at: null, coverage: null, provinces: [], error: error.message });
    }
  }

  if (url.pathname === '/api/collect' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await runCollection(body);
      if (result.busy) return json(res, 429, { error: '采集正在进行中，请稍后重试' });
      return json(res, 200, { run: result.run, summary: result.summary });
    } catch (error) {
      collecting = false;
      return json(res, 500, { error: error.message });
    }
  }

  if (url.pathname === '/api/attachments/backfill' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const result = await runAttachmentBackfill(body);
      if (result.busy) return json(res, 429, { error: '任务正在进行中，请稍后重试' });
      return json(res, 200, result);
    } catch (error) {
      collecting = false;
      progress.phase = 'done';
      return json(res, 500, { error: error.message });
    }
  }

  // 静态资源：生产构建后的 dist
  if (!fs.existsSync(DIST)) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('前端尚未构建：请先执行 npm run build，再启动本服务。');
  }

  const safePath = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST, safePath);
  if (!filePath.startsWith(DIST)) filePath = path.join(DIST, 'index.html');
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  stream.pipe(res);
});

load();

// 兜底：请求处理是 async 的，任何一处抛出都会变成 unhandledRejection，
// Node 默认直接退出——演示时一个边角请求就能让整个服务消失。
process.on('unhandledRejection', (error) => {
  console.error('[server] 未处理的异步异常：', error);
});
process.on('uncaughtException', (error) => {
  console.error('[server] 未捕获异常：', error);
});

server.listen(PORT, HOST, () => {
  console.log(`经纬纵横服务已启动：http://${HOST}:${PORT}`);
  console.log(`语料：${getPolicies().length} 项；采集源：${SOURCES.length} 个`);
});
