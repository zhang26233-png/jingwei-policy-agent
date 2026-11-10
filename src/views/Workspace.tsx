import { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  Download,
  FileSearch,
  GitCompareArrows,

  Layers3,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkle,
  Users,
} from 'lucide-react';
import type { AnalysisResult, Policy, ReaderMode } from '../types';
import { AgentTrace } from '../components/AgentTrace';
import { IndicatorChart } from '../components/IndicatorChart';
import { PolicyCard } from '../components/PolicyCard';
import { TransmissionGraph } from '../components/TransmissionGraph';
import { CORPUS_META } from '../data/policies';

const SAMPLE_QUERIES = [
  '2025年稳增长政策中，财政和货币工具如何组合？',
  '提振消费用了哪些工具，哪些家庭可能受益？',
  '降低房贷利率和消费贷贴息如何影响居民支出？',
  '民营经济促进法能改善民营企业融资吗？',
  '2026年房地产税试点有哪些安排？',
];

const MODE_OPTIONS: { id: ReaderMode; label: string; icon: typeof Users }[] = [
  { id: 'research', label: '研究模式', icon: FileSearch },
  { id: 'decision', label: '决策参考', icon: Layers3 },
  { id: 'public', label: '公众解读', icon: Users },
];

interface WorkspaceProps {
  submittedQuery: string;
  result: AnalysisResult | null;
  running: boolean;
  activeStep: number;
  mode: ReaderMode;
  compareIds: string[];
  onModeChange: (mode: ReaderMode) => void;
  onRun: (query: string) => void;
  onOpenPolicy: (id: string) => void;
  onCompare: (id: string) => void;
  onExport: () => void;
  onGoLibrary: () => void;
}

