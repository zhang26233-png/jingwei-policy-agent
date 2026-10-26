import type { InstrumentType, SourceLevel } from '../types';

const typeClassMap: Record<InstrumentType, string> = {
  财政: 'type-fiscal',
  货币: 'type-monetary',
  消费: 'type-consumption',
  民生: 'type-livelihood',
  法治: 'type-law',
  产业: 'type-industry',
};

export function TypeBadges({ types }: { types: InstrumentType[] }) {
  return (
    <span className="type-badges">
      {types.map((type) => (
        <span key={type} className={`type-badge ${typeClassMap[type]}`}>
          {type}
        </span>
      ))}
    </span>
  );
}

export function SourceBadge({ level }: { level: SourceLevel }) {
  const variant =
    level === '政策原文' ? 'source-primary' : level === '官方发布' ? 'source-official' : 'source-media';
  return <span className={`source-badge ${variant}`}>{level}</span>;
}
