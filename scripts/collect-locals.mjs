import { collectLocals } from '../server/locals.mjs';
import fs from 'node:fs';
const data = await collectLocals({ since: '2026-05-01', onLog: (l) => console.log('  ', l) });
fs.writeFileSync('./data/locals.json', JSON.stringify(data, null, 1));
console.log('\ncoverage', JSON.stringify(data.coverage));
for (const p of data.provinces) console.log(p.short.padEnd(4), String(p.count).padStart(4), p.earliest, '~', p.latest, p.errors.length ? '| ERR: ' + p.errors[0] : '');