export function Workspace({
  submittedQuery,
  result,
  running,
  activeStep,
  mode,
  compareIds,
  onModeChange,
  onRun,
  onOpenPolicy,
  onCompare,
  onExport,
  onGoLibrary,
}: WorkspaceProps) {
  const [input, setInput] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    if (!value) return;
    onRun(value);
    setInput('');
  };

  if (!submittedQuery) {
    return (
      <div className="workspace-page">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="eyebrow-index">01</span>
              POLICY RESEARCH
              <span className="eyebrow-tag">专题问答</span>
            </div>
            <h1>
              按主题检索政策文件，
              <br />
              <em>
                追溯每一项结论的<span className="no-break">出处。</span>
              </em>
            </h1>
            <p className="hero-description">
              输入研究问题，系统检索国务院、财政部、中国人民银行等官方栏目发布的政策文件，
              提取政策工具与作用对象，并将结论分为原文表述、指标观察与机制判断三类分别呈现。
            </p>

            <form className="hero-search" onSubmit={submit}>
              <Search size={21} strokeWidth={1.8} />
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="输入研究问题，例如：财政政策与货币政策的工具组合"
                aria-label="输入研究问题"
              />
              <button type="submit" className="search-submit">
                开始检索
                <ArrowRight size={17} />
              </button>
            </form>

            <div className="sample-queries">
              <span>示例问题</span>
              <div>
                {SAMPLE_QUERIES.slice(0, 4).map((query) => (
                  <button key={query} onClick={() => onRun(query)}>
                    {query}
                    <ChevronRight size={13} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <aside className="corpus-panel">
            <div className="corpus-panel-head">
              <span>语料范围</span>
              <span className="live-dot">校订快照</span>
            </div>
            <div className="corpus-number">
              8<span>项中央政策</span>
            </div>
            <p className="corpus-range">2024.09 — 2025.08</p>
            <div className="corpus-rule" />
            <dl className="corpus-stats">
              <div>
                <dt>来源</dt>
                <dd>7 官方 + 1 权威媒体</dd>
              </div>
              <div>
                <dt>结构化字段</dt>
                <dd>12 项</dd>
              </div>
              <div>
                <dt>最后校订</dt>
                <dd>2026.10.26</dd>
              </div>
            </dl>
            <div className="corpus-warning">
              <CircleAlert size={15} />
              <span>本批语料为校订快照，不含地方细则与 2026 年增量政策。</span>
            </div>
          </aside>
        </section>

        <section className="capability-strip">
          <div>
            <span className="cap-number">01</span>
            <BookOpen size={20} />
            <h2>汇总</h2>
            <p>把分散的部门文件，整理成可检索、可比较的统一政策卡片。</p>
          </div>
          <div>
            <span className="cap-number">02</span>
            <GitCompareArrows size={20} />
            <h2>分析</h2>
            <p>跨政策识别工具组合、时间接续与执行条件，不限于逐篇摘要。</p>
          </div>
          <div>
            <span className="cap-number">03</span>
            <ShieldCheck size={20} />
            <h2>可视化</h2>
            <p>传导链、指标联动与来源标注同时呈现，结论均附依据。</p>
          </div>
        </section>

        <section className="home-footer">
          <div>
            <span className="section-kicker">与通用问答的区别</span>
            <p>通用模型可以生成解释，但不提供语料完整性、引用与结论是否对应、两次结果是否一致的核验。</p>
          </div>
          <button className="text-button" onClick={onGoLibrary}>
            打开政策库
            <ArrowRight size={14} />
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-page result-page">
      <section className="result-head">
        <div className="eyebrow">
          <span className="eyebrow-index">RUN</span>
          政策检索分析
          <span className="eyebrow-tag">{running ? '正在执行' : '已完成'}</span>
        </div>
        <div className="result-title-row">
          <h1>{submittedQuery}</h1>
          <button className="secondary-button compact" onClick={() => onRun(submittedQuery)}>
            <RotateCcw size={15} />
            重新运行
          </button>
        </div>
        <div className="result-toolbar">
          <div className="mode-switch" role="group" aria-label="读者模式">
            {MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  className={mode === option.id ? 'is-active' : ''}
                  onClick={() => onModeChange(option.id)}
                >
                  <Icon size={14} />
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="result-actions">
            {result && (
              <span className="result-stat">
                <Database size={14} />
                命中 <strong>{result.matchedCount ?? result.matched.length}</strong> / {CORPUS_META.policyCount}
              </span>
            )}
            <button className="secondary-button compact" onClick={onExport} disabled={!result}>
              <Download size={15} />
              导出简报
            </button>
          </div>
        </div>
      </section>

      {running || !result ? (
        <section className="running-panel">
          <div className="running-copy">
            <span className="pulse-ring" />
            <div>
              <h2>正在检索政策文件并提取要素</h2>
              <p>检索语料、抽取政策字段、关联指标并核对引用。本平台采用确定性检索，不以生成式模型生成结论。</p>
            </div>
          </div>
          <AgentTrace
            steps={[
              '解析研究问题与时间范围',
              '检索政策语料并计算相关性',
              '锁定候选政策',
              '抽取政策工具、对象与约束条件',
              '关联利率与财政指标',
              '校验来源等级与引用支持',
              '生成三层结论与影响图谱',
            ]}
            activeStep={activeStep}
          />
          <div className="skeleton-grid">
            <div className="skeleton-block tall" />
            <div className="skeleton-block" />
            <div className="skeleton-block" />
          </div>
        </section>
      ) : (
        <section className="analysis-layout">
          <main className="analysis-main">
            <section className="analysis-summary panel">
              <div className="panel-heading">
                <div>
                  <span className="section-kicker">分析结果 / {result.focusLabel}</span>
                  <h2>
                    {mode === 'research'
                      ? '三层结论'
                      : mode === 'decision'
                        ? '决策参考摘要'
                        : '要点解读'}
                  </h2>
                </div>
                <span className="verification-chip">
                  <Check size={13} />
                  已做引用校验
                </span>
              </div>

              {mode === 'research' && <ResearchSummary result={result} onOpenPolicy={onOpenPolicy} />}
              {mode === 'decision' && <DecisionSummary result={result} />}
              {mode === 'public' && <PublicSummary result={result} />}
            </section>

            {result.absent ? (
              <section className="abstention-panel">
                <div className="abstention-icon">
                  <ShieldCheck size={23} />
                </div>
                <div>
                  <span className="section-kicker">ABSTENTION／不作推断</span>
                  <h2>语料中无直接对应文件，不作机制推断</h2>
                  <p>
                    现有语料未收录与该问题直接对应的政策文件。系统不以相邻政策替代作答，待补充语料后再行分析。
                  </p>
                  <div className="abstention-next">
                    <span>需要补充</span>
                    <p>试点授权文件 · 税基与税率设计 · 地方实施细则 · 官方评估材料</p>
                  </div>
                </div>
              </section>
            ) : (
              <>
                <section className="panel evidence-section">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">POLICY EVIDENCE / {result.matched.length} 项</span>
                      <h2>引用政策</h2>
                    </div>
                    <button className="text-button" onClick={onGoLibrary}>
                      浏览全部政策
                      <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="policy-result-list">
                    {result.matched.map((policy, index) => (
                      <PolicyCard
                        key={policy.id}
                        policy={policy}
                        index={index + 1}
                        onOpen={onOpenPolicy}
                        onCompare={onCompare}
                        inCompare={compareIds.includes(policy.id)}
                      />
                    ))}
                  </div>
                </section>

                <section className="panel graph-section" id="transmission">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">TRANSMISSION / 条件性关系</span>
                      <h2>政策影响传导链</h2>
                      <p className="panel-subtitle">
                        图示为机制假设，虚线表示需附加条件方可成立。
                      </p>
                    </div>
                  </div>
                  <TransmissionGraph result={result} policies={result.matched} onOpenPolicy={onOpenPolicy} />
                </section>

                <section className="panel chart-section" id="indicators">
                  <div className="panel-heading">
                    <div>
                      <span className="section-kicker">INDICATOR LINKAGE / 政策变量</span>
                      <h2>政策与指标的时间联动</h2>
                      <p className="panel-subtitle">
                        仅列示已公布的利率与存款准备金率变动，不对政策后的指标波动作归因判断。
                      </p>
                    </div>
                  </div>
                  <IndicatorChart />
                </section>
              </>
            )}

            <section className="method-note">
              <div className="method-note-mark">i</div>
              <div>
                <h3>结论的来源</h3>
                <p>
                  先按政策标签与正文相似度检索，再将结论分为原文表述、指标观察与机制判断三类。
                  每条结论均标注来源文件与段落。
                </p>
              </div>
            </section>
          </main>

          <aside className="audit-sidebar">
            <div className="audit-card">
              <div className="audit-title">
                <ShieldCheck size={17} />
                检索概览
              </div>
              <div className="audit-coverage">
                <div>
                  <strong>{result.matchedCount ?? result.matched.length}</strong>
                  <span>/ {CORPUS_META.policyCount}</span>
                </div>
                <p>命中政策（引用 {result.matched.length} 项）</p>
              </div>

              <div className="audit-section">
                <span className="audit-label">检索范围</span>
                <p>{result.coverageNote}</p>
              </div>

              <div className="audit-section">
                <span className="audit-label">检索词</span>
                <div className="query-terms">
                  {result.terms.map((term) => (
                    <span key={term}>{term}</span>
                  ))}
                </div>
              </div>

              <div className="audit-section">
                <span className="audit-label">来源结构</span>
                <div className="source-mix">
                  <div>
                    <span className="mix-dot primary" />
                    政策原文
                    <strong>{result.matched.filter((item) => item.sourceLevel === '政策原文').length}</strong>
                  </div>
                  <div>
                    <span className="mix-dot official" />
                    官方发布
                    <strong>{result.matched.filter((item) => item.sourceLevel === '官方发布').length}</strong>
                  </div>
                  <div>
                    <span className="mix-dot media" />
                    权威媒体
                    <strong>{result.matched.filter((item) => item.sourceLevel === '权威媒体').length}</strong>
                  </div>
                </div>
              </div>

              <div className="audit-section">
                <span className="audit-label">说明事项</span>
                <ul className="warning-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>
                      <CircleAlert size={13} />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="audit-section audit-query">
                <span className="audit-label">本次检索</span>
                <dl>
                  <div>
                    <dt>识别主题</dt>
                    <dd>{result.focusLabel}</dd>
                  </div>
                  <div>
                    <dt>结论层数</dt>
                    <dd>3 层</dd>
                  </div>
                  <div>
                    <dt>语料版本</dt>
                    <dd>{CORPUS_META.version}</dd>
                  </div>
                </dl>
              </div>

            </div>

            <div className="aside-tip">
              <Sparkle size={16} />
              <p>切换至“公众解读”，可查看不含专业术语的表述。</p>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}

function CitationRow({
  result,
  ids,
  onOpenPolicy,
}: {
  result: AnalysisResult;
  ids: string[];
  onOpenPolicy: (id: string) => void;
}) {
  const refs = ids
    .map((id) => ({ policy: result.matched.find((item) => item.id === id), id }))
    .filter((item): item is { policy: Policy; id: string } => Boolean(item.policy));

  if (refs.length === 0) return null;

  return (
    <div className="citation-row">
      <span>依据</span>
      {refs.map(({ policy, id }) => (
        <button key={id} onClick={() => onOpenPolicy(id)} title={policy.title}>
          [{result.matched.findIndex((item) => item.id === id) + 1}] {policy.shortTitle}
        </button>
      ))}
    </div>
  );
}

function ResearchSummary({
  result,
  onOpenPolicy,
}: {
  result: AnalysisResult;
  onOpenPolicy: (id: string) => void;
}) {
  const toneLabels = {
    fact: '原文事实',
    observation: '数据观察',
    inference: '机制推断',
  };
  return (
    <div className="research-sections">
      {result.sections.map((section, index) => (
        <article className={`research-section tone-${section.tone}`} key={section.title}>
          <div className="research-section-index">{String(index + 1).padStart(2, '0')}</div>
          <div className="research-section-body">
            <div className="research-section-top">
              <h3>{section.title}</h3>
              <span className={`tone-badge ${section.tone}`}>{toneLabels[section.tone]}</span>
            </div>
            <p>{section.body}</p>
            <CitationRow
              result={result}
              ids={section.refs.map((ref) => ref.policyId)}
              onOpenPolicy={onOpenPolicy}
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function DecisionSummary({ result }: { result: AnalysisResult }) {
  const items = [
    { label: '政策组合', value: result.decisionSummary.mix, icon: Layers3 },
    { label: '观察指标', value: result.decisionSummary.watch, icon: Search },
    { label: '风险与缺口', value: result.decisionSummary.risk, icon: CircleAlert },
  ];
  return (
    <div className="decision-grid">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="decision-item">
            <div className="decision-label">
              <Icon size={16} />
              {item.label}
            </div>
            <p>{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function PublicSummary({ result }: { result: AnalysisResult }) {
  const items = [
    { label: '一句话说清', value: result.publicSummary.oneLine },
    { label: '跟你有什么关系', value: result.publicSummary.relevance },
    { label: '别误会', value: result.publicSummary.misconception },
  ];
  return (
    <div className="public-grid">
      {items.map((item, index) => (
        <div key={item.label} className="public-item">
          <span className="public-index">{String(index + 1).padStart(2, '0')}</span>
          <h3>{item.label}</h3>
          <p>{item.value}</p>
        </div>
      ))}
    </div>
  );
}
