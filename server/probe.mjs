import { SOURCES, collectSource } from './sources.mjs';

const only = process.argv[2];
for (const source of SOURCES) {
  if (only && source.id !== only) continue;
  try {
    const result = await collectSource(source, { limit: 20 });
    console.log(`\n== ${source.id} ok items=${result.count} withBody=${result.withBody} ${result.elapsedMs}ms`);
    for (const item of result.items.slice(0, 4)) {
      console.log(`  [${item.date || '----'}] ${item.title.slice(0, 42)} | body=${item.text.length}`);
      console.log(`     ${item.url}`);
    }
  } catch (error) {
    console.log(`\n== ${source.id} FAIL ${error.message}`);
  }
}
