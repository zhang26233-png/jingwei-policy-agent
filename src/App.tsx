import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Download,
  FileSearch,
  GitCompareArrows,
  Library,
  Map,
  Menu,
  Radar,
  ShieldCheck,
  X,
} from 'lucide-react';
import './App.css';
import { policies, CORPUS_META, applyAutoPolicies, corpusStats } from './data/policies';
import { analyzeQuery } from './lib/agent';
import { fetchCorpus, runCollect, type ScanOutcome, type SourceStatus } from './lib/api';
import { buildCompareReport, buildReport, downloadText } from './lib/report';
import type { AnalysisResult, Policy, ReaderMode, ViewName } from './types';
import { EvidenceDrawer } from './components/EvidenceDrawer';
import { Briefing } from './views/Briefing';
import { Workspace } from './views/Workspace';
import { PolicyLibrary } from './views/PolicyLibrary';
import { ImpactView } from './views/ImpactView';
import { CompareView } from './views/CompareView';
import { MethodView } from './views/MethodView';

const NAV_ITEMS: { id: ViewName; label: string; icon: typeof FileSearch }[] = [
  { id: 'briefing', label: '一键研判', icon: Radar },
  { id: 'library', label: '政策库', icon: Library },
  { id: 'impact', label: '省级影响', icon: Map },
  { id: 'compare', label: '政策对比', icon: GitCompareArrows },
  { id: 'workspace', label: '自由追问', icon: FileSearch },
  { id: 'method', label: '方法与边界', icon: ShieldCheck },
];

interface CorpusState {
  loading: boolean;
  collecting: boolean;
  online: boolean;
  error: string | null;
  updatedAt: string | null;
  total: number;
  auto: number;
  sources: SourceStatus[];
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });

