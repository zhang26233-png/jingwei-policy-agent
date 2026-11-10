import { ArrowUpRight, Check, Plus } from 'lucide-react';
import type { Policy } from '../types';
import { SourceBadge, TypeBadges } from './Badges';

interface PolicyCardProps {
  policy: Policy;
  index?: number;
  onOpen: (id: string) => void;
  onCompare: (id: string) => void;
  inCompare: boolean;
}

export function PolicyCard({ policy, index, onOpen, onCompare, inCompare }: PolicyCardProps) {
  return (
    <article className="policy-card">
      <div className="policy-card-top">
        <div className="policy-index">{String(index ?? 1).padStart(2, '0')}</div>
        <div className="policy-card-heading">
          <div className="policy-meta-line">
            <TypeBadges types={policy.instrumentTypes} />
            <span className="policy-date">{policy.date}</span>
            <SourceBadge level={policy.sourceLevel} />
          </div>
          <button className="policy-title" onClick={() => onOpen(policy.id)}>
            {policy.shortTitle}
            <ArrowUpRight size={15} strokeWidth={1.7} />
          </button>
          <div className="policy-issuer">{policy.issuer}</div>
        </div>
      </div>

      {policy.summary && policy.summary !== policy.title && <p className="policy-summary">{policy.summary}</p>}

      <div className="policy-tags">
        {policy.instruments.slice(0, 3).map((instrument) => (
          <span className="mini-tag" key={instrument}>
            {instrument}
          </span>
        ))}
      </div>

      <div className="policy-card-actions">
        <button className="text-button" onClick={() => onOpen(policy.id)}>
          查看原文与证据
        </button>
        <button
          className={`compare-button ${inCompare ? 'is-added' : ''}`}
          onClick={() => onCompare(policy.id)}
          disabled={inCompare}
        >
          {inCompare ? <Check size={14} /> : <Plus size={14} />}
          {inCompare ? '已加入对比' : '加入对比'}
        </button>
      </div>
    </article>
  );
}
