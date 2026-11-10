import type { AnalysisResult, ImpactResult, Policy } from '../types';
import type { PolicyDigest } from './digest';
import type { MechanismChain } from './mechanism';
import type { PriorityBoard } from './priority';
import type { RelationResult } from './relations';
import { QUADRANT_META, type SynergyResult } from './synergy';

export function downloadText(filename: string, content: string, mime = 'text/markdown;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function citationNumbers(result: AnalysisResult, ids: string[]): string {
  const numbers = ids
    .map((id) => {
      const index = result.matched.findIndex((policy) => policy.id === id);
      return index >= 0 ? index + 1 : null;
    })
    .filter((value): value is number => value !== null);
  return numbers.length > 0 ? numbers.map((number) => `[${number}]`).join('') : '';
}

export function buildReport(result: AnalysisResult): string {
  const date = new Date().toLocaleDateString('zh-CN');
  const lines: string[] = [
    '# 经纬纵横 · 政策研究简报',
    '',
    `- 研究问题：${result.query}`,
    `- 生成日期：${date}`,
    '- 语料范围：中央政策自动采集 + 校订样例，具体条目见政策库',
    '- 说明：本报告为研究辅助材料，所含结论不作政策效果估计。',
    '',
    '## 一、分析结论',
    '',
  ];

  result.sections.forEach((section, index) => {
    const tone = section.tone === 'fact' ? '原文事实' : section.tone === 'observation' ? '数据观察' : '机制推断';
    lines.push(`### ${index + 1}. ${section.title}（${tone}）`);
    lines.push('');
    lines.push(`${section.body}${citationNumbers(result, section.refs.map((ref) => ref.policyId))}`);
    lines.push('');
  });

  lines.push('## 二、公众版解释', '');
  lines.push(`**一句话：** ${result.publicSummary.oneLine}`);
  lines.push('');
  lines.push(`**公众关注点：** ${result.publicSummary.relevance}`);
  lines.push('');
  lines.push(`**常见误解：** ${result.publicSummary.misconception}`);
  lines.push('');

  lines.push('## 三、政策证据清单', '');
  result.matched.forEach((policy, index) => {
    lines.push(`### [${index + 1}] ${policy.title}`);
    lines.push('');
    lines.push(`- 发布主体：${policy.issuer}`);
    lines.push(`- 发布时间：${policy.date}`);
    lines.push(`- 生效时间：${policy.effective}`);
    lines.push(`- 来源等级：${policy.sourceLevel}`);
    lines.push(`- 来源链接：${policy.sourceUrl}`);
    lines.push(`- 政策工具：${policy.instruments.join('、')}`);
    lines.push('');
    lines.push(`> ${policy.excerpt}`);
    lines.push('');
  });

  lines.push('## 四、证据边界与系统警告', '');
  lines.push(`- ${result.coverageNote}`);
  result.warnings.forEach((warning) => lines.push(`- ${warning}`));
  lines.push('');
  lines.push('---');
  lines.push('由经纬纵横生成。政策结论请以原文与官方统计数据为准。');

  return lines.join('\n');
}

export function buildCompareReport(selected: Policy[]): string {
  const lines: string[] = [
    '# 经纬纵横 · 政策对比清单',
    '',
    `- 对比政策：${selected.length} 项`,
    `- 生成日期：${new Date().toLocaleDateString('zh-CN')}`,
    '',
    '| 字段 | ' + selected.map((policy) => policy.shortTitle).join(' | ') + ' |',
    '| --- | ' + selected.map(() => '---').join(' | ') + ' |',
    '| 发布主体 | ' + selected.map((policy) => policy.issuer).join(' | ') + ' |',
    '| 发布时间 | ' + selected.map((policy) => policy.date).join(' | ') + ' |',
    '| 生效时间 | ' + selected.map((policy) => policy.effective).join(' | ') + ' |',
    '| 政策工具 | ' + selected.map((policy) => policy.instruments.join('；')).join(' | ') + ' |',
    '| 作用对象 | ' + selected.map((policy) => policy.targets.join('；')).join(' | ') + ' |',
    '| 政策目标 | ' + selected.map((policy) => policy.goals.join('；')).join(' | ') + ' |',
    '| 来源等级 | ' + selected.map((policy) => policy.sourceLevel).join(' | ') + ' |',
    '| 来源链接 | ' + selected.map((policy) => policy.sourceUrl).join(' | ') + ' |',
    '',
    '> 注意：不同政策的工具、力度、时间窗口和作用对象不同，不能只比较数量或金额。',
  ];
  return lines.join('\n');
}