const formatTime = (iso: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

function App() {
  const [view, setView] = useState<ViewName>('briefing');
  const [scanSignal, setScanSignal] = useState(0);
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [mode, setMode] = useState<ReaderMode>('research');
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [corpus, setCorpus] = useState<CorpusState>({
    loading: true,
    collecting: false,
    online: false,
    error: null,
    updatedAt: null,
    total: CORPUS_META.policyCount,
    auto: 0,
    sources: [],
  });
  const [corpusPolicies, setCorpusPolicies] = useState<Policy[]>(() => [...policies]);
  const runRef = useRef(0);
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const syncCorpus = async (collect = false) => {
    if (collect) setCorpus((current) => ({ ...current, collecting: true, error: null }));
    try {
      if (collect) await runCollect({ limit: 80, windowDays: 150 });
      const data = await fetchCorpus();
      applyAutoPolicies(data.policies);
      const stats = corpusStats();
      setCorpus({
        loading: false,
        collecting: false,
        online: true,
        error: null,
        updatedAt: data.summary.updatedAt,
        total: stats.total,
        auto: stats.auto,
        sources: data.summary.sources,
      });
      setCorpusPolicies([...policies]);
      return { ok: true as const, ...stats };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setCorpus((current) => ({
        ...current,
        loading: false,
        collecting: false,
        online: false,
        error: message,
      }));
      return { ok: false as const, message };
    }
  };

  const collectNow = async () => {
    const result = await syncCorpus(true);
    if (!result.ok) {
      notify(`采集失败：${result.message}`);
      return;
    }
    notify(`采集完成：语料共 ${result.total} 项，其中自动采集 ${result.auto} 项`);
  };

  // 一键研判：先抓取，再把最新语料交给研判流水线（返回值必须是"当下"的语料，不能用 state）
  const scanNow = async (windowDays: number): Promise<ScanOutcome> => {
    setCorpus((current) => ({ ...current, collecting: true, error: null }));
    try {
      const collected = await runCollect({ limit: 110, windowDays: Math.max(30, windowDays) });
      const data = await fetchCorpus();
      applyAutoPolicies(data.policies);
      const stats = corpusStats();
      setCorpus({
        loading: false,
        collecting: false,
        online: true,
        error: null,
        updatedAt: data.summary.updatedAt,
        total: stats.total,
        auto: stats.auto,
        sources: data.summary.sources,
      });
      setCorpusPolicies([...policies]);
      return {
        ok: true,
        policies: [...policies],
        sources: data.summary.sources,
        updatedAt: data.summary.updatedAt,
        added: collected.run.added,
        fetched: collected.run.fetched,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setCorpus((current) => ({ ...current, loading: false, collecting: false, online: false, error: message }));
      return {
        ok: false,
        message,
        policies: [...policies],
        sources: corpus.sources,
        updatedAt: corpus.updatedAt,
        added: 0,
        fetched: 0,
      };
    }
  };



  const navigate = (nextView: ViewName) => {
    const params = new URLSearchParams(window.location.search);
    if (nextView === 'workspace') {
      params.delete('view');
    } else {
      params.set('view', nextView);
    }
    window.history.replaceState(null, '', `${window.location.pathname}${params.toString() ? `?${params}` : ''}`);
    setView(nextView);
    setMobileNavOpen(false);
    scrollTop();
  };

  const runAnalysis = async (query: string) => {
    const value = query.trim();
    if (!value) return;
    const params = new URLSearchParams(window.location.search);
    params.set('q', value);
    params.delete('view');
    params.delete('ids');
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    const runId = ++runRef.current;
    setView('workspace');
    setSubmittedQuery(value);
    setResult(null);
    setRunning(true);
    setActiveStep(0);
    setSelectedPolicyId(null);
    scrollTop();

    const traceSteps = [
      '解析研究问题与时间范围',
      '检索政策语料并计算相关性',
      '锁定候选政策',
      '抽取政策工具、对象与约束条件',
      '关联利率与财政指标',
      '校验来源等级与引用支持',
      '生成三层结论与影响图谱',
    ];

    for (let index = 0; index < traceSteps.length; index += 1) {
      if (runRef.current !== runId) return;
      setActiveStep(index);
      await delay(index === 2 ? 460 : 300);
    }

    if (runRef.current !== runId) return;
    setResult(analyzeQuery(value));
    setActiveStep(traceSteps.length);
    setRunning(false);
  };

  const initializedRef = useRef(false);
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const boot = async () => {
      // 先加载后端语料，再执行深链接里的分析，避免分析跑在旧语料上。
      await syncCorpus(false);
      const params = new URLSearchParams(window.location.search);
      const requestedView = params.get('view');
      if (
        requestedView === 'briefing' ||
        requestedView === 'library' ||
        requestedView === 'impact' ||
        requestedView === 'compare' ||
        requestedView === 'method'
      ) {
        setView(requestedView);
      }
      // 单条政策详情支持深链接（便于引用与投屏）
      const requestedPolicy = params.get('policy');
      if (requestedPolicy && policies.some((policy) => policy.id === requestedPolicy)) {
        setSelectedPolicyId(requestedPolicy);
      }
      const requestedIds = params
        .get('ids')
        ?.split(',')
        .filter((id) => policies.some((policy) => policy.id === id))
        .slice(0, 3);
      if (requestedIds && requestedIds.length > 0) setCompareIds(requestedIds);
      const requestedMode = params.get('mode');
      if (requestedMode === 'research' || requestedMode === 'decision' || requestedMode === 'public') {
        setMode(requestedMode);
      }
      const initialQuery = params.get('q');
      if (initialQuery) void runAnalysis(initialQuery);
    };
    void boot();
    // The initial deep link should only run once; later searches are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeMode = (nextMode: ReaderMode) => {
    setMode(nextMode);
    const params = new URLSearchParams(window.location.search);
    params.set('mode', nextMode);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  };

  const toggleCompare = (id: string) => {
    setCompareIds((current) => {
      if (current.includes(id)) {
        notify('已从对比中移除');
        return current.filter((item) => item !== id);
      }
      if (current.length >= 3) {
        notify('最多对比3项政策');
        return current;
      }
      notify('已加入对比');
      return [...current, id];
    });
  };

  const exportCurrent = () => {
    if (view === 'compare' && compareIds.length > 0) {
      const selected = corpusPolicies.filter((policy) => compareIds.includes(policy.id));
      downloadText('宏策智研_政策对比.md', buildCompareReport(selected));
      notify('对比表已导出');
      return;
    }
    if (!result) {
      notify('请先运行一次分析');
      return;
    }
    downloadText('宏策智研_政策研究简报.md', buildReport(result));
    notify('研究简报已导出');
  };

  const selectedPolicy = corpusPolicies.find((policy) => policy.id === selectedPolicyId) ?? null;
  const selectedPolicies = corpusPolicies.filter((policy) => compareIds.includes(policy.id));

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => navigate('briefing')} aria-label="返回一键研判">
          <span className="brand-mark">策</span>
          <span className="brand-text">
            <strong>宏策智研</strong>
            <small>MACRO POLICY EVIDENCE</small>
          </span>
        </button>

        <nav className={`main-nav ${mobileNavOpen ? 'is-open' : ''}`} aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? 'is-active' : ''}
                onClick={() => navigate(item.id)}
              >
                <Icon size={15} />
                {item.label}
                {item.id === 'compare' && compareIds.length > 0 && (
                  <span className="nav-count">{compareIds.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="header-actions">
          <span className="corpus-indicator">
            <span className={`status-dot ${corpus.online ? '' : 'is-offline'}`} />
            {corpus.total} 项语料 · {corpus.auto} 项自动采集
          </span>
          <button
            className="header-collect"
            onClick={() => {
              navigate('briefing');
              setScanSignal((value) => value + 1);
            }}
            disabled={corpus.collecting}
          >
            <Radar size={15} />
            {corpus.collecting ? '采集中' : '启动扫描'}
          </button>
          <button className="header-export" onClick={exportCurrent}>
            <Download size={15} />
            导出
          </button>
          <button
            className="mobile-menu-button"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-label="打开导航"
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <div className={`source-strip ${corpus.online ? 'is-live' : 'is-offline'}`}>
        <div className="source-strip-main">
          <span className="source-strip-tag">
            {corpus.loading ? 'CONNECTING' : corpus.online ? 'LIVE' : 'OFFLINE'}
          </span>
          <span>
            {corpus.loading && '正在连接采集服务…'}
            {!corpus.loading && corpus.online &&
              `已接入 ${corpus.sources.filter((source) => source.ok).length}/${corpus.sources.length} 个官方来源 · 语料更新于 ${formatTime(corpus.updatedAt)}`}
            {!corpus.loading && !corpus.online &&
              `未连接采集服务（${corpus.error ?? '后端未启动'}），当前仅展示内置校订语料。启动后端后即可自动检索中央政策。`}
          </span>
        </div>
        <div className="source-pills">
          {corpus.sources.map((source) => (
            <span
              key={source.id}
              className={source.ok ? 'is-ok' : 'is-fail'}
              title={`${source.name}｜${source.entry}\n${
                source.ok
                  ? `栏目列表 ${source.listed ?? source.count} 条，窗口内 ${source.inWindow ?? source.count} 条，纳入本次 ${source.count} 条`
                  : source.error ?? '抓取失败'
              }`}
            >
              {source.name.replace(/\s*·\s*/g, '·')} {source.ok ? source.count : '失败'}
            </span>
          ))}
          {corpus.sources.length === 0 && <span className="is-muted">来源状态待连接</span>}
        </div>
      </div>

      {/* 研判结果常驻内存：切换栏目再回来不丢结果 */}
      <div className={view === 'briefing' ? '' : 'is-view-hidden'}>
        <Briefing
          policies={corpusPolicies}
          startSignal={scanSignal}
          onScan={scanNow}
          onOpenPolicy={setSelectedPolicyId}
          onGoImpact={() => navigate('impact')}
          onGoMethod={() => navigate('method')}
          onGoLibrary={() => navigate('library')}
        />
      </div>

      {view === 'workspace' && (
        <Workspace
          submittedQuery={submittedQuery}
          result={result}
          running={running}
          activeStep={activeStep}
          mode={mode}
          compareIds={compareIds}
          onModeChange={changeMode}
          onRun={runAnalysis}
          onOpenPolicy={setSelectedPolicyId}
          onCompare={toggleCompare}
          onExport={exportCurrent}
          onGoLibrary={() => navigate('library')}
          onGoMethod={() => navigate('method')}
        />
      )}
      {view === 'library' && (
        <PolicyLibrary
          policies={corpusPolicies}
          compareIds={compareIds}
          onOpen={setSelectedPolicyId}
          onCompare={toggleCompare}
          onGoCompare={() => navigate('compare')}
          corpus={corpus}
          onCollect={collectNow}
        />
      )}
      {view === 'impact' && (
        <ImpactView
          policies={corpusPolicies}
          onOpenPolicy={setSelectedPolicyId}
          onGoLibrary={() => navigate('library')}
        />
      )}
      {view === 'compare' && (
        <CompareView
          selected={selectedPolicies}
          onOpen={setSelectedPolicyId}
          onRemove={toggleCompare}
          onGoLibrary={() => navigate('library')}
          onExport={exportCurrent}
        />
      )}
      {view === 'method' && <MethodView sources={corpus.sources} />}

      <footer className="site-footer">
        <span>宏策智研 · 中国宏观经济政策证据分析智能体</span>
        <span>校赛 MVP · 2026.10 · 研究辅助，不构成决策建议</span>
      </footer>

      {compareIds.length > 0 && view !== 'compare' && (
        <div className="compare-tray">
          <div>
            <span className="tray-count">{compareIds.length}</span>
            <p>项政策已加入对比</p>
          </div>
          <button className="tray-clear" onClick={() => setCompareIds([])}>
            清空
          </button>
          <button className="tray-open" onClick={() => navigate('compare')}>
            查看对比
            <ArrowRight size={15} />
          </button>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <EvidenceDrawer
        key={selectedPolicy?.id ?? 'none'}
        policy={selectedPolicy}
        policies={corpusPolicies}
        onClose={() => setSelectedPolicyId(null)}
        onSelect={setSelectedPolicyId}
        onCompare={toggleCompare}
        inCompare={Boolean(selectedPolicy && compareIds.includes(selectedPolicy.id))}
      />
    </div>
  );
}

export default App;
