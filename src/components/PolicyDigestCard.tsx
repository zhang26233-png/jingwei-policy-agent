import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Info } from 'lucide-react';
import type { Policy } from '../types';
import type { PolicyDigest } from '../lib/digest';
import './PolicyDigestCard.css';

interface PolicyDigestCardProps {
  digest: PolicyDigest;
  policy: Policy;
  grade: string;
  rank: number;
  onOpen: (id: string) => void;
  defaultOpen?: boolean;
}

const TONE_CLASS: Record<string, string> = {
  目标: 'is-goal',
  约束: 'is-limit',
  禁止: 'is-ban',
  激励: 'is-boost',
  程序: 'is-step',
  条款: 'is-clause',
};

export function PolicyDigestCard({ digest, policy, grade, rank, onOpen, defaultOpen = false }: PolicyDigestCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const visiblePoints = open ? digest.points : digest.points.slice(0, 2);
  const visibleFacts = open ? digest.facts : digest.facts.slice(0, 5);

  return (
    <article className={`dg-card ${open ? 'is-open' : ''}`}>
      <header className="dg-head">
        <span className="dg-rank">{String(rank).padStart(2, '0')}</span>
        <span className={`bp-grade is-${grade}`}>{grade}</span>
        <div className="dg-title">
          <strong>{policy.title}</strong>
          <span>
            {policy.issuer} · {policy.date} · {policy.docType ?? '政策文件'}
            {policy.docNo ? ` · ${policy.docNo}` : ''}
          </span>
        </div>
      </header>

      <p className="dg-headline">{digest.headline}</p>

      <dl className="dg-facts">
        {visibleFacts.map((fact) => (
          <div key={fact.label} className={fact.tone === 'missing' ? 'is-missing' : fact.tone === 'strong' ? 'is-strong' : ''}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {open && (
        <ul className="dg-sentences">
          {digest.sentences.map((sentence) => (
            <li key={sentence.label}>
              <span className="dg-s-label">{sentence.label}</span>
              <p>{sentence.text}</p>
              <em>依据：{sentence.basis}</em>
            </li>
          ))}
        </ul>
      )}

      {visiblePoints.length > 0 && (
        <ol className="dg-points">
          {visiblePoints.map((point, index) => (
            <li key={`${point.tag}-${index}`}>
              <span className={`dg-tag ${TONE_CLASS[point.tag] ?? ''}`}>{point.tag}</span>
              <p>{point.text}</p>
            </li>
          ))}
        </ol>
      )}

      <footer className="dg-foot">
        <button className="dg-toggle" onClick={() => setOpen((value) => !value)}>
          <ChevronDown size={14} className={open ? 'is-flip' : ''} />
          {open ? '收起逐句摘要' : `展开逐句摘要（${digest.sentences.length} 句）`}
        </button>

        <span className="dg-coverage" title="八个关键字段中有多少在原文中明确写明">
          <i>
            <b style={{ width: `${digest.coverage}%` }} />
          </i>
          字段完整度 {digest.coverage}%
        </span>

        {digest.gaps.length > 0 && (
          <span className="dg-gaps">
            <Info size={12} /> 未覆盖：{digest.gaps.slice(0, 3).join('、')}
            {digest.gaps.length > 3 ? ` 等 ${digest.gaps.length} 项` : ''}
          </span>
        )}

        <button className="dg-open" onClick={() => onOpen(policy.id)}>
          看原文与证据 <ArrowUpRight size={13} />
        </button>
      </footer>
    </article>
  );
}
