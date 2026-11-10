import { useMemo, useState } from 'react';
import { ArrowRight, Check, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import type { InstrumentType, Policy } from '../types';
import { SourceBadge, TypeBadges } from '../components/Badges';

const FILTERS: (InstrumentType | '全部')[] = ['全部', '财政', '货币', '消费', '民生', '法治', '产业'];

interface CorpusView {
  loading: boolean;
  collecting: boolean;
  online: boolean;
  error: string | null;
  updatedAt: string | null;
  total: number;
  auto: number;
  sources: {
    id: string;
    name: string;
    org: string;
    ok: boolean;
    count: number;
    withBody: number;
    error: string | null;
  }[];
}

interface PolicyLibraryProps {
  policies: Policy[];
  compareIds: string[];
  onOpen: (id: string) => void;
  onCompare: (id: string) => void;
  onGoCompare: () => void;
  corpus?: CorpusView;
  onCollect?: () => void;
}

const formatUpdated = (iso: string | null) => {
  if (!iso) return '尚未采集';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '尚未采集';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

export function PolicyLibrary({
  policies,
  compareIds,
  onOpen,
  onCompare,
  onGoCompare,
  corpus,
  onCollect,
}: PolicyLibraryProps) {
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<InstrumentType | '全部'>('全部');
  const [origin, setOrigin] = useState<'all' | 'auto' | 'seed'>('all');
  const [scope, setScope] = useState<'documents' | 'all'>('documents');

  const isDocument = (policy: Policy) => (policy.docType ?? '政策文件') === '政策文件';

  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return policies.filter((policy) => {
      if (scope === 'documents' && !isDocument(policy)) return false;
      if (origin !== 'all' && (policy.origin ?? 'seed') !== origin) return false;
      const typeMatch = filter === '全部' || policy.instrumentTypes.includes(filter);
      if (!typeMatch) return false;
      if (!normalized) return true;
      const searchable = [
        policy.title,
        policy.shortTitle,
        policy.issuer,
        policy.docNo ?? '',
        policy.summary,
        (policy.sections ?? []).map((section) => section.title).join(' '),
        policy.instruments.join(' '),
        policy.targets.join(' '),
        policy.tags.join(' '),
      ]
        .join(' ')
        .toLowerCase();
      return searchable.includes(normalized);
    });
  }, [filter, keyword, origin, policies, scope]);

  const stats = useMemo(() => {
    const auto = policies.filter((policy) => policy.origin === 'auto');
    const dates = policies.map((policy) => policy.date).filter(Boolean).sort();
    return {
      total: policies.length,
      documents: policies.filter(isDocument).length,
      reference: policies.filter((policy) => !isDocument(policy)).length,
      auto: auto.length,
      withBody: auto.filter((policy) => (policy.bodyLength ?? 0) > 200).length,
      sources: corpus?.sources?.length ?? new Set(policies.map((policy) => policy.sourceName)).size,
      earliest: dates[0] ?? '—',
      latest: dates[dates.length - 1] ?? '—',
    };
  }, [policies, corpus]);

  return (
    <div className="inner-page library-page">
      <header className="page-heading">
        <div className="eyebrow">
          <span className="eyebrow-index">02</span>
          POLICY CORPUS
          <span className={`eyebrow-tag ${corpus?.online ? 'is-live' : ''}`}>
            {corpus?.online ? '自动检索已接入' : '离线语料'}
          </span>
        </div>
        <div className="page-heading-row">
          <div>
            <h1>政策库</h1>
            <p>
              自动采集中央政策原文，统一整理为政策卡片，保留发布主体、政策工具、作用对象、传导渠道与原文位置。
            </p>
          </div>
          <div className="library-summary">
            <div>
              <strong>{stats.documents}</strong>
              <span>政策文件</span>
            </div>
            <div>
              <strong>{stats.reference}</strong>
              <span>背景材料</span>
            </div>
            <div>
              <strong>{stats.auto}</strong>
              <span>自动采集</span>
            </div>
            <div>
              <strong>{stats.sources}</strong>
              <span>公开来源</span>
            </div>
          </div>
        </div>
      </header>

      {corpus && (
        <section className="corpus-status">
          <div className="corpus-status-head">
            <div>
              <span className="section-kicker">采集状态</span>
              <p>
                语料区间 {stats.earliest} 至 {stats.latest}，最近入库 {formatUpdated(corpus.updatedAt)}
                {corpus.error ? ` · ${corpus.error}` : ''}
              </p>
            </div>
            <button className="corpus-collect" onClick={onCollect} disabled={corpus.collecting || corpus.loading}>
              <RefreshCw size={14} className={corpus.collecting ? 'is-spinning' : ''} />
              {corpus.collecting ? '正在检索官方来源…' : '立即检索最新政策'}
            </button>
          </div>
          <div className="corpus-source-grid">
            {corpus.sources.map((source) => (
              <div key={source.id} className={source.ok ? 'corpus-source is-ok' : 'corpus-source is-fail'}>
                <span className="corpus-source-org">{source.name.replace(/\s*·\s*/g, '·')}</span>
                <span className="corpus-source-count">
                  {source.ok ? `${source.count} 条 / 正文 ${source.withBody}` : '抓取失败'}
                </span>
                {!source.ok && source.error && <em>{source.error}</em>}
              </div>
            ))}
            {corpus.sources.length === 0 && (
              <div className="corpus-source is-idle">
                <span className="corpus-source-org">采集服务未连接</span>
                <span className="corpus-source-count">当前仅展示内置校订语料</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="library-toolbar">
        <label className="library-search">
          <Search size={18} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索政策名称、部门、工具或作用对象"
            aria-label="搜索政策库"
          />
        </label>
        <div className="filter-group">
          <span className="filter-label">
            <SlidersHorizontal size={14} />
            工具类型
          </span>
          {FILTERS.map((item) => (
            <button key={item} className={filter === item ? 'is-active' : ''} onClick={() => setFilter(item)}>
              {item}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">来源</span>
          {(
            [
              ['all', '全部'],
              ['auto', '自动采集'],
              ['seed', '校订样例'],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={origin === value ? 'is-active' : ''} onClick={() => setOrigin(value)}>
              {label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="filter-label">范围</span>
          {(
            [
              ['documents', '仅政策文件'],
              ['all', `含背景材料 ${stats.reference}`],
            ] as const
          ).map(([value, label]) => (
            <button key={value} className={scope === value ? 'is-active' : ''} onClick={() => setScope(value)}>
              {label}
            </button>
          ))}
        </div>
      </section>

      <div className="library-count">
        显示 <strong>{filtered.length}</strong> / {scope === 'documents' ? stats.documents : stats.total} 项
        {scope === 'documents' && stats.reference > 0 && (
          <span className="count-hint">
            已隐藏 {stats.reference} 项发布会实录、数据发布与工作动态
          </span>
        )}
        {compareIds.length > 0 && (
          <button className="inline-compare-link" onClick={onGoCompare}>
            已选 {compareIds.length} 项，前往对比
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      <section className="policy-table" aria-label="政策列表">
        <div className="policy-table-head">
          <span>对比</span>
          <span>政策名称</span>
          <span>主题</span>
          <span>发布时间</span>
          <span>政策工具</span>
          <span>来源</span>
        </div>
        {filtered.map((policy) => {
          const selected = compareIds.includes(policy.id);
          return (
            <div className="policy-table-row" key={policy.id}>
              <div className="compare-cell">
                <button
                  className={`compare-check ${selected ? 'is-checked' : ''}`}
                  onClick={() => onCompare(policy.id)}
                  aria-label={selected ? '已在对比中' : `将${policy.shortTitle}加入对比`}
                  disabled={selected}
                >
                  {selected && <Check size={12} />}
                </button>
              </div>
              <div className="policy-name-cell">
                <button onClick={() => onOpen(policy.id)}>{policy.shortTitle || policy.title}</button>
                {policy.summary && policy.summary !== policy.title && <p>{policy.summary}</p>}
                <div className="row-depth">
                  {policy.docNo && <span className="depth-docno">{policy.docNo}</span>}
                  {(policy.sections?.length ?? 0) > 0 && <span>{policy.sections!.length} 章</span>}
                  {(policy.obligations?.length ?? 0) > 0 && (
                    <span>{policy.obligations!.reduce((sum, group) => sum + group.items.length, 0)} 条</span>
                  )}
                  {(policy.bodyLength ?? 0) > 0 && (
                    <span>{((policy.bodyLength ?? 0) / 1000).toFixed(1)}k 字</span>
                  )}
                  {(policy.paragraphs?.length ?? 0) > 0 && <span>{policy.paragraphs!.length} 段原文</span>}
                  {policy.attachmentOnly && <span className="depth-warn">正文见附件</span>}
                  {policy.bodySource === 'page+pdf' && <span className="depth-ok">含附件正文</span>}
                </div>
                <div className="row-mobile-meta">
                  <TypeBadges types={policy.instrumentTypes} />
                  <span>{policy.date}</span>
                  {policy.origin === 'auto' && <span className="auto-chip">自动采集</span>}
                  {policy.docType && policy.docType !== '政策文件' && (
                    <span className="doc-chip">{policy.docType}</span>
                  )}
                </div>
              </div>
              <div>
                <span className="theme-chip">{policy.theme || '未分类'}</span>
              </div>
              <div className="date-cell">{policy.date || '—'}</div>
              <div className="instrument-cell">
                {policy.instruments.slice(0, 2).map((instrument) => (
                  <span className="mini-tag" key={instrument}>
                    {instrument}
                  </span>
                ))}
              </div>
              <div>
                <SourceBadge level={policy.sourceLevel} />
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="empty-table">
            <Search size={22} />
            <h3>无符合条件的政策</h3>
            <p>请调整关键词、工具类型或来源筛选条件。</p>
          </div>
        )}
      </section>

      <footer className="library-footnote">
        <span className="section-kicker">来源分级规则</span>
        <p>
          <strong>政策原文</strong>可直接引用；<strong>官方发布</strong>用于补充实施信息；
          <strong>权威媒体</strong>作为检索线索，正式引用应回补原文。来源等级在列表中持续显示。
        </p>
      </footer>
    </div>
  );
}
