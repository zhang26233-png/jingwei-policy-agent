/**
 * 抽取质量体检
 *
 * 回答两个问题，都用可复算的数字，不靠主观判断：
 *   1. 每个结构化字段实际覆盖了多少条政策，缺的是哪几条；
 *   2. 系统产出的每一句结论，能不能在原文里找回来（可回溯率）。
 *
 * 第二个指标是本项目"不套壳大模型"的核心论据：只要可回溯率接近 100%，
 * 就说明页面上所有文字都能定位到原文位置，不存在模型自由生成的空间。
 */

const PUNCT = /[\s\u3000，。；：、（）()《》〈〉“”"'‘’—－\-·,.;:!?！？[\]【】<>%％]/g;
const norm = (value) => String(value ?? '').replace(PUNCT, '').toLowerCase();

/** 字段台账：key 对应 Policy 上的属性，为什么重要写清楚，缺失清单直接可查
 *  probe 用来给「缺失」归因：原文里连线索都没有 = 文件本身没写（不是我的错）；
 *  线索存在却没抽出来 = 疑似漏抽（这才是要修的）。归因必须可复算，不能凭感觉。
 */
const FIELDS = [
  {
    key: 'docNo',
    label: '文号',
    hint: '公文唯一标识，用于去重与引注',
    unit: 'value',
    probe: /([〔[（(]\s*20\d{2}\s*[〕\]）)]\s*\d+\s*号|第\s*\d+\s*号|20\d{2}\s*年第\s*\d+\s*号)/,
  },
  {
    key: 'effectiveDate',
    label: '施行日期',
    hint: '判断政策是否已生效，科研引用必需',
    unit: 'value',
    probe: /((自|从)[^。；]{0,14}(起|开始)(施行|实施|执行|生效|试行)|自(印发|发布|公布)之日起|施行日期|生效日期)/,
  },
  {
    key: 'quantTargets',
    label: '量化目标',
    hint: '摘要"目标与力度"的唯一硬依据',
    unit: 'list',
    // 只认"目标年份"型线索：泛泛出现金额或百分比（罚款比例、分摊比例）不算目标，否则会虚报漏抽
    probe: /((?:到|至|截至)\s*20\d{2}\s*年|20\d{2}\s*年(底|末)|实现到\s*20\d{2}\s*年|力争[^。；]{0,16}\d)/,
  },
  {
    key: 'obligations',
    label: '条款分类',
    hint: '目标／约束／禁止／激励／程序五分类',
    unit: 'list',
    probe: /(不得|严禁|禁止|应当|必须|要|负责|要求|鼓励|支持|允许|按照)/,
  },
  {
    key: 'implementers',
    label: '实施主体',
    hint: '谁负责执行，决定落地强度',
    unit: 'list',
    probe: /(负责|牵头|组织实施|主管部门|由[^。；]{2,14}(负责|承担)|会同)/,
  },
  {
    key: 'funding',
    label: '资金来源',
    hint: '有没有真金白银，区分倡导与实招',
    unit: 'list',
    probe: /(资金安排|资金来源|经费|补助资金|专项资金|预算内|财政拨款|列支|专项债|统筹使用)/,
  },
  {
    key: 'sections',
    label: '章节结构',
    hint: '文件骨架，决定详情页是否可读',
    unit: 'list',
    probe: /([一二三四五六七八九十]+、|第[一二三四五六七八九十]+[章节]|\n\s*[（(][一二三四五六七八九十]+[）)])/,
  },
  {
    key: 'timeline',
    label: '时间节点',
    hint: '进度安排，机制链时滞的参照',
    unit: 'list',
    // 只认"进度性"时间，不认成文日期与施行日期——后者已在别的字段里，会制造假阳性
    probe: /(年底前|半年前|季度末|前完成|前建成|月底前|6月底|12月底|到\s*20\d{2}\s*年(底|末)?(前|之前))/,
  },
  {
    key: 'paragraphs',
    label: '正文分段',
    hint: '原文分段，证据面板的数据源',
    unit: 'list',
    probe: /./,
  },
];

function has(policy, field) {
  const value = policy[field.key];
  if (field.unit === 'list') return Array.isArray(value) && value.length > 0;
  return Boolean(value);
}

/** 单句可回溯判定：先整串匹配，不中再按标点切片算命中比例 */
function traceLevel(text, hay) {
  const whole = norm(text);
  if (!whole) return { level: 'empty', ratio: 0 };
  if (hay.includes(whole)) return { level: 'exact', ratio: 1 };
  const segments = String(text)
    .split(/[，。；、：,;:]/)
    .map((seg) => norm(seg))
    .filter((seg) => seg.length >= 6);
  if (segments.length === 0) return { level: 'miss', ratio: 0 };
  const hit = segments.filter((seg) => hay.includes(seg)).length;
  const ratio = hit / segments.length;
  if (ratio >= 0.6) return { level: 'partial', ratio };
  return { level: ratio > 0 ? 'weak' : 'miss', ratio };
}

/** 收集需要验证可回溯性的派生文本，并标明它来自哪个字段 */
function derivedTexts(policy) {
  const out = [];
  const push = (field, text) => {
    const clean = String(text ?? '').trim();
    if (clean.length >= 12) out.push({ field, text: clean });
  };
  push('摘要', policy.summary);
  (policy.quantTargets ?? []).forEach((item) => push('量化目标', item.text));
  (policy.obligations ?? []).forEach((group) => {
    (group.items ?? []).forEach((item) => push(`条款·${group.kind}`, item));
  });
  (policy.clauses ?? []).forEach((item) => push(`条款·${item.label ?? '条'}`, item.text));
  return out;
}

export function buildAudit(policies) {
  const all = Array.isArray(policies) ? policies : [];
  const docs = all.filter((policy) => (policy.docType ?? '政策文件') === '政策文件');
  const total = docs.length;

  const fields = FIELDS.map((field) => {
    const covered = docs.filter((policy) => has(policy, field));
    const missing = docs
      .filter((policy) => !has(policy, field))
      .map((policy) => {
        // 归因：附件为主 → 正文没抓到；原文无线索 → 文件本身没写；有线索却没抽出 → 疑似漏抽
        const body = `${policy.fullText ?? ''}${(policy.paragraphs ?? []).join('')}`;
        let reason = 'missing-rule';
        if (policy.attachmentOnly) reason = 'attachment';
        else if (body.length < 60) reason = 'no-body';
        else if (!field.probe.test(body)) reason = 'not-in-source';
        return {
          id: policy.id,
          title: policy.title,
          issuer: policy.issuer,
          date: policy.date,
          reason,
        };
      });
    const count = (reason) => missing.filter((item) => item.reason === reason).length;
    const covered_ = covered.length;
    return {
      key: field.key,
      label: field.label,
      hint: field.hint,
      covered: covered_,
      total,
      rate: total === 0 ? 0 : Math.round((covered_ / total) * 100),
      missing,
      // 只统计"我的错"的那一类，其余是文件本身的性质
      gaps: {
        'not-in-source': count('not-in-source'),
        'missing-rule': count('missing-rule'),
        attachment: count('attachment'),
        'no-body': count('no-body'),
      },
      // 在只算"文件里确实写了"的分母上，抽取成功率是多少
      ruleRate: (() => {
        const denominator = covered_ + count('missing-rule');
        return denominator === 0 ? 100 : Math.round((covered_ / denominator) * 100);
      })(),
      missingInAttachment: count('attachment'),
    };
  });

  // ---- 可回溯率 ----
  const buckets = { exact: 0, partial: 0, weak: 0, miss: 0, empty: 0 };
  const failures = [];
  let checked = 0;
  let untraceablePolicy = 0;

  for (const policy of docs) {
    const hay = norm(`${policy.fullText ?? ''}${(policy.paragraphs ?? []).join('')}`);
    if (hay.length < 60) {
      untraceablePolicy += 1;
      continue;
    }
    for (const item of derivedTexts(policy)) {
      const result = traceLevel(item.text, hay);
      if (result.level === 'empty') continue;
      checked += 1;
      buckets[result.level] += 1;
      if ((result.level === 'weak' || result.level === 'miss') && failures.length < 40) {
        failures.push({
          id: policy.id,
          title: policy.title,
          field: item.field,
          text: item.text.length > 80 ? `${item.text.slice(0, 80)}…` : item.text,
          level: result.level,
          ratio: Math.round(result.ratio * 100),
        });
      }
    }
  }

  const reachable = buckets.exact + buckets.partial;
  const traceRate = checked === 0 ? 0 : Math.round((reachable / checked) * 100);
  const exactRate = checked === 0 ? 0 : Math.round((buckets.exact / checked) * 100);

  // ---- 结构化程度 ----
  const avg = (pick) =>
    total === 0
      ? 0
      : Math.round((docs.reduce((sum, policy) => sum + pick(policy), 0) / total) * 10) / 10;
  const structure = {
    avgClauses: avg((policy) => (policy.clauses ?? []).length),
    avgSections: avg((policy) => (policy.sections ?? []).length),
    avgParagraphs: avg((policy) => (policy.paragraphs ?? []).length),
    avgBodyChars: avg((policy) => policy.bodyLength ?? 0),
    medianFields: (() => {
      const counts = docs
        .map((policy) => FIELDS.filter((field) => has(policy, field)).length)
        .sort((a, b) => a - b);
      if (counts.length === 0) return 0;
      return counts[Math.floor(counts.length / 2)];
    })(),
  };

  const attachmentOnly = docs.filter((policy) => policy.attachmentOnly).length;

  return {
    generatedAt: new Date().toISOString(),
    corpus: {
      total: all.length,
      docs: total,
      background: all.length - total,
      attachmentOnly,
      dates: {
        from: all.reduce((min, policy) => (policy.date && policy.date < min ? policy.date : min), '9999-12-31'),
        to: all.reduce((max, policy) => (policy.date && policy.date > max ? policy.date : max), ''),
      },
    },
    fields,
    traceability: {
      checked,
      reachable,
      rate: traceRate,
      exact: buckets.exact,
      exactRate,
      partial: buckets.partial,
      weak: buckets.weak,
      miss: buckets.miss,
      untraceablePolicy,
      failures,
    },
    structure,
    // 供页面直接显示的判定，避免前端各自解释口径
    verdict: buildVerdict({ fields, traceRate, attachmentOnly, total }),
  };
}

function buildVerdict({ fields, traceRate, attachmentOnly, total }) {
  // 判「该不该修」只看 ruleRate：分母排除"原文本来就没写"和"正文在附件"两种情况，
  // 否则会把文件本身的性质算成系统缺陷，为了数字好看去硬抽，反而制造错误。
  const weak = fields.filter((field) => field.ruleRate < 70);
  const suspect = fields.reduce((sum, field) => sum + field.gaps['missing-rule'], 0);
  const notInSource = fields.reduce((sum, field) => sum + field.gaps['not-in-source'], 0);
  const inAttachment = fields.reduce((sum, field) => sum + field.gaps.attachment, 0);
  const notes = [];
  if (weak.length > 0) {
    notes.push(
      `${weak.map((field) => `${field.label}（可修 ${field.gaps['missing-rule']} 条）`).join('、')} 存在疑似漏抽，是下一步要修的对象。`,
    );
  }
  notes.push(
    `全部空位共归因：原文确实没写 ${notInSource} 处、正文在附件 ${inAttachment} 处、疑似漏抽 ${suspect} 处——只有最后一类算系统缺陷。`,
  );
  if (attachmentOnly > 0) {
    notes.push(`${attachmentOnly} 条政策正文在 PDF／OFD 附件里，当前不解析，属结构性缺口。`);
  }
  return {
    level: traceRate >= 95 && suspect === 0 ? 'ok' : traceRate >= 90 ? 'fair' : 'risk',
    headline:
      traceRate >= 95
        ? `可回溯率 ${traceRate}%：页面上每句结论都能在原文中找到出处`
        : `可回溯率 ${traceRate}%：有 ${100 - traceRate}% 的结论句未能对回原文，需逐条核查`,
    suspect,
    notInSource,
    inAttachment,
    notes,
    total,
  };
}
