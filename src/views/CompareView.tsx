import { Download, GitCompareArrows, Info, Plus, X } from 'lucide-react';
import type { Policy } from '../types';
import { SourceBadge } from '../components/Badges';

interface CompareViewProps {
  selected: Policy[];
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onGoLibrary: () => void;
  onExport: () => void;
}

const ROWS: { label: string; render: (policy: Policy) => React.ReactNode }[] = [
  { label: '发布主体', render: (policy) => policy.issuer },
  { label: '发布时间', render: (policy) => policy.date },
  { label: '生效时间', render: (policy) => policy.effective },
  {
    label: '政策工具',
    render: (policy) => policy.instruments.join('；') || '原文未载明可结构化工具名称，请核对原文',
  },
  { label: '作用对象', render: (policy) => policy.targets.join('；') || '原文未载明' },
  { label: '政策目标', render: (policy) => policy.goals.join('；') || '原文未载明' },
  { label: '来源等级', render: (policy) => <SourceBadge level={policy.sourceLevel} /> },
  {
    label: '关键条款',
    render: (policy) => policy.clauses[policy.clauses.length - 1]?.text ?? '未提取',
  },
];

export function CompareView({ selected, onOpen, onRemove, onGoLibrary, onExport }: CompareViewProps) {
  if (selected.length === 0) {
    return (
      <div className="inner-page compare-page">
        <header className="page-heading">
          <div className="eyebrow">
            <span className="eyebrow-index">03</span>
            POLICY COMPARISON
          </div>
          <h1>政策对比</h1>
          <p>在同一表格中比较政策工具、作用对象、政策目标与约束条件。政策力度不以文件数量衡量。</p>
        </header>
        <div className="empty-compare">
          <div className="empty-compare-icon">
            <GitCompareArrows size={28} />
          </div>
          <h2>尚未选择对比政策</h2>
          <p>请从政策库中选择 2 至 3 项政策，建议选择目标相同、工具不同的政策，例如财政贴息与政策性降息。</p>
          <button className="primary-button" onClick={onGoLibrary}>
            <Plus size={16} />
            前往政策库
          </button>
        </div>
      </div>
    );
  }

  const dates = selected.map((policy) => policy.date).sort();
  const issuers = new Set(selected.map((policy) => policy.issuer));
  const types = new Set(selected.flatMap((policy) => policy.instrumentTypes));

  return (
    <div className="inner-page compare-page">
      <header className="page-heading">
        <div className="eyebrow">
          <span className="eyebrow-index">03</span>
          POLICY COMPARISON
          <span className="eyebrow-tag">{selected.length} 项已选</span>
        </div>
        <div className="page-heading-row">
          <div>
            <h1>政策对比</h1>
            <p>本页比较政策工具与约束条件。层级不同、发布时间不同的政策，不作简单加总。</p>
          </div>
          <div className="compare-actions">
            <button className="secondary-button" onClick={onGoLibrary}>
              <Plus size={15} />
              继续选择
            </button>
            <button className="primary-button" onClick={onExport}>
              <Download size={15} />
              导出对比表
            </button>
          </div>
        </div>
      </header>

      <section className="compare-cards">
        {selected.map((policy) => (
          <article key={policy.id} className="compare-card">
            <div className="compare-card-top">
              <span className="compare-date">{policy.date}</span>
              <button className="icon-button small" onClick={() => onRemove(policy.id)} aria-label="移出对比">
                <X size={15} />
              </button>
            </div>
            <h2>
              <button onClick={() => onOpen(policy.id)}>{policy.shortTitle}</button>
            </h2>
            <p>{policy.issuer}</p>
            <SourceBadge level={policy.sourceLevel} />
          </article>
        ))}
      </section>

      <section className="comparability-note">
        <div className="comparability-icon">
          <Info size={18} />
        </div>
        <div>
          <h3>可比性检查</h3>
          <p>
            这组政策跨越 <strong>{dates[0]}</strong> 至 <strong>{dates[dates.length - 1]}</strong>，
            涉及 <strong>{issuers.size}</strong> 个发布主体、<strong>{types.size}</strong> 类工具。
            {selected.length > 1
              ? '比较时应先区分规则型政策与资金型政策，再判断二者是否作用于同一对象。'
              : '至少选择两项政策才能形成对照。'}
          </p>
        </div>
      </section>

      <section className="compare-table-wrap">
        <table className="compare-table">
          <thead>
            <tr>
              <th>字段</th>
              {selected.map((policy) => (
                <th key={policy.id}>{policy.shortTitle}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th>{row.label}</th>
                {selected.map((policy) => (
                  <td key={policy.id}>{row.render(policy)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
