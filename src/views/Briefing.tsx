import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardCopy,
  Download,
  FileText,
  Gauge,
  Loader2,
  Network,
  Radar,
  RefreshCw,
  Sparkles,
  Timer,
} from 'lucide-react';
import type { ImpactResult, Policy } from '../types';
import type { ScanOutcome, SourceStatus } from '../lib/api';
import { buildMechanism, buildMechanismBoard, combineDirection, type MechanismChain } from '../lib/mechanism';
import { rankPolicies, type PriorityBoard } from '../lib/priority';
import { buildRelations, RELATION_META, type RelationResult } from '../lib/relations';
import { buildSynergy } from '../lib/synergy';
import { evaluateImpact } from '../lib/province';
import { buildDigest, type PolicyDigest } from '../lib/digest';
import { buildBriefingReport, downloadText } from '../lib/report';
import { RelationGraph } from '../components/RelationGraph';
import { SourceRadar } from '../components/SourceRadar';
import { PolicyDigestCard } from '../components/PolicyDigestCard';
import './briefing.css';

const DAY = 86400000;

const STAGES = [
  { key: 'connect', label: '连接官方来源', detail: '校验国务院、财政部、中国人民银行栏目可达性' },
  { key: 'crawl', label: '抓取近期政策', detail: '按栏目列表抓取并提取正文全文' },
  { key: 'extract', label: '结构化抽取', detail: '识别文种、工具、对象、传导渠道与关键数字' },
  { key: 'rank', label: '重要性评分', detail: '七个维度加权，输出 S／A／B／C 分级' },
  { key: 'digest', label: '生成政策摘要', detail: '逐项提取主旨、依据、关键表述与未载明事项' },
  { key: 'mechanism', label: '传导机制分析', detail: '工具、中间变量、主体行为、宏观结果' },
  { key: 'relation', label: '政策关系识别', detail: '配套协同、时序承接、工具互补、目标张力' },
  { key: 'impact', label: '省级影响测算', detail: '渠道权重与省份经济结构匹配' },
];

const WINDOWS = [
  { days: 30, label: '近 1 个月' },
  { days: 90, label: '近 3 个月' },
  { days: 180, label: '近 6 个月' },
];

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

const formatDate = (iso: string) => (iso && iso.length >= 10 ? `${Number(iso.slice(5, 7))}月${Number(iso.slice(8, 10))}日` : '日期缺失');

interface LogLine {
  key: string;
  text: string;
  tone: 'info' | 'ok' | 'warn';
}

interface BriefingProps {
  policies: Policy[];
  sources: SourceStatus[];
  corpusAt: string;
  startSignal: number;
  onScan: (windowDays: number) => Promise<ScanOutcome>;
  onOpenPolicy: (id: string) => void;
  onGoImpact: () => void;
  onGoLibrary: () => void;
}

