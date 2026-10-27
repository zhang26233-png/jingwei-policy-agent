/**
 * 附件解析：政府文件的正文经常不在网页里，而在同页的 PDF 附件里。
 * 典型形态——网页只有一句「现将《XX 规划》印发给你们」，
 * 真正的规划全文、指标表、任务分工全在附件 PDF 中。
 *
 * 原则（与抽取层一致）：
 *   1. 只解析「与文件同名」的 PDF，把它当作正文补进文本；
 *   2. 附件清单（名单／表格／申报表）只登记不并入正文——清单不是政策机制，
 *      混进正文会把渠道密度与量化目标算歪；
 *   3. 扫描件（无文字层）宁可标记失败，也不假装解析成功。
 */
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_PAGES = 40;
const MAX_CHARS = 20000;

/** 附件清单类文件：名字里带这些词，说明是名单／表格，不是政策正文 */
const ANNEX_NAME = /(附件\s*[0-9一二三四五六七八九十]|附表|清单|名单|名录|明细|表格|申报表|汇总表|统计表|流程图|示意图|申请表|承诺书)/;

/** 文件名归一：去掉扩展名与全部标点空白，便于和标题做子串比对 */
const PUNCT = /[\s\u3000，。；：、（）()《》〈〉“”"'‘’—－\-·_.,;:!?！？【】[\]]/g;
const normName = (value) => String(value ?? '').replace(PUNCT, '');

/**
 * 从网页 HTML 里找出全部附件链接。
 * 站点写法差异大：有的是 "./P0202....pdf"（相对路径），有的是绝对地址，
 * 链接文字有时是完整书名、有时为空，所以两个来源都取。
 */
export function findAttachments(html, baseUrl) {
  const source = String(html || '');
  const seen = new Set();
  const out = [];
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  const strip = (value) =>
    String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  let match;
  while ((match = anchor.exec(source))) {
    const attrs = match[1];
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const ext = /\.(pdf|ofd|docx?|xlsx?|wps|zip)(?=\?|#|$)/i.exec(href)?.[1]?.toLowerCase();
    if (!ext) continue;
    let url;
    try {
      url = new URL(href, baseUrl).toString();
    } catch {
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const titleAttr = /title\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    let name = strip(match[2]) || strip(titleAttr);
    if (!name) {
      try {
        name = decodeURIComponent(url.split('/').pop() || '');
      } catch {
        name = url.split('/').pop() || '';
      }
    }
    name = name.replace(/\.(pdf|ofd|docx?|xlsx?|wps|zip)$/i, '').trim();
    out.push({ url, name, ext });
  }
  return out;
}

/**
 * 在附件里挑出「正文」那一个。
 * 判定顺序：标题包含附件名（最强证据）→ 页面只有一个 PDF 附件（弱证据）。
 * 挑不到就返回 null，由调用方如实记录"未解析"，不猜。
 *
 * 注意：这里不限制必须是 PDF。若正文是 .doc 或 .ofd，也要认出来并标为 main，
 * 这样"正文不在网页里"这个缺口才是可见的；否则会被误判成"没有附件"。
 */
export function pickMainBody(attachments, title) {
  const titleNorm = normName(title);
  const nonAnnex = attachments.filter((item) => !ANNEX_NAME.test(item.name));

  const exact = nonAnnex.find((item) => {
    const nameNorm = normName(item.name);
    return nameNorm.length >= 6 && titleNorm.includes(nameNorm);
  });
  if (exact) return { attachment: exact, reason: 'title-match' };

  // 页面只挂了一个非清单文件、且文件名足够长：基本可以认定是正文
  const pdfs = nonAnnex.filter((item) => item.ext === 'pdf');
  if (pdfs.length === 1 && normName(pdfs[0].name).length >= 8) {
    return { attachment: pdfs[0], reason: 'sole-pdf' };
  }
  return null;
}

/** 把一份 PDF 转成纯文本；扫描件（无文字层）返回 ok:false，不返回空串充数 */
export async function pdfToText(buffer, { maxPages = MAX_PAGES, maxChars = MAX_CHARS } = {}) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;

  const pages = [];
  const count = Math.min(doc.numPages, maxPages);
  let total = 0;
  for (let index = 1; index <= count; index += 1) {
    const page = await doc.getPage(index);
    const content = await page.getTextContent();
    let pageText = '';
    for (const item of content.items) {
      const chunk = typeof item.str === 'string' ? item.str : '';
      pageText += chunk;
      if (item.hasEOL) pageText += '\n';
    }
    pages.push(pageText);
    total += pageText.length;
    page.cleanup();
    if (total >= maxChars) break;
  }

  // 页眉页脚形如「— 3 —」，属于排版噪音，不是正文
  const cleaned = pages
    .join('\n')
    .replace(/[—–-]\s*\d{1,3}\s*[—–-]/g, '')
    .replace(/[ \t\u3000]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const text = cleaned.slice(0, maxChars);

  // 表格型附件（清单／名单／经验做法表）拉平成文本后是一堆短碎片，
  // 并进正文会把渠道密度和量化目标算歪，所以单独标出来，只登记不并入。
  const lines = cleaned.split('\n').map((line) => line.trim()).filter(Boolean);
  const shortRatio = lines.length === 0 ? 0 : lines.filter((line) => line.length < 12).length / lines.length;
  const tableLike = shortRatio > 0.25 && /(序号|合计|填报单位|单位[:：]|名录|清单)/.test(cleaned.slice(0, 600));

  // 一页正文通常上千字；每页不足 40 字基本可判为扫描件（图片层），需 OCR 才能读
  const scanned = doc.numPages > 0 && text.length / Math.max(1, Math.min(doc.numPages, count)) < 40;
  return {
    ok: !scanned,
    text,
    pages: doc.numPages,
    chars: text.length,
    layout: tableLike ? 'table' : 'prose',
    error: scanned ? '扫描件无文字层，需 OCR' : null,
  };
}

async function download(url, timeout = 30000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*', 'Accept-Language': 'zh-CN,zh;q=0.9' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > MAX_BYTES) {
    throw new Error(`文件过大 ${Math.round(declared / 1048576)}MB（上限 ${Math.round(MAX_BYTES / 1048576)}MB）`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_BYTES) throw new Error('文件过大');
  return buffer;
}

/**
 * 页面级补全：给出网页 HTML 与标题，返回
 *   - attachments：登记表（供详情页与体检页展示）
 *   - bodyText：从正文附件里解析出的文本（没有就为空串）
 *
 * 这里不判断"要不要补"，只负责"能补什么"。是否值得补由调用方按正文字数决定。
 */
export async function readAttachments({ html, baseUrl, title }) {
  const found = findAttachments(html, baseUrl);
  if (found.length === 0) return { attachments: [], bodyText: '' };

  const picked = pickMainBody(found, title);
  const records = [];
  let bodyText = '';

  for (const item of found.slice(0, 6)) {
    const isMain = picked?.attachment.url === item.url;
    const record = {
      name: item.name.slice(0, 60),
      url: item.url,
      ext: item.ext,
      role: isMain ? 'main' : ANNEX_NAME.test(item.name) ? 'annex' : 'other',
      ok: false,
      pages: 0,
      chars: 0,
      layout: null,
      error: null,
    };

    if (item.ext !== 'pdf') {
      // OFD 是国标版式文件、DOC 是二进制 Word，Node 侧都没有可靠的纯文本解析路径，
      // 如实标记不支持，不假装解析成功。
      record.error = `${item.ext.toUpperCase()} 格式暂不支持解析`;
      records.push(record);
      continue;
    }
    if (!isMain && record.role !== 'annex') {
      record.error = '未判定为正文，跳过解析';
      records.push(record);
      continue;
    }

    try {
      const buffer = await download(item.url);
      const parsed = await pdfToText(buffer);
      record.ok = parsed.ok;
      record.pages = parsed.pages;
      record.chars = parsed.chars;
      record.layout = parsed.layout;
      record.error = parsed.error;
      if (isMain && parsed.ok && parsed.layout === 'prose') {
        record.reason = picked.reason;
        bodyText = parsed.text;
      } else if (isMain && parsed.ok) {
        record.reason = picked.reason;
        record.error = '表格型附件，仅登记不并入正文';
      }
    } catch (error) {
      record.error = error.message;
    }
    records.push(record);
  }

  return { attachments: records, bodyText };
}

export const ATTACHMENT_LIMITS = { MAX_BYTES, MAX_PAGES, MAX_CHARS };