export interface BriefingInput {
  windowDays: number;
  board: PriorityBoard;
  relations: RelationResult;
  impact: ImpactResult;
  mechanisms: Record<string, MechanismChain[]>;
  digests: PolicyDigest[];
  synergy: SynergyResult;
  generatedAt: string;
}

/** 协同测度章节：单列导出与并入简报共用同一段文本，避免两处口径漂移 */
function synergyChapter(result: SynergyResult, heading = '## 六、政策协同测度'): string[] {
  const lines: string[] = [heading, ''];
  lines.push(
    `总体一致性 **${result.overall.pci}** 分、总体可执行性 **${result.overall.pei}** 分（${result.overall.policyCount} 份政策文件）。`,
  );
  lines.push('');
  result.narrative.forEach((line) => lines.push(`- ${line}`));
  lines.push('');
  lines.push('| 渠道 | 政策数 | 一致性 PCI | 横向 | 时序 | 目标—工具 | 可执行性 PEI | 象限 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  result.channels.forEach((channel) => {
    const [horizontal, temporal, alignment] = channel.coherence.parts;
    lines.push(
      `| ${channel.name} | ${channel.policyCount} | ${channel.pci} | ${horizontal.score ?? '—'} | ${temporal.score ?? '—'} | ${alignment.score ?? '—'} | ${channel.pei} | ${QUADRANT_META[channel.quadrant].label} |`,
    );
  });
  lines.push('');
  const opposing = result.channels.filter(
    (channel) => channel.coherence.opposing.expansion.length > 0 && channel.coherence.opposing.restriction.length > 0,
  );
  if (opposing.length > 0) {
    lines.push('**方向并存（同渠道内扩张与收紧同时出现）**：');
    opposing.forEach((channel) => {
      const { expansion, restriction } = channel.coherence.opposing;
      lines.push(
        `- 〔${channel.short}〕扩张方向：${expansion.map((item) => quote(item.title)).join('、')}；` +
          `收紧方向：${restriction.map((item) => quote(item.title)).join('、')}`,
      );
    });
    lines.push('> 系统只判定方向，不判断两份文件是否针对同一对象；是否构成实质冲突需回原文比对。');
    lines.push('');
  }
  const weakest = [...result.channels].sort((a, b) => a.pei - b.pei).slice(0, 3);
  lines.push('**执行条件最弱的三个渠道**：');
  weakest.forEach((channel) => {
    lines.push(
      `- ${channel.name}（PEI ${channel.pei}）：最弱项为${channel.effectiveness.weakestItem?.label ?? '—'}，` +
        `达标 ${channel.effectiveness.weakestItem?.rate ?? 0}%`,
    );
  });
  lines.push('');
  lines.push(`> 四象限分界线取本期中位数（一致性 ${result.split.pci} 分、可执行性 ${result.split.pei} 分）。`);
  lines.push('');
  return lines;
}

export function buildSynergyReport(result: SynergyResult): string {
  const lines: string[] = [
    '# 经纬纵横 · 政策协同测算',
    '',
    `- 生成日期：${new Date().toLocaleDateString('zh-CN')}`,
    `- 样本：${result.overall.policyCount} 份政策文件，覆盖 ${result.overall.channelCount} 条传导渠道`,
    '- 说明：本报告测算政策文本的取向一致性与执行条件，不涉及政策效果估计。',
    '',
    ...synergyChapter(result, '## 一、测算结果'),
    '## 二、指标口径',
    '',
    '| 指标 | 权重 | 算法 |',
    '| --- | --- | --- |',
    ...result.method.map((item) => `| ${item.label} | ${Math.round(item.weight * 100)}% | ${item.how} |`),
    '',
    '## 三、适用范围',
    '',
    ...result.caveats.map((caveat) => `- ${caveat}`),
    '',
    '---',
    '由经纬纵横自动生成。',
  ];
  return lines.join('\n');
}