export function Briefing({
  policies,
  sources,
  corpusAt,
  startSignal,
  onScan,
  onOpenPolicy,
  onGoImpact,
  onGoLibrary,
}: BriefingProps) {
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [windowDays, setWindowDays] = useState(90);
  const [stageIndex, setStageIndex] = useState(-1);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [board, setBoard] = useState<PriorityBoard | null>(null);
  const [relations, setRelations] = useState<RelationResult | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [mechanisms, setMechanisms] = useState<Record<string, MechanismChain[]>>({});
  const [digests, setDigests] = useState<PolicyDigest[]>([]);
  const [scopedCount, setScopedCount] = useState(0);
  const [autoCount, setAutoCount] = useState(0);
  const [withBody, setWithBody] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 关系图默认不做灰度压制，只有用户主动点节点时才高亮一组关系。
  const [graphPicked, setGraphPicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [digestCopied, setDigestCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finishedAt, setFinishedAt] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const runRef = useRef(0);
  const lastSignal = useRef(0);

  const push = useCallback((key: string, text: string, tone: LogLine['tone'] = 'info') => {
    setLogs((current) => [...current, { key: `${key}-${current.length}`, text, tone }]);
  }, []);

  const run = useCallback(
    async (days: number) => {
      const runId = ++runRef.current;
      setPhase('running');
      setStageIndex(0);
      setLogs([]);
      setBoard(null);
      setRelations(null);
      setImpact(null);
      setMechanisms({});
      setDigests([]);
      setError(null);
      setElapsed(0);
      const t0 = performance.now();

      push('init', `启动政策扫描：时间窗为近 ${days} 天，范围为中央层面政策文件`, 'info');
      await delay(260);
      if (runRef.current !== runId) return;

      push('connect', '正在连接国务院、财政部、中国人民银行的政策发布栏目');
      await delay(180);
      if (runRef.current !== runId) return;

      const outcome = await onScan(days);
      if (runRef.current !== runId) return;
      if (!outcome.ok) {
        push('connect', `来源连接失败：${outcome.message ?? '未知错误'}，请确认后端已启动`, 'warn');
        setPhase('error');
        setError(outcome.message ?? '采集失败');
        setStageIndex(-1);
        return;
      }

      const okSources = outcome.sources.filter((source) => source.ok);
      push(
        'connect',
        `${okSources.length}/${outcome.sources.length} 个来源可达：${okSources.map((source) => source.name).join('、') || '无'}`,
        okSources.length > 0 ? 'ok' : 'warn',
      );
      setStageIndex(1);
      await delay(340);
      if (runRef.current !== runId) return;

      const list = outcome.policies;
      const since = Date.now() - days * DAY;
      const inWindow = list.filter((policy) => {
        const time = Date.parse(policy.date);
        return !Number.isNaN(time) && time >= since && (policy.docType ?? '政策文件') === '政策文件';
      });
      const bodyReady = list.filter((policy) => (policy.bodyLength ?? 0) > 200).length;
      push(
        'crawl',
        `本轮新增入库 ${outcome.added} 条；语料库现有 ${list.length} 项，其中近 ${days} 天政策文件 ${inWindow.length} 项`,
        'ok',
      );
      setStageIndex(2);
      await delay(320);
      if (runRef.current !== runId) return;

      push('extract', `取得完整正文（200 字以上）的条目 ${bodyReady} 条，文种判别完成；未取得正文的条目不参与排序`, 'ok');
      setStageIndex(3);
      await delay(340);
      if (runRef.current !== runId) return;

      const nextBoard = rankPolicies(list, { windowDays: days, limit: 8 });
      const top = nextBoard.ranked[0];
      push(
        'rank',
        nextBoard.ranked.length > 0
          ? `完成 ${nextBoard.scanned} 项政策评分，最高分 ${top.assessment.score}（${top.assessment.grade} 级）：${top.policy.shortTitle || top.policy.title}`
          : '时间窗内没有可评分的政策文件，已改用全部语料',
        nextBoard.ranked.length > 0 ? 'ok' : 'warn',
      );
      setStageIndex(4);
      await delay(320);
      if (runRef.current !== runId) return;

      // 摘要只对通过筛选、进入榜单的政策生成，避免给全量语料写没人看的摘要。
      const nextDigests = nextBoard.ranked.map((item) => buildDigest(item.policy));
      const fullCount = nextDigests.filter((item) => item.coverage >= 75).length;
      const gapTally = nextDigests.reduce<Record<string, number>>((acc, item) => {
        item.gaps.forEach((gap) => {
          acc[gap] = (acc[gap] ?? 0) + 1;
        });
        return acc;
      }, {});
      const worstGap = Object.entries(gapTally).sort((a, b) => b[1] - a[1])[0];
      push(
        'digest',
        `为 ${nextDigests.length} 项入选政策生成摘要，其中 ${fullCount} 项字段完整度达到 75%${
          worstGap ? `；常见缺项为${worstGap[0]}（${worstGap[1]} 项）` : ''
        }`,
        'ok',
      );
      setStageIndex(5);
      await delay(300);
      if (runRef.current !== runId) return;

      const map: Record<string, MechanismChain[]> = {};
      let chainCount = 0;
      for (const item of nextBoard.ranked) {
        const chains = buildMechanism(item.policy);
        map[item.policy.id] = chains;
        chainCount += chains.length;
      }
      push(
        'mechanism',
        `为前 ${nextBoard.ranked.length} 项政策生成 ${chainCount} 条传导链，每条含方向、强度、时滞、观察指标与失效条件`,
        'ok',
      );
      setStageIndex(6);
      await delay(320);
      if (runRef.current !== runId) return;

      const nextRelations = buildRelations(nextBoard.ranked);
      const kindCount = nextRelations.edges.reduce<Record<string, number>>((acc, edge) => {
        acc[edge.kind] = (acc[edge.kind] ?? 0) + 1;
        return acc;
      }, {});
      push(
        'relation',
        `识别 ${nextRelations.edges.length} 组关系（${Object.entries(kindCount)
          .map(([kind, count]) => `${RELATION_META[kind as keyof typeof RELATION_META].label} ${count}`)
          .join('、') || '无显著关系'}），组合方向：${nextRelations.combination.direction}`,
        'ok',
      );
      setStageIndex(7);
      await delay(320);
      if (runRef.current !== runId) return;

      const nextImpact = evaluateImpact(inWindow.length > 0 ? inWindow : list);
      const topProvince = nextImpact.provinces[0];
      push(
        'impact',
        `完成 ${nextImpact.provinces.length} 个省级单位的影响强度测算，最高为${topProvince?.name ?? '—'}（${topProvince?.exposure ?? 0}）`,
        'ok',
      );

      setBoard(nextBoard);
      setMechanisms(map);
      setDigests(nextDigests);
      setRelations(nextRelations);
      setImpact(nextImpact);
      setScopedCount(inWindow.length);
      setAutoCount(list.filter((policy) => policy.origin === 'auto').length);
      setWithBody(bodyReady);
      setSelectedId(nextBoard.ranked[0]?.policy.id ?? null);
      setElapsed(Math.round(performance.now() - t0));
      setFinishedAt(new Date().toISOString());
      setStageIndex(STAGES.length);
      setPhase('done');
    },
    [onScan, push],
  );

  useEffect(() => {
    // 支持 `?run=1` 深链接直接开跑（便于演示与截图），正常入口仍由按钮触发。
    const autoRun = new URLSearchParams(window.location.search).get('run') === '1';
    if ((startSignal > 0 && lastSignal.current !== startSignal) || (autoRun && lastSignal.current === 0)) {
      lastSignal.current = startSignal > 0 ? startSignal : -1;
      void run(windowDays);
    }
    // 只在外部触发信号变化时启动一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSignal]);

  useEffect(() => {
    if (phase !== 'done') return;
    const focus = new URLSearchParams(window.location.search).get('focus');
    const timer = window.setTimeout(() => {
      const target = focus ? document.getElementById(`bp-${focus}`) : summaryRef.current;
      target?.scrollIntoView({ behavior: focus ? 'auto' : 'smooth', block: 'start' });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const selected = useMemo(() => {
    if (!board || !selectedId) return null;
    return board.ranked.find((item) => item.policy.id === selectedId) ?? board.ranked[0] ?? null;
  }, [board, selectedId]);

  const chains = selectedId ? mechanisms[selectedId] ?? [] : [];

  // 主链矩阵：把每条政策的第一条链拉平成一行，用来横向比较"谁走哪条路、谁快谁慢"。
  const mechanismRows = useMemo(() => {
    if (!board) return [];
    return buildMechanismBoard(
      board.ranked.map((item) => ({
        policy: item.policy,
        grade: item.assessment.grade,
        score: item.assessment.score,
      })),
      mechanisms,
    );
  }, [board, mechanisms]);

  const digestById = useMemo(() => new Map(digests.map((item) => [item.id, item])), [digests]);

  const avgCoverage = digests.length
    ? Math.round(digests.reduce((sum, item) => sum + item.coverage, 0) / digests.length)
    : 0;

  const topGap = useMemo(() => {
    const tally: Record<string, number> = {};
    digests.forEach((item) => {
      item.gaps.forEach((gap) => {
        tally[gap] = (tally[gap] ?? 0) + 1;
      });
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? `${sorted[0][0]}（${sorted[0][1]} 项）` : null;
  }, [digests]);

  const copyAllDigests = async () => {
    const text = digests.map((item) => item.plain).join('\n\n---\n\n');
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setDigestCopied(true);
      window.setTimeout(() => setDigestCopied(false), 1800);
    } catch {
      // 剪贴板被浏览器拦时退回下载，功能不丢。
      downloadText(`经纬纵横_政策摘要_${(finishedAt ?? '').slice(0, 10)}.md`, text);
    }
  };
  const activeRelations = useMemo(() => {
    if (!relations || !selectedId) return [];
    return relations.edges
      .filter((edge) => edge.from === selectedId || edge.to === selectedId)
      .slice(0, 4)
      .map((edge) => {
        const otherId = edge.from === selectedId ? edge.to : edge.from;
        const other = relations.nodes.find((node) => node.id === otherId);
        return { edge, other };
      });
  }, [relations, selectedId]);

  const exportBriefing = () => {
    if (!board || !relations || !impact) return;
    const content = buildBriefingReport({
      windowDays,
      board,
      relations,
      impact,
      mechanisms,
      digests,
      synergy: buildSynergy(policies),
      generatedAt: finishedAt ?? new Date().toISOString(),
    });
    downloadText(`经纬纵横_政策扫描简报_${(finishedAt ?? '').slice(0, 10)}.md`, content);
  };

  const topProvinces = impact ? impact.provinces.slice(0, 6) : [];
  const bottomProvinces = impact ? impact.provinces.slice(-4).reverse() : [];

  return (
    <div className="briefing-page">
      <section className={`bp-launch ${phase === 'running' ? 'is-running' : ''}`}>
        <div className="bp-launch-copy">
          <span className="bp-eyebrow">
            <Sparkles size={13} /> 政策扫描
          </span>
          <h1>
            汇集近期中央政策文件，
            <em>按重要性排序</em>
            ，说明<span className="no-break">传导机制</span>。
          </h1>
          <p>
            系统按栏目列表检索国务院、财政部、中国人民银行等官方栏目发布、近
            {windowDays} 天内的政策文件，提取政策工具与传导渠道，形成重要性排序、传导链条、政策关系与省级影响。
          </p>
          <div className="bp-launch-actions">
            <button
              className="bp-start"
              onClick={() => void run(windowDays)}
              disabled={phase === 'running'}
            >
              {phase === 'running' ? <Loader2 size={18} className="is-spinning" /> : <Radar size={18} />}
              {phase === 'running' ? '正在扫描' : board ? '重新扫描' : '开始扫描'}
            </button>
            <div className="bp-window-switch" role="group" aria-label="时间窗">
              {WINDOWS.map((item) => (
                <button
                  key={item.days}
                  className={windowDays === item.days ? 'is-active' : ''}
                  onClick={() => setWindowDays(item.days)}
                  disabled={phase === 'running'}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="bp-launch-hint">
            检索范围限于官方公开页面。另有 {policies.filter((item) => (item.origin ?? 'seed') === 'seed').length} 项校订语料作为补充，采集服务未连接时仍可查看。
          </p>
        </div>

        <div className="bp-launch-side">
          {phase === 'idle' ? (
            <div className="bp-meta-card is-radar">
              <SourceRadar
                sources={sources}
                total={policies.length}
                updatedAt={corpusAt}
                windowDays={windowDays}
              />
            </div>
          ) : (
          <div className="bp-meta-card">
            <span className="bp-meta-title">扫描结果</span>
            {phase === 'running' && (
              <p className="bp-meta-empty">
                正在执行第 {Math.min(stageIndex + 1, STAGES.length)} / {STAGES.length} 步：{STAGES[Math.min(stageIndex, STAGES.length - 1)]?.label}
              </p>
            )}
            {phase === 'done' && (
              <dl className="bp-meta-list">
                <div>
                  <dt>时间窗</dt>
                  <dd>近 {windowDays} 天</dd>
                </div>
                <div>
                  <dt>政策文件</dt>
                  <dd>{scopedCount} 项</dd>
                </div>
                <div>
                  <dt>参与排序</dt>
                  <dd>{board?.scanned ?? 0} 项</dd>
                </div>
                <div>
                  <dt>正文完整</dt>
                  <dd>{withBody} 条</dd>
                </div>
                <div>
                  <dt>自动入库</dt>
                  <dd>{autoCount} 条</dd>
                </div>
                <div>
                  <dt>耗时</dt>
                  <dd>{elapsed > 0 ? `${(elapsed / 1000).toFixed(1)} 秒` : '—'}</dd>
                </div>
              </dl>
            )}
            {phase === 'error' && (
              <p className="bp-meta-empty is-error">
                <AlertTriangle size={13} /> {error}
              </p>
            )}
          </div>
          )}
        </div>
      </section>

      {(phase === 'running' || phase === 'error' || (phase === 'done' && logs.length > 0)) && (
        <section className="bp-pipeline">
          <ol className="bp-stages">
            {STAGES.map((stage, index) => {
              const status =
                stageIndex > index || stageIndex === STAGES.length
                  ? 'done'
                  : stageIndex === index
                    ? phase === 'error'
                      ? 'fail'
                      : 'active'
                    : 'pending';
              return (
                <li key={stage.key} className={`bp-stage is-${status}`}>
                  <span className="bp-stage-mark">
                    {status === 'done' ? <CheckCircle2 size={15} /> : status === 'active' ? <Loader2 size={15} className="is-spinning" /> : index + 1}
                  </span>
                  <div>
                    <strong>{stage.label}</strong>
                    <small>{stage.detail}</small>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="bp-log">
            {logs.map((line) => (
              <p key={line.key} className={`is-${line.tone}`}>
                <span>›</span>
                {line.text}
              </p>
            ))}
            {phase === 'done' && (
              <p className="is-ok">
                <span>✓</span>
                扫描完成：排序、摘要、机制、关系、影响五项结果已生成，用时 {(elapsed / 1000).toFixed(1)} 秒。
              </p>
            )}
          </div>
        </section>
      )}

      {phase === 'idle' && (
        <section className="bp-preview">
          <h2>扫描内容</h2>
          <div className="bp-preview-grid">
            <article>
              <FileText size={18} />
              <h3>按栏目检索</h3>
              <p>按官方栏目列表逐条抓取近 {windowDays} 天政策全文，不依赖搜索接口，避免关键词漏检。</p>
            </article>
            <article>
              <Gauge size={18} />
              <h3>多维度评分</h3>
              <p>按发文层级、时效性、力度、覆盖广度、约束强度、政策信号、新增信息七个维度加权评分。</p>
            </article>
            <article>
              <Network size={18} />
              <h3>传导机制</h3>
              <p>对重点政策输出「工具、中间变量、主体行为、宏观结果」传导链，标注方向、强度、时滞与失效条件。</p>
            </article>
            <article>
              <Timer size={18} />
              <h3>政策关系</h3>
              <p>识别配套协同、时序承接、工具互补、目标张力四类关系，并给出政策组合的总体方向。</p>
            </article>
          </div>
        </section>
      )}

      {phase === 'error' && (
        <section className="bp-preview">
          <h2>采集服务未连接</h2>
          <p className="bp-error-help">
            政策扫描依赖本地采集服务。请在项目目录执行 <code>npm run start</code> 后重试，或先行浏览已入库的政策库。
          </p>
          <div className="bp-inline-actions">
            <button onClick={() => void run(windowDays)}>
              <RefreshCw size={15} /> 重试
            </button>
            <button onClick={onGoLibrary}>打开政策库</button>
          </div>
        </section>
      )}

      {phase === 'done' && board && relations && impact && (
        <>
          <div ref={summaryRef} />
          <section className="bp-summary">
            <div className="bp-kpi">
              <span className="bp-kpi-label">本期政策文件</span>
              <strong>{scopedCount}</strong>
              <small>近 {windowDays} 天中央层面</small>
            </div>
            <div className="bp-kpi">
              <span className="bp-kpi-label">最高评分</span>
              <strong>
                {board.ranked[0]?.assessment.score ?? 0}
                <em>{board.ranked[0]?.assessment.grade ?? '—'} 级</em>
              </strong>
              <small>{board.ranked[0]?.policy.shortTitle || board.ranked[0]?.policy.title || '—'}</small>
            </div>
            <div className="bp-kpi">
              <span className="bp-kpi-label">政策组合方向</span>
              <strong className="is-text">{relations.combination.direction}</strong>
              <small>
                扩张 {relations.combination.expansive} · 收紧 {relations.combination.restrictive} · 中性{' '}
                {relations.combination.neutral}
              </small>
            </div>
            <div className="bp-kpi">
              <span className="bp-kpi-label">识别的政策关系</span>
              <strong>{relations.edges.length}</strong>
              <small>配套、承接、互补、张力</small>
            </div>
            <div className="bp-kpi">
              <span className="bp-kpi-label">影响最强省份</span>
              <strong className="is-text">{impact.provinces[0]?.short ?? '—'}</strong>
              <small>影响强度 {impact.provinces[0]?.exposure ?? 0}</small>
            </div>
          </section>

          <section className="bp-section">
            <header className="bp-section-head">
              <div>
                <span className="bp-kicker">一、政策排序</span>
                <h2>政策重要性排序</h2>
                <p>按七个维度加权评分，分为 S、A、B、C 四级。评分用于确定阅读顺序，不反映政策效果大小。</p>
              </div>
              <button className="bp-ghost" onClick={exportBriefing}>
                <Download size={15} /> 导出本期简报
              </button>
            </header>

            <div className="bp-rank-list">
              {board.ranked.map((item, index) => {
                const isActive = selected?.policy.id === item.policy.id;
                return (
                  <button
                    key={item.policy.id}
                    className={`bp-rank-row ${isActive ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedId(item.policy.id);
                      setGraphPicked(false);
                    }}
                  >
                    <span className="bp-rank-no">{String(index + 1).padStart(2, '0')}</span>
                    <span className={`bp-grade is-${item.assessment.grade}`}>{item.assessment.grade}</span>
                    <div className="bp-rank-main">
                      <strong>{item.policy.title}</strong>
                      <span className="bp-rank-meta">
                        {item.policy.issuer} · {formatDate(item.policy.date)} · {item.policy.docType ?? '政策文件'} · 时滞{' '}
                        {item.assessment.horizon}
                      </span>
                      <p className="bp-rank-abs">
                        {digestById.get(item.policy.id)?.headline ?? item.policy.summary}
                      </p>
                      <em className="bp-rank-reason">评分依据：{item.assessment.reasons[0]}</em>
                    </div>
                    <div className="bp-rank-score">
                      <span className="bp-score-bar">
                        <i style={{ width: `${item.assessment.score}%` }} />
                      </span>
                      <b>{item.assessment.score}</b>
                    </div>
                  </button>
                );
              })}
              {board.ranked.length === 0 && <p className="bp-empty">时间窗内没有可评分的政策文件，请放宽时间窗。</p>}
            </div>
            <ul className="bp-notes">
              {board.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>

          <section className="bp-section" id="bp-digest">
            <header className="bp-section-head">
              <div>
                <span className="bp-kicker">二、主要内容</span>
                <h2>政策摘要</h2>
                <p>
                  对入选的 {digests.length} 项政策，逐项提取主旨、依据、落实安排与关键表述。各句均标注来源字段；
                  原文未载明的部分标注为"原文未载明"，不作补充。
                </p>
              </div>
              <button className="bp-ghost" onClick={() => void copyAllDigests()}>
                <ClipboardCopy size={15} /> {digestCopied ? '已复制' : '复制全部摘要'}
              </button>
            </header>

            <div className="dg-strip">
              <div>
                <span>字段完整度均值</span>
                <strong>{avgCoverage}%</strong>
              </div>
              <div>
                <span>完整度 75% 以上</span>
                <strong>
                  {digests.filter((item) => item.coverage >= 75).length}
                  <em>/ {digests.length}</em>
                </strong>
              </div>
              <div>
                <span>平均关键表述</span>
                <strong>
                  {(digests.reduce((sum, item) => sum + item.points.length, 0) / Math.max(1, digests.length)).toFixed(1)}
                  <em>条</em>
                </strong>
              </div>
              <div>
                <span>常见缺项</span>
                <strong className="is-text">{topGap ?? '无'}</strong>
              </div>
            </div>

            <div className="dg-grid">
              {digests.map((digest, index) => {
                const item = board.ranked[index];
                if (!item) return null;
                return (
                  <PolicyDigestCard
                    key={digest.id}
                    digest={digest}
                    policy={item.policy}
                    grade={item.assessment.grade}
                    rank={index + 1}
                    defaultOpen={index === 0}
                    onOpen={onOpenPolicy}
                  />
                );
              })}
            </div>
            {digests.length === 0 && <p className="bp-empty">本期没有进入榜单的政策，暂无摘要可生成。</p>}
          </section>

          {selected && (
            <section className="bp-section">
              <header className="bp-section-head">
                <div>
                  <span className="bp-kicker">三、作用机制</span>
                  <h2>作用机制与影响路径</h2>
                  <p>
                    先比较 {mechanismRows.length} 项政策的主要传导链，再展开单项政策的完整链条、时间路径与观察指标。
                  </p>
                </div>
                <button className="bp-ghost" onClick={() => onOpenPolicy(selected.policy.id)}>
                  查看原文与证据 <ArrowRight size={14} />
                </button>
              </header>

              <div className="bp-mech-board">
                <div className="bp-mech-board-head">
                  <span>政策</span>
                  <span>主渠道</span>
                  <span>方向</span>
                  <span>中间变量</span>
                  <span>宏观结果</span>
                  <span>时滞</span>
                </div>
                {mechanismRows.map((row) => (
                  <button
                    key={row.policyId}
                    className={`bp-mech-board-row ${selectedId === row.policyId ? 'is-active' : ''}`}
                    onClick={() => {
                      setSelectedId(row.policyId);
                      setGraphPicked(false);
                    }}
                  >
                    <span className="bp-mech-board-policy">
                      <b className={`bp-grade is-${row.grade}`}>{row.grade}</b>
                      <i>{row.shortTitle}</i>
                    </span>
                    <span>{row.channelName}</span>
                    <span className={`bp-dir is-${row.polarity}`}>
                      {row.polarity === 1 ? '扩张' : row.polarity === -1 ? '收紧' : '待定'}
                    </span>
                    <span>{row.variable}</span>
                    <span>{row.outcome}</span>
                    <span className="bp-mech-board-lat">{row.latency}</span>
                  </button>
                ))}
                {mechanismRows.length === 0 && <p className="bp-empty">本期政策未识别到明确的传导渠道。</p>}
                <p className="bp-mech-board-note">
                  每行选取该项政策强度最高的一条传导链，点击可切换下方详情。渠道依据正文关键词密度判定。
                </p>
              </div>

              <div className="bp-score-detail">
                <div className="bp-dims">
                  {selected.assessment.dimensions.map((dimension) => (
                    <div key={dimension.id} className="bp-dim">
                      <span className="bp-dim-label">
                        {dimension.label}
                        <em>{Math.round(dimension.weight * 100)}%</em>
                      </span>
                      <span className="bp-dim-bar">
                        <i style={{ width: `${dimension.score}%` }} />
                      </span>
                      <span className="bp-dim-score">{Math.round(dimension.score)}</span>
                      <small>{dimension.detail}</small>
                    </div>
                  ))}
                </div>
                <aside className="bp-verdict">
                  <span className="bp-verdict-grade">{selected.assessment.grade}</span>
                  <strong>{selected.assessment.score} 分</strong>
                  <p>{combineDirection(chains)}</p>
                  <ul>
                    {selected.assessment.weaknesses.length > 0 ? (
                      selected.assessment.weaknesses.map((item) => <li key={item}>⚠ {item}</li>)
                    ) : (
                      <li>各维度评分均衡，适用条件以原文为准</li>
                    )}
                  </ul>
                </aside>
              </div>

              {chains.map((chain) => (
                <div key={chain.id} className="bp-chain-card">
                  <div className="bp-chain-head">
                    <span className="bp-chain-channel">{chain.channelName}</span>
                    <span className={`bp-dir is-${chain.polarity}`}>{chain.directionLabel}</span>
                    <span className="bp-latency">
                      <Timer size={12} /> 时滞 {chain.latency}
                    </span>
                  </div>
                  <div className="bp-chain">
                    {chain.links.map((link, index) => (
                      <div key={`${chain.id}-${link.layer}`} className="bp-chain-step">
                        <div className={`bp-link is-${link.direction}`}>
                          <span className="bp-link-layer">{link.layerLabel}</span>
                          <strong>{link.label}</strong>
                          <small>{link.detail}</small>
                          <span className="bp-link-strength" aria-label={`强度 ${link.strength}`}>
                            {[1, 2, 3].map((level) => (
                              <i key={level} className={level <= link.strength ? 'is-on' : ''} />
                            ))}
                          </span>
                        </div>
                        {index < chain.links.length - 1 && <span className="bp-chain-arrow">→</span>}
                      </div>
                    ))}
                  </div>
                  <p className="bp-chain-summary">{chain.summary}</p>
                  {chain.evidence && <blockquote className="bp-evidence">原文依据：{chain.evidence}</blockquote>}

                  <div className="bp-chain-extra">
                    <div className="bp-chain-block">
                      <h4>时间路径</h4>
                      <ol className="bp-timepath">
                        {chain.path.map((step) => (
                          <li key={step.at}>
                            <span>{step.at}</span>
                            <p>{step.what}</p>
                          </li>
                        ))}
                      </ol>
                    </div>
                    <div className="bp-chain-block">
                      <h4>观察指标</h4>
                      <ul className="bp-watch">
                        {chain.watch.map((item) => (
                          <li key={item.label}>
                            <strong>{item.label}</strong>
                            <span>{item.what}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="bp-chain-counter">
                    <p>
                      <span>反向情景</span>
                      {chain.counter}
                    </p>
                    <p>
                      <span>失效判定</span>
                      {chain.falsify}
                    </p>
                  </div>

                  <ul className="bp-risks">
                    {chain.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {chains.length === 0 && <p className="bp-empty">该项政策未识别到明确传导渠道，只能作为背景信息。</p>}
            </section>
          )}

          <section className="bp-section" id="bp-rel">
            <header className="bp-section-head">
              <div>
                <span className="bp-kicker">四、政策关系</span>
                <h2>政策相互关系</h2>
                <p>
                  对 {relations.coverage.nodes} 项政策两两比对 {relations.coverage.pairs} 组，按发文机关、传导渠道、时间距离与方向异同四类线索判定，
                  保留强度最高的 {relations.coverage.kept} 组。点击节点或明细行可高亮对应关系。
                </p>
              </div>
            </header>

            <div className="bp-rel-stats">
              {relations.stats.map((stat) => (
                <div key={stat.kind} className={stat.count === 0 ? 'is-empty' : ''}>
                  <span className="bp-rel-stat-bar">
                    <i style={{ width: `${Math.max(4, stat.share * 100)}%`, background: stat.color }} />
                  </span>
                  <strong>{stat.label}</strong>
                  <b>{stat.count}</b>
                  <small>{stat.desc}</small>
                </div>
              ))}
            </div>
            {relations.coverage.dropped > 0 && (
              <p className="bp-rel-stats-note">
                另有 {relations.coverage.dropped} 组关系强度较低，未在图示中呈现，明细表按强度排序。
              </p>
            )}

            <div className="bp-relation-layout">
              <RelationGraph
                data={relations}
                activeId={graphPicked ? selectedId : null}
                onSelect={(id) => {
                  setSelectedId(id);
                  setGraphPicked(true);
                }}
              />
              <aside className="bp-relation-side">
                <div className="bp-clusters">
                  <h3>本期政策组合的主要方向</h3>
                  {relations.clusters.map((cluster) => (
                    <div key={cluster.id} className="bp-cluster">
                      <span className={`bp-cluster-dir is-${cluster.direction === '收紧' ? 'down' : cluster.direction === '混合' ? 'mix' : 'up'}`}>
                        {cluster.direction}
                      </span>
                      <strong>{cluster.label}</strong>
                      <small>{cluster.policyIds.length} 项政策</small>
                      <div className="bp-cluster-members">
                        {cluster.members.map((member) => (
                          <button
                            key={member.id}
                            className={selectedId === member.id ? 'is-active' : ''}
                            onClick={() => {
                              setSelectedId(member.id);
                              setGraphPicked(true);
                            }}
                            title={member.short}
                          >
                            {member.grade} · {member.short}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {activeRelations.length > 0 && (
                  <div className="bp-active-relations">
                    <h3>当前选中政策的关系</h3>
                    {activeRelations.map(({ edge, other }) => (
                      <div key={edge.id} className="bp-active-relation">
                        <span className="bp-edge-kind" style={{ color: RELATION_META[edge.kind].color }}>
                          {RELATION_META[edge.kind].label}
                        </span>
                        <strong>{other?.label ?? '—'}</strong>
                        <small>{edge.note}</small>
                      </div>
                    ))}
                  </div>
                )}
              </aside>
            </div>

            <div className="bp-rel-ledger">
              <h3>关系判定明细</h3>
              <table>
                <thead>
                  <tr>
                    <th>类型</th>
                    <th>政策 A</th>
                    <th>政策 B</th>
                    <th>强度</th>
                    <th>判定依据</th>
                  </tr>
                </thead>
                <tbody>
                  {relations.edges.map((edge) => {
                    const from = relations.nodes.find((node) => node.id === edge.from);
                    const to = relations.nodes.find((node) => node.id === edge.to);
                    return (
                      <tr
                        key={edge.id}
                        className={selectedId === edge.from || selectedId === edge.to ? 'is-active' : ''}
                        onClick={() => {
                          setSelectedId(edge.from);
                          setGraphPicked(true);
                        }}
                      >
                        <td>
                          <span className="bp-edge-kind" style={{ color: RELATION_META[edge.kind].color }}>
                            {RELATION_META[edge.kind].label}
                          </span>
                        </td>
                        <td>{from?.label ?? '—'}</td>
                        <td>{to?.label ?? '—'}</td>
                        <td className="bp-ledger-strength">
                          <span>
                            <i style={{ width: `${Math.round(edge.strength * 100)}%` }} />
                          </span>
                          {edge.strength.toFixed(2)}
                        </td>
                        <td>{edge.note}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {relations.edges.length === 0 && <p className="bp-empty">本期未识别出可判定的政策关系。</p>}
            </div>

            <div className="bp-narrative">
              {relations.narrative.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <ul className="bp-notes">
              {relations.caveats.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="bp-section">
            <header className="bp-section-head">
              <div>
                <span className="bp-kicker">五、省级影响</span>
                <h2>省级影响测算</h2>
                <p>{impact.caveats[0] ?? '按政策渠道权重与各省经济结构测算。'}</p>
              </div>
              <button className="bp-ghost" onClick={onGoImpact}>
                打开完整地图 <ArrowRight size={14} />
              </button>
            </header>
            <div className="bp-province-grid">
              <div>
                <h3>影响强度较高的省份</h3>
                {topProvinces.map((province) => (
                  <div key={province.code} className="bp-province-row">
                    <span className="bp-province-name">{province.short}</span>
                    <span className="bp-province-bar">
                      <i style={{ width: `${Math.min(100, province.exposure)}%` }} />
                    </span>
                    <b>{province.exposure}</b>
                    <small>{province.drivers.slice(0, 2).join(' · ')}</small>
                  </div>
                ))}
              </div>
              <div>
                <h3>影响强度较低的省份</h3>
                {bottomProvinces.map((province) => (
                  <div key={province.code} className="bp-province-row is-low">
                    <span className="bp-province-name">{province.short}</span>
                    <span className="bp-province-bar">
                      <i style={{ width: `${Math.min(100, province.exposure)}%` }} />
                    </span>
                    <b>{province.exposure}</b>
                    <small>{province.drivers.slice(0, 2).join(' · ') || '结构敏感度较低'}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="bp-footnote">
            <p>
              本期结果基于 {sources.filter((source) => source.ok).length} 个官方来源、{scopedCount} 项政策文件生成。
              评分权重、渠道敏感度与关系强度为平台设定的分析口径，非计量估计结果；引用时请核对原文与官方统计数据。
            </p>
            <div className="bp-inline-actions">
              <button onClick={exportBriefing}>
                <Download size={15} /> 导出简报
              </button>
              <button onClick={() => void run(windowDays)}>
                <RefreshCw size={15} /> 重新扫描
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

