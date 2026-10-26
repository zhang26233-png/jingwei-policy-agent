// 语料仓库：采集结果落盘为 JSON，按来源 URL 去重，保留每次采集的运行记录。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'policies.json');

const emptyState = () => ({
  version: 1,
  updatedAt: null,
  runs: [],
  sources: [],
  policies: [],
});

let state = emptyState();

function normalizeUrl(url) {
  return String(url || '')
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function hashId(url) {
  let hash = 0;
  const text = normalizeUrl(url);
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `auto-${hash.toString(36)}`;
}

export function load() {
  try {
    if (fs.existsSync(FILE)) {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      state = { ...emptyState(), ...raw };
    }
  } catch (error) {
    console.warn('[store] 语料文件读取失败，使用空语料：', error.message);
    state = emptyState();
  }
  return state;
}

export function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), 'utf8');
}

export function getState() {
  return state;
}

export function getPolicies() {
  return state.policies;
}

export function upsertPolicies(items) {
  const index = new Map(state.policies.map((item) => [normalizeUrl(item.sourceUrl), item]));
  let added = 0;
  let updated = 0;
  for (const item of items) {
    const key = normalizeUrl(item.sourceUrl);
    if (!key) continue;
    const existing = index.get(key);
    if (existing) {
      Object.assign(existing, item, { id: existing.id });
      updated += 1;
    } else {
      const record = { ...item, id: hashId(item.sourceUrl) };
      index.set(key, record);
      state.policies.push(record);
      added += 1;
    }
  }
  state.policies.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  state.updatedAt = new Date().toISOString();
  return { added, updated, total: state.policies.length };
}

export function recordRun(run) {
  state.runs = [run, ...state.runs].slice(0, 20);
  state.sources = run.sources.map((source) => ({
    id: source.id,
    name: source.name,
    org: source.org,
    entry: source.entry,
    level: source.level,
    note: source.note,
    ok: source.ok,
    count: source.count,
    withBody: source.withBody,
    error: source.error,
    elapsedMs: source.elapsedMs,
    lastRun: run.at,
  }));
}

export function summary() {
  const policies = state.policies;
  const bySource = {};
  for (const item of policies) {
    bySource[item.sourceId] = (bySource[item.sourceId] || 0) + 1;
  }
  return {
    updatedAt: state.updatedAt,
    total: policies.length,
    withBody: policies.filter((item) => (item.bodyLength || 0) > 200).length,
    earliest: policies.reduce((min, item) => (!min || (item.date && item.date < min) ? item.date : min), ''),
    latest: policies.reduce((max, item) => (!max || (item.date && item.date > max) ? item.date : max), ''),
    bySource,
    runs: state.runs.slice(0, 5),
    sources: state.sources,
  };
}
