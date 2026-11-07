// 独立复验：不经过浏览器，直接从真实语料算出央地传导的全部结论。
//
// 为什么要这个脚本：页面上的数字看起来都对，但"看起来对"不等于可复算。
// 这里用同一份 data/locals.json 和同一份 transfer.ts，在 Node 里独立跑一遍，
// 断言几个关键值。改了口径规则却忘了同步结论时，这里会立刻变红。
//
// 用法：npm run verify
//
// 实现说明：transfer.ts 是自包含的（没有任何 import），所以用 TypeScript 的
// transpileModule 直接转成 ESM 就能跑，不需要 esbuild 或打包器。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const tmpDir = resolve(root, '.tmp');
mkdirSync(tmpDir, { recursive: true });

const source = readFileSync(resolve(root, 'src/lib/transfer.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const modulePath = resolve(tmpDir, 'transfer.verify.mjs');
writeFileSync(modulePath, compiled, 'utf8');

const { buildTransfer, buildLagRanking, buildAttention } = await import(pathToFileURL(modulePath).href);

const locals = JSON.parse(readFileSync(resolve(root, 'data/locals.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(resolve(root, 'data/policies.json'), 'utf8'));

// 磁盘上的 locals.json 没有 ready 字段——那是 server/index.mjs 在响应时补的。
const result = buildTransfer(
  { ...locals, ready: true },
  corpus.policies.map((policy) => ({ id: policy.id, title: policy.title, date: policy.date })),
);
if (!result) {
  console.error('buildTransfer 返回 null：检查 data/locals.json 的 provinces 是否为空');
  process.exit(1);
}

const ranking = buildLagRanking(result);
const attention = buildAttention(locals.provinces);
const usable = result.provinces.filter((province) => province.usable);
const excluded = result.provinces.filter((province) => !province.usable);

console.log('=== 语料 ===');
console.log(`地方文件 ${result.coverage.items} 份 | 采集于 ${locals.at}`);
console.log(`中央政策 ${corpus.policies.length} 条`);

console.log('\n=== 可用性 ===');
console.log(`可用 ${usable.length} 个：${usable.map((p) => p.short).join('、')}`);
console.log(
  `省级 ${usable.filter((p) => p.level.startsWith('省级')).length} + 市级 ${
    usable.filter((p) => !p.level.startsWith('省级')).length
  }`,
);
for (const province of excluded) console.log(`  未纳入：${province.name} → ${province.reason}`);

console.log('\n=== 配对与统计 ===');
console.log(
  `组合 ${result.summary.totalPairs} | 可观察 ${result.summary.observablePairs} | 超出窗口 ${result.summary.outsidePairs}`,
);
console.log(`respond ${result.summary.respondPairs} | pre ${result.summary.prePairs} | 覆盖主题 ${result.summary.respondedThemes}`);
console.log(`中位时滞 ${result.summary.medianLag} 天 | 最快 +${result.summary.fastest?.lag} | 最慢 +${result.summary.slowest?.lag}`);

console.log('\n=== 时滞排行 ===');
ranking.items.forEach((item, index) =>
  console.log(`${index + 1}. ${item.province}·${item.theme} +${item.lag} 天（${item.date}）`),
);
console.log(`分档 fast/mid/slow = ${ranking.bands.fast}/${ranking.bands.mid}/${ranking.bands.slow}`);

const distribution = {};
for (const row of result.rows) {
  for (const cell of Object.values(row.cells)) {
    distribution[cell.status] = (distribution[cell.status] ?? 0) + 1;
  }
}
console.log('\n=== 状态分布 ===');
console.log(JSON.stringify(distribution));
console.log(`注意力热力：${attention?.buckets.length ?? 0} 桶 × ${attention?.provinces.length ?? 0} 省`);

// 断言针对的是 2026-11-07 这份语料。换数据后这些数字会变，
// 那时应该更新期望值并说明为什么变，而不是删掉断言。
const checks = [
  ['可用省份 6 个', usable.length === 6],
  ['省级 5 + 市级 1', usable.filter((p) => p.level.startsWith('省级')).length === 5],
  ['总组合 108', result.summary.totalPairs === 108],
  ['可观察 107', result.summary.observablePairs === 107],
  ['respond = 7', result.summary.respondPairs === 7],
  ['pre = 8', result.summary.prePairs === 8],
  ['中位时滞 = 16', result.summary.medianLag === 16],
  ['最快 = 6', result.summary.fastest?.lag === 6],
  ['最慢 = 77', result.summary.slowest?.lag === 77],
  ['分档 5/1/1', ranking.bands.fast === 5 && ranking.bands.mid === 1 && ranking.bands.slow === 1],
];

console.log('\n=== 断言 ===');
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed += 1;
}
console.log(failed === 0 ? '\n全部通过。' : `\n${failed} 条不通过。`);
process.exitCode = failed === 0 ? 0 : 1;
