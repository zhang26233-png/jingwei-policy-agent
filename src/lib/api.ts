// 后端接口封装：语料与采集。接口不可用时前端自动回退到内置校订语料。
import type { Policy } from '../types';

export interface SourceStatus {
  id: string;
  name: string;
  org: string;
  entry: string;
  level: string;
  note: string;
  ok: boolean;
  count: number;
  withBody: number;
  listed?: number;
  inWindow?: number;
  error: string | null;
  elapsedMs: number;
  lastRun?: string;
}

export interface CorpusSummary {
  updatedAt: string | null;
  total: number;
  withBody: number;
  earliest: string;
  latest: string;
  bySource: Record<string, number>;
  sources: SourceStatus[];
  runs: {
    at: string;
    requested: number;
    ok: number;
    fetched: number;
    added: number;
    updated: number;
    total: number;
  }[];
}

export interface CorpusResponse {
  summary: CorpusSummary;
  policies: Policy[];
  catalog: { id: string; name: string; org: string; entry: string; level: string; note: string }[];
}

const TIMEOUT = 20000;
// 采集要并发抓几十个部委页面，给足两分钟，避免网慢时被前端先掐断。
const COLLECT_TIMEOUT = 150000;

async function request<T>(url: string, init?: RequestInit, timeout = TIMEOUT): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    window.clearTimeout(timer);
  }
}

export function fetchCorpus() {
  return request<CorpusResponse>('/api/corpus');
}

export interface CollectOptions {
  limit?: number;
  since?: string;
  windowDays?: number;
  sources?: string[];
}

export function runCollect(options: CollectOptions = {}) {
  return request<{ run: CorpusSummary['runs'][number]; summary: CorpusSummary }>(
    '/api/collect',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    },
    COLLECT_TIMEOUT,
  );
}

export interface ScanOutcome {
  ok: boolean;
  message?: string;
  policies: Policy[];
  sources: SourceStatus[];
  updatedAt: string | null;
  added: number;
  fetched: number;
}

/** 抽取质量体检：字段覆盖率 + 缺失归因 + 结论可回溯率 */
export interface AuditGapReason {
  id: string;
  title: string;
  issuer: string;
  date: string;
  reason: 'not-in-source' | 'missing-rule' | 'attachment' | 'no-body';
}

export interface AuditField {
  key: string;
  label: string;
  hint: string;
  covered: number;
  total: number;
  rate: number;
  missing: AuditGapReason[];
  gaps: { 'not-in-source': number; 'missing-rule': number; attachment: number; 'no-body': number };
  ruleRate: number;
  missingInAttachment: number;
}

export interface AuditAttachmentBlocked {
  id: string;
  title: string;
  reason: string;
  name: string;
}

/** 附件解析台账：正文在 PDF 里的，哪些已并入、哪些解析不了 */
export interface AuditAttachments {
  parsed: number;
  chars: number;
  blocked: AuditAttachmentBlocked[];
  annexOnly: number;
  noAttachment: number;
  total: number;
}

export interface AuditResponse {
  generatedAt: string;
  corpus: {
    total: number;
    docs: number;
    background: number;
    attachmentOnly: number;
    dates: { from: string; to: string };
  };
  attachments?: AuditAttachments;
  fields: AuditField[];
  traceability: {
    checked: number;
    reachable: number;
    rate: number;
    exact: number;
    exactRate: number;
    partial: number;
    weak: number;
    miss: number;
    untraceablePolicy: number;
    failures: { id: string; title: string; field: string; text: string; level: string; ratio: number }[];
  };
  structure: {
    avgClauses: number;
    avgSections: number;
    avgParagraphs: number;
    avgBodyChars: number;
    medianFields: number;
  };
  verdict: {
    level: 'ok' | 'fair' | 'risk';
    headline: string;
    suspect: number;
    notInSource: number;
    inAttachment: number;
    notes: string[];
    total: number;
  };
}

export function fetchAudit() {
  return request<AuditResponse>('/api/audit', undefined, 30000);
}

export interface BackfillResult {
  checked: number;
  filled: number;
  gained: number;
  rows: { id: string; title: string; status: string; note: string }[];
}

/** 回源重读附件：all=true 时对整库重解析（抽取规则或正文上限调整后用） */
export function backfillAttachments(all = false) {
  return request<BackfillResult>(
    '/api/attachments/backfill',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all }) },
    180000,
  );
}
