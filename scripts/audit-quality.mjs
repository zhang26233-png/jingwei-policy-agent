/**
 * 内部数据核对：抽取覆盖率与缺失归因。
 *
 * 只在本地命令行运行，不向网页提供入口。用途是在交付或修改抽取规则后，
 * 用可复算的数字确认字段覆盖率与结论可回溯率有没有退化。
 *
 *   node scripts/audit-quality.mjs            # 概览
 *   node scripts/audit-quality.mjs --gaps     # 附疑似漏抽清单
 */
import { load, getPolicies } from '../server/store.mjs';
import { buildAudit } from '../server/audit.mjs';

const showGaps = process.argv.includes('--gaps');

load();
const report = buildAudit(getPolicies());
const { corpus, fields, traceability, attachments, verdict } = report;

const line = (label, value) => console.log(`${String(label).padEnd(18, '　')}${value}`);

console.log('政策文件总数　　　', corpus.docs, `（另有背景资料 ${corpus.background} 条）`);
console.log('日期区间　　　　　', `${corpus.dates.from} 至 ${corpus.dates.to}`);
console.log('');

console.log('字段　覆盖　总数　覆盖率　可修率　原文未写　在附件　疑似漏抽');
for (const field of fields) {
  console.log(
    [
      field.label.padEnd(6, '　'),
      String(field.covered).padStart(4),
      String(field.total).padStart(5),
      `${field.rate}%`.padStart(7),
      `${field.ruleRate}%`.padStart(7),
      String(field.gaps['not-in-source']).padStart(9),
      String(field.gaps.attachment).padStart(7),
      String(field.gaps['missing-rule']).padStart(9),
    ].join('　'),
  );
}
console.log('');

console.log('可回溯率　　　　　', `${traceability.rate}%（核对 ${traceability.checked} 句，完全命中 ${traceability.exact} 句）`);
console.log('弱对应 / 未命中　 ', `${traceability.weak} / ${traceability.miss}`);
console.log('正文不足未参与核对', `${traceability.untraceablePolicy} 条`);
console.log('');

line('附件解析', `${attachments.parsed} 条已并入正文，共 ${attachments.chars.toLocaleString('zh-CN')} 字；受阻 ${attachments.blocked.length} 条`);
line('结论', verdict.headline);
for (const note of verdict.notes) console.log(`  · ${note}`);

if (showGaps) {
  console.log('');
  console.log('疑似漏抽清单');
  let index = 0;
  for (const field of fields) {
    for (const item of field.missing.filter((each) => each.reason === 'missing-rule')) {
      index += 1;
      console.log(`${String(index).padStart(3)}. [${field.label}] ${item.date}　${item.title}`);
    }
  }
  if (index === 0) console.log('  无');
}

if (traceability.failures.length > 0) {
  console.log('');
  console.log('弱对应与未命中示例');
  for (const item of traceability.failures.slice(0, 10)) {
    console.log(`  ${item.level === 'miss' ? '未命中' : '弱对应'}（${item.ratio}%）[${item.field}] ${item.text}`);
  }
}
