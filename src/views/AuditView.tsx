import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { fetchAudit, type AuditField, type AuditResponse } from '../lib/api';
import './audit.css';

const REASON_META: Record<string, { label: string; tone: string; hint: string }> = {
  'missing-rule': { label: '疑似漏抽', tone: 'warn', hint: '原文里有线索但没抽出来，这是系统缺陷' },
  'not-in-source': { label: '原文未写', tone: 'plain', hint: '原文里确实没有这项内容，留空是正确行为' },
  attachment: { label: '正文在附件', tone: 'info', hint: '政策原文在 PDF／OFD 附件中，当前不解析' },
  'no-body': { label: '无正文', tone: 'plain', hint: '没有抓到正文，无法判断' },
};

interface AuditViewProps {
  onOpenPolicy: (id: string) => void;
}

const pct = (value: number) => `${value}%`;

/** 后端字段与前端版本错配时（例如旧服务没有 gaps）不要整页崩，退化成 0 并继续渲染 */
const gapOf = (field: AuditField) =>
  field.gaps ?? { 'not-in-source': 0, 'missing-rule': 0, attachment: 0, 'no-body': 0 };

export function AuditView({ onOpenPolicy }: AuditViewProps) {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [reasonFilter, setReasonFilter] = useState<string>('missing-rule');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchAudit());
    } catch (err) {
      setError(err instanceof Error ? err.message : '体检失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 不在 effect 内同步 setState：先发请求，回调里再落地，避免级联渲染
    let alive = true;
    fetchAudit()
      .then((result) => {
        if (alive) setData(result);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : '体检失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (loading && !data) {
    return (
      <section className="audit-page">
        <div className="audit-loading">
          <Loader2 size={18} className="spin" />
          正在逐字段核对语料与原文……
        </div>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="audit-page">
        <div className="audit-loading is-error">
          <AlertTriangle size={18} />
          {error ?? '没有拿到体检数据'}
          <button type="button" onClick={() => void load()}>
            重试
          </button>
        </div>
      </section>
    );
  }

  const { corpus, traceability, structure, verdict } = data;
  const fields = data.fields ?? [];
  const openField = fields.find((field) => field.key === openKey) ?? null;
  const filteredMissing = openField
    ? openField.missing.filter((item) => (reasonFilter === 'all' ? true : item.reason === reasonFilter))
    : [];

  return (
    <section className="audit-page">
      <header className="audit-head">
        <div>
          <span className="audit-kicker">质量体检 · 全部数字可复算</span>
          <h1>这套系统到底抽到了什么，凭什么可信</h1>
          <p>
            对 {corpus.docs} 条政策文件逐字段核对：哪些字段抽到了、缺的是原文没写还是系统漏抽、页面上每一句结论能否在原文中找到出处。
            这里不放主观评价，只放能复算的数字。
          </p>
        </div>
        <button type="button" className="audit-refresh" onClick={() => void load()}>
          <RefreshCw size={13} /> 重新体检
        </button>
      </header>

      {/* ---------- 判决条 ---------- */}
      <div className={`audit-verdict is-${verdict.level}`}>
        <div className="audit-verdict-main">
          <span className="audit-verdict-num">{traceability.rate}<i>%</i></span>
          <div>
            <strong>结论可回溯率</strong>
            <p>{verdict.headline}</p>
          </div>
        </div>
        <div className="audit-verdict-grid">
          <div>
            <b>{traceability.checked}</b>
            <span>受检结论句</span>
          </div>
          <div>
            <b>{traceability.exactRate}%</b>
            <span>整句命中原文</span>
          </div>
          <div className="is-warn">
            <b>{verdict.suspect}</b>
            <span>疑似漏抽（该修）</span>
          </div>
          <div>
            <b>{verdict.notInSource}</b>
            <span>原文未写（不该修）</span>
          </div>
        </div>
      </div>

      <p className="audit-note-line">
        「受检结论句」指摘要、量化目标、条款分类里所有对外展示的句子。整句命中原名意味着页面上没有任何自由生成的文字——
        这是本系统与大模型生成式解读的根本差别。{traceability.untraceablePolicy > 0 && `另有 ${traceability.untraceablePolicy} 条政策正文过短（附件为主），未纳入本次核对。`}
      </p>

      {/* ---------- 字段台账 ---------- */}
      <div className="audit-section-head">
        <h2>字段台账</h2>
        <p>点任意一行展开缺失清单。判定「要不要修」只看<span className="audit-inline-strong">规则成功率</span>——分母已排除原文本来没写、正文在附件的情况。</p>
      </div>

      <div className="audit-table">
        <div className="audit-row is-head">
          <span>字段</span>
          <span>覆盖率</span>
          <span>规则成功率</span>
          <span>原文未写</span>
          <span>疑似漏抽</span>
          <span>附件</span>
          <span />
        </div>
        {fields.map((field) => (
          <FieldRow
            key={field.key}
            field={field}
            open={openKey === field.key}
            onToggle={() => {
              setOpenKey(openKey === field.key ? null : field.key);
              setReasonFilter('missing-rule');
            }}
          />
        ))}
      </div>

      {openField && (
        <div className="audit-drawer">
          <header>
            <div>
              <h3>{openField.label} · 缺失 {openField.missing.length} 条</h3>
              <p>{openField.hint}</p>
            </div>
            <div className="audit-filter">
              {[
                { key: 'missing-rule', label: `疑似漏抽 ${gapOf(openField)['missing-rule']}` },
                { key: 'not-in-source', label: `原文未写 ${gapOf(openField)['not-in-source']}` },
                { key: 'attachment', label: `正文在附件 ${gapOf(openField).attachment}` },
                { key: 'all', label: `全部 ${openField.missing.length}` },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={reasonFilter === item.key ? 'is-active' : ''}
                  onClick={() => setReasonFilter(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>
          {filteredMissing.length === 0 ? (
            <p className="audit-empty">
              <CheckCircle2 size={14} /> 该分类下没有条目。
            </p>
          ) : (
            <ul className="audit-missing">
              {filteredMissing.map((item) => (
                <li key={item.id}>
                  <span className={`audit-tag is-${REASON_META[item.reason]?.tone ?? 'plain'}`}>
                    {REASON_META[item.reason]?.label ?? item.reason}
                  </span>
                  <button type="button" className="audit-missing-title" onClick={() => onOpenPolicy(item.id)}>
                    {item.title}
                    <ArrowRight size={12} />
                  </button>
                  <span className="audit-missing-meta">
                    {item.issuer} · {item.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="audit-drawer-foot">
            {REASON_META[reasonFilter]?.hint ?? '共列出该字段全部缺失条目，点击标题可打开原文核对。'}
          </p>
        </div>
      )}

      {/* ---------- 结构指标 ---------- */}
      <div className="audit-section-head">
        <h2>结构化程度</h2>
        <p>抽取的颗粒度决定能不能拿来做研究：平均每条政策被拆成多少可引用的单元。</p>
      </div>
      <div className="audit-stat-grid">
        <Stat value={structure.avgClauses} unit="条" label="平均条款" hint="可用于逐条引注的最小单元" />
        <Stat value={structure.avgSections} unit="节" label="平均章节" hint="文件骨架，决定详情页结构" />
        <Stat value={structure.avgParagraphs} unit="段" label="平均正文段落" hint="证据面板的数据源" />
        <Stat value={structure.avgBodyChars} unit="字" label="平均正文篇幅" hint="已抓到的原文规模" />
        <Stat value={structure.medianFields} unit="/9" label="单条政策字段中位数" hint="9 类字段命中几个" />
      </div>

      {/* ---------- 失败清单 ---------- */}
      <div className="audit-section-head">
        <h2>可回溯失败的句子</h2>
        <p>
          共受检 {traceability.checked} 句，整句命中 {traceability.exact} 句，片段命中 {traceability.partial} 句，
          未对上 {traceability.weak + traceability.miss} 句。
        </p>
      </div>
      {traceability.failures.length === 0 ? (
        <p className="audit-empty is-ok">
          <CheckCircle2 size={14} /> 没有失败条目：所有对外展示的结论句都能在原文中整句找回。
        </p>
      ) : (
        <ul className="audit-failures">
          {traceability.failures.map((item, index) => (
            <li key={`${item.id}-${index}`}>
              <span className={`audit-tag is-${item.level === 'miss' ? 'warn' : 'plain'}`}>
                {item.level === 'miss' ? '未命中' : `片段 ${item.ratio}%`}
              </span>
              <span className="audit-failure-field">{item.field}</span>
              <button type="button" onClick={() => onOpenPolicy(item.id)}>{item.text}</button>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- 口径 ---------- */}
      <div className="audit-method">
        <h3>三个数字怎么算的</h3>
        <dl>
          <dt>覆盖率</dt>
          <dd>有该字段的政策文件数 ÷ 政策文件总数（{corpus.docs} 条）。含原文没写、正文在附件的情况，所以低不一定代表系统差。</dd>
          <dt>规则成功率</dt>
          <dd>覆盖数 ÷（覆盖数 + 疑似漏抽数）。分母剔除了「原文未写」与「正文在附件」，只衡量抽取规则本身的准度，这才是该不该修的判据。</dd>
          <dt>结论可回溯率</dt>
          <dd>把摘要、量化目标、条款分类里的句子逐句拿到原文里找：整串命中记 1；不中则按标点切片，命中过半记 0.6 以上。全部命中即为 100%。</dd>
          <dt>缺失归因</dt>
          <dd>每条缺失都回原文用字段专属探针检查一次：正文在附件、正文为空、原文无相关线索、原文有线索却未抽出，四类互斥，可逐条复核。</dd>
        </dl>
        <p className="audit-method-foot">
          这些数字每次点击「重新体检」都会基于当前语料重算，不存历史值，也不做任何平滑处理。
        </p>
      </div>
    </section>
  );
}

function FieldRow({ field, open, onToggle }: { field: AuditField; open: boolean; onToggle: () => void }) {
  const gaps = gapOf(field);
  const tone = field.ruleRate >= 90 ? 'ok' : field.ruleRate >= 70 ? 'fair' : 'warn';
  return (
    <button type="button" className={`audit-row ${open ? 'is-open' : ''}`} onClick={onToggle}>
      <span className="audit-field-name">
        {field.label}
        <small>{field.hint}</small>
      </span>
      <span className="audit-bar-cell">
        <b>{pct(field.rate)}</b>
        <i className="audit-bar">
          <em style={{ width: `${field.rate}%` }} />
        </i>
        <small>
          {field.covered}/{field.total}
        </small>
      </span>
      <span className={`audit-rate is-${tone}`}>{pct(field.ruleRate)}</span>
      <span className="audit-num">{gaps['not-in-source'] || '—'}</span>
      <span className={`audit-num ${gaps['missing-rule'] > 0 ? 'is-warn' : ''}`}>
        {gaps['missing-rule'] || '—'}
      </span>
      <span className="audit-num">{gaps.attachment || '—'}</span>
      <span className="audit-caret">
        <ChevronDown size={14} />
      </span>
    </button>
  );
}

function Stat({ value, unit, label, hint }: { value: number; unit: string; label: string; hint: string }) {
  return (
    <div className="audit-stat">
      <b>
        {value}
        <i>{unit}</i>
      </b>
      <strong>{label}</strong>
      <small>{hint}</small>
    </div>
  );
}
