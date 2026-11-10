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

/** 地方政策语料：用于央地传导测度，抓取由服务端离线跑，这里只读结果 */
export function fetchLocals() {
  return request<import('./transfer').LocalPayload>('/api/locals', undefined, 30000);
}