export function buildBriefingReport(input: BriefingInput): string {
  const { board, relations, impact, mechanisms, digests, synergy } = input;
  const date = new Date(input.generatedAt);
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const lines: string[] = [
    '# 经纬纵横 · 政策扫描简报',
    '',
    `- 生成时间：${stamp}`,
    `- 时间窗：近 ${input.windowDays} 天`,
    `- 参与排序：${board.scanned} 项政策文件（中央层面，来自国务院、财政部、中国人民银行官方栏目）`,
    `- 使用声明：本简报用于研究辅助，不构成政策效果估计或决策建议。所有结论须回到原文复核。`,
    '',
    '## 一、本期概览',
    '',
    '| 指标 | 结果 |',
    '| --- | --- |',
    `| 政策文件数量 | ${board.scanned} 项 |`,
    `| 最高优先级 | ${board.ranked[0]?.assessment.score ?? 0} 分（${board.ranked[0]?.assessment.grade ?? '—'}） |`,
    `| 组合方向 | ${relations.combination.direction}（扩张 ${relations.combination.expansive}／收紧 ${relations.combination.restrictive}／未定 ${relations.combination.neutral}） |`,
    `| 识别关系数 | ${relations.edges.length} 组 |`,
    `| 最高暴露省份 | ${impact.provinces[0]?.name ?? '—'}（${impact.provinces[0]?.exposure ?? 0}） |`,
    '',
    `> ${relations.combination.note}`,
    '',
    '## 二、政策摘要',
    '',
    '> 摘要由已抽取字段拼装，每句标注依据；字段抽不到即写"原文未写明"，未做语义补全。',
    '',
  ];

  digests.forEach((digest, index) => {
    const item = board.ranked[index];
    lines.push(`### 2.${index + 1} ${item?.policy.title ?? digest.id}（${item?.assessment.grade ?? '—'}／${item?.assessment.score ?? '—'} 分）`);
    lines.push('');
    lines.push(`**主旨**：${digest.headline}`);
    lines.push('');
    digest.sentences.forEach((sentence) => lines.push(`- **${sentence.label}**：${sentence.text}`));
    lines.push('');
    if (digest.points.length > 0) {
      lines.push('**关键表述**：');
      digest.points.forEach((point, pointIndex) => lines.push(`${pointIndex + 1}. 〔${point.tag}〕${point.text}`));
      lines.push('');
    }
    if (digest.gaps.length > 0) lines.push(`- 摘要未覆盖：${digest.gaps.join('、')}`);
    lines.push('');
  });

  lines.push('## 三、政策优先级排序', '');
  lines.push('| 排名 | 等级 | 分数 | 政策 | 发文机关 | 发布日 | 预计时滞 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  board.ranked.forEach((item, index) => {
    lines.push(
      `| ${index + 1} | ${item.assessment.grade} | ${item.assessment.score} | ${item.policy.title} | ${item.policy.issuer} | ${item.policy.date} | ${item.assessment.horizon} |`,
    );
  });
  lines.push('');

  board.ranked.slice(0, 3).forEach((item, index) => {
    lines.push(`### 2.${index + 1} ${item.policy.title}`);
    lines.push('');
    lines.push(`- 来源：${item.policy.issuer}｜${item.policy.date}｜${item.policy.sourceLevel}`);
    lines.push(`- 链接：${item.policy.sourceUrl}`);
    lines.push('- 评分拆解：');
    item.assessment.dimensions.forEach((dimension) => {
      lines.push(`  - ${dimension.label}（权重 ${Math.round(dimension.weight * 100)}%）：${Math.round(dimension.score)} 分 — ${dimension.detail}`);
    });
    if (item.assessment.weaknesses.length > 0) {
      lines.push(`- 需注意：${item.assessment.weaknesses.join('；')}`);
    }
    lines.push('');
  });

  lines.push('## 四、作用机制与影响逻辑', '');
  board.ranked.slice(0, 3).forEach((item) => {
    const chains = mechanisms[item.policy.id] ?? [];
    if (chains.length === 0) return;
    lines.push(`### ${item.policy.shortTitle || item.policy.title}`);
    lines.push('');
    chains.forEach((chain) => {
      lines.push(`**传导渠道：${chain.channelName}｜方向：${chain.directionLabel}｜时滞：${chain.latency}**`);
      lines.push('');
      chain.links.forEach((link) => {
        const arrow = link.direction === -1 ? '↓' : link.direction === 1 ? '↑' : '·';
        lines.push(`${link.layerLabel} ${arrow} **${link.label}** — ${link.detail}`);
      });
      lines.push('');
      lines.push(`> ${chain.summary}`);
      if (chain.evidence) lines.push(`> 原文依据：${chain.evidence}`);
      lines.push('');
      lines.push('时间路径：');
      chain.path.forEach((step) => lines.push(`- ${step.at}：${step.what}`));
      lines.push('');
      lines.push('观察指标：');
      chain.watch.forEach((item) => lines.push(`- ${item.label}：${item.what}`));
      lines.push('');
      lines.push(`- 反向情景：${chain.counter}`);
      lines.push(`- 失效判定：${chain.falsify}`);
      chain.risks.forEach((risk) => lines.push(`- 失效条件：${risk}`));
      lines.push('');
    });
  });

  lines.push('## 五、政策相互关系', '');
  lines.push(`组合方向：**${relations.combination.direction}**。${relations.combination.note}`);
  lines.push('');
  relations.narrative.forEach((line) => lines.push(`- ${line}`));
  lines.push('');
  lines.push('| 关系类型 | 政策 A | 政策 B | 强度 | 说明 |');
  lines.push('| --- | --- | --- | --- | --- |');
  relations.edges.forEach((edge) => {
    const from = relations.nodes.find((node) => node.id === edge.from);
    const to = relations.nodes.find((node) => node.id === edge.to);
    lines.push(`| ${edge.label} | ${from?.label ?? '—'} | ${to?.label ?? '—'} | ${edge.strength.toFixed(2)} | ${edge.note} |`);
  });
  lines.push('');

  lines.push('## 六、政策协同测度', '');
  lines.push(...synergyChapter(synergy, '').slice(1));
  lines.push('## 七、省级影响（暴露度前八）', '');
  lines.push('| 省份 | 暴露度 | 受益 | 承压 | 主要驱动 |');
  lines.push('| --- | --- | --- | --- | --- |');
  impact.provinces.slice(0, 8).forEach((province) => {
    lines.push(
      `| ${province.name} | ${province.exposure} | ${province.benefit} | ${province.pressure} | ${province.drivers.slice(0, 2).join('；') || '—'} |`,
    );
  });
  lines.push('');

  lines.push('## 八、数据说明', '');
  lines.push('- 优先级：发文层级 22%、时效性 18%、力度强度 18%、覆盖广度 13%、约束强度 12%、政策信号 12%、新增信息 5%，加权后分级。');
  lines.push('- 机制链：由政策工具、传导渠道、作用对象与原文关键句推导，方向由表述倾向判定，时滞为定性区间。');
  lines.push('- 关系：依据同发文机关、同渠道、时间距离与方向异同推导，不等于发文机关确认的配套关系。');
  lines.push('- 省级影响：渠道权重与省份经济结构敏感度的乘积，属结构测算，非计量估计，未使用统计年鉴校准。');
  lines.push('- 政策协同：一致性由"横向／时序／目标—工具"三项加权，可执行性由"目标可测／责任可归属／资源有保障／时限明确／可考核"五项各 20 分合成。');
  relations.caveats.forEach((item) => lines.push(`- ${item}`));
  impact.caveats.forEach((item) => lines.push(`- ${item}`));
  synergy.caveats.forEach((item) => lines.push(`- ${item}`));
  lines.push('');
  lines.push('---');
  lines.push('由经纬纵横自动生成。');

  return lines.join('\n');
}

// 标题常自带书名号，报告中统一格式，避免出现《《…》
const quote = (text: string) => `《${text.replace(/[《》]/g, '')}》`;
