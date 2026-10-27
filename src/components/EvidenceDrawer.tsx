import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileText,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Coins,
  GitBranch,
  Landmark,
  ListTree,
  Ruler,
  Users,
} from 'lucide-react';
import type { Policy } from '../types';
import { SourceBadge, TypeBadges } from './Badges';

interface EvidenceDrawerProps {
  policy: Policy | null;
  policies: Policy[];
  onClose: () => void;
  onSelect: (id: string) => void;
  onCompare: (id: string) => void;
  inCompare: boolean;
}

const OBLIGATION_META: Record<string, { label: string; hint: string; tone: string }> = {
  目标: { label: '目标', hint: '文件自己写明的完成时限与结果', tone: 'goal' },
  约束: { label: '约束', hint: '对执行主体构成硬性要求', tone: 'bind' },
  禁止: { label: '禁止', hint: '明确不可为的边界', tone: 'ban' },
  激励: { label: '激励', hint: '给钱、给税惠、给政策的条款', tone: 'boost' },
  程序: { label: '程序', hint: '谁来办、怎么办、报谁批', tone: 'flow' },
};

const formatAmount = (item: { raw: string; value: number; unit: string }) => {
  if (item.unit === '亿元') {
    if (item.value >= 10000) return `${(item.value / 10000).toFixed(2)} 万亿元`;
    if (item.value < 0.1) return `${Math.round(item.value * 10000)} 万元`;
    return `${item.value >= 100 ? Math.round(item.value) : item.value.toFixed(1)} 亿元`;
  }
  return item.raw;
};

export function EvidenceDrawer({
  policy,
  policies,
  onClose,
  onSelect,
  onCompare,
  inCompare,
}: EvidenceDrawerProps) {
  const [copiedPolicyId, setCopiedPolicyId] = useState<string | null>(null);
  const [fullOpen, setFullOpen] = useState(false);

  useEffect(() => {
    if (!policy) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [policy, onClose]);

  const related = useMemo(() => {
    if (!policy) return [];
    return policies
      .filter((item) => policy.related?.includes(item.id) && item.id !== policy.id)
      .slice(0, 6);
  }, [policy, policies]);

  if (!policy) return null;

  const copied = copiedPolicyId === policy.id;
  const paragraphs = policy.paragraphs ?? [];
  const obligations = policy.obligations ?? [];
  const targets = policy.quantTargets ?? [];
  const implementers = policy.implementers ?? [];
  const funding = policy.funding ?? [];
  const timeline = policy.timeline ?? [];
  const sections = policy.sections ?? [];
  const clauseCount = obligations.reduce((sum, group) => sum + group.items.length, 0);
  // 条款分类已经收录的句子不再在"关键表述"里重复一遍，避免同一段话出现两次。
  const classified = new Set(obligations.flatMap((group) => group.items));
  const extraClauses = policy.clauses.filter((clause) => !classified.has(clause.text));
  const channelList = (policy.channels ?? []).filter((channel) => channel.hits > 0).slice(0, 6);
  // 条形按相对最大值画，weight 是归一化注意力占比，直接乘会全部顶满
  const maxChannelHits = Math.max(1, ...channelList.map((channel) => channel.hits));
  const amountNumbers = (policy.numbers ?? []).filter((item) => item.unit !== '百分比');
  const ratioNumbers = (policy.numbers ?? []).filter((item) => item.unit === '百分比');

  const copyCitation = async () => {
    const citation = [
      `${policy.issuer}：《${policy.title}》`,
      policy.docNo ? `（${policy.docNo}）` : '',
      `${policy.date}，${policy.sourceName}，${policy.sourceUrl}`,
    ].join('');
    try {
      await navigator.clipboard.writeText(citation);
      setCopiedPolicyId(policy.id);
      window.setTimeout(() => {
        setCopiedPolicyId((current) => (current === policy.id ? null : current));
      }, 1800);
    } catch {
      setCopiedPolicyId(null);
    }
  };

  return (
    <div className="drawer-overlay" onClick={onClose} role="presentation">
      <aside
        className="evidence-drawer pd-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="evidence-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="drawer-topbar">
          <div className="drawer-label">
            <FileText size={15} />
            政策详情
            {policy.docType && <span className="pd-doctype">{policy.docType}</span>}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭详情">
            <X size={19} />
          </button>
        </div>

        <div className="drawer-content">
          <div className="drawer-meta">
            <TypeBadges types={policy.instrumentTypes} />
            <SourceBadge level={policy.sourceLevel} />
            <span className="status-chip">{policy.status}</span>
          </div>
          <h2 id="evidence-title">{policy.title}</h2>
          <div className="drawer-issuer">
            {policy.issuer}
            {policy.docNo ? ` · ${policy.docNo}` : ''}
          </div>

          <dl className="meta-grid pd-meta">
            <div>
              <dt>发布日</dt>
              <dd>{policy.date || '—'}</dd>
            </div>
            <div>
              <dt>施行日</dt>
              <dd>{policy.effectiveDate || '未写明'}</dd>
            </div>
            <div>
              <dt>有效期至</dt>
              <dd>{policy.validUntil || '未写明'}</dd>
            </div>
            <div>
              <dt>正文长度</dt>
              <dd>{policy.bodyLength ? `${policy.bodyLength} 字` : '—'}</dd>
            </div>
            <div>
              <dt>主题</dt>
              <dd>{policy.theme}</dd>
            </div>
            <div>
              <dt>适用</dt>
              <dd>{policy.scope?.nationwide === false ? `点名 ${policy.scope.provinces.length} 省` : '全国'}</dd>
            </div>
          </dl>

          {policy.attachmentOnly && (
            <div className="inline-warning pd-warn">
              <span>
                <AlertTriangle size={13} /> 内容边界
              </span>
              该页面正文只有通知本身，实施方案或清单以附件（PDF/OFD）形式发布，系统未能解析附件内容。
              需要完整条款请点下方原文链接查看附件。
            </div>
          )}

          {(policy.attachments?.length ?? 0) > 0 && (
            <div className="pd-attach">
              <div className="pd-attach-head">
                <FileText size={12} />
                <span>附件</span>
                {policy.bodySource === 'page+pdf' && <em>正文已从 PDF 并入</em>}
              </div>
              <ul>
                {policy.attachments!.map((item) => {
                  // 只有「判定为正文 + 解析成功 + 不是表格」才算真的并进了正文，其余都要标出来
                  const merged = item.role === 'main' && item.ok && item.layout !== 'table';
                  const label =
                    item.role === 'main'
                      ? merged
                        ? '正文'
                        : item.ok
                          ? '附表'
                          : '正文未读'
                      : item.role === 'annex'
                        ? '清单'
                        : '其他格式';
                  return (
                    <li key={item.url}>
                      <span className={`pd-attach-role is-${merged ? 'ok' : item.ok ? 'plain' : 'fail'}`}>{label}</span>
                      <a href={item.url} target="_blank" rel="noreferrer">
                        {item.name}
                        <ExternalLink size={10} />
                      </a>
                      <span className="pd-attach-meta">
                        {item.error ? item.error : `${item.pages} 页 · ${item.chars.toLocaleString('zh-CN')} 字`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="pd-statbar">
            <div>
              <strong>{paragraphs.length}</strong>
              <span>原文段落</span>
            </div>
            <div>
              <strong>{clauseCount}</strong>
              <span>可归类条款</span>
            </div>
            <div>
              <strong>{targets.length + amountNumbers.length + ratioNumbers.length || '—'}</strong>
              <span>量化指标</span>
            </div>
            <div>
              <strong>{channelList.length}</strong>
              <span>传导渠道</span>
            </div>
          </div>

          {sections.length > 0 && (
            <section className="drawer-section">
              <div className="pd-head">
                <ListTree size={15} />
                <h3>文件结构</h3>
                <span className="pd-head-note">按原文编号还原，未改写标题</span>
              </div>
              <ol className="pd-sections">
                {sections.map((section, index) => (
                  <li key={`${section.label}-${index}`}>
                    <span className="pd-sec-label">{section.label}</span>
                    <span className="pd-sec-title">{section.title}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {extraClauses.length > 0 && (
            <section className="drawer-section">
              <div className="pd-head">
                <ListTree size={15} />
                <h3>{sections.length > 0 ? '其余关键表述' : '原文要点'}</h3>
                <span className="pd-head-note">按含数字与政策动词的密度筛出，未改写</span>
              </div>
              {extraClauses.map((clause, index) => (
                <div className="clause pd-clause" key={`${clause.label}-${index}`}>
                  <span className="clause-number">{String(index + 1).padStart(2, '0')}</span>
                  <p>{clause.text}</p>
                </div>
              ))}
            </section>
          )}

          {obligations.length > 0 && (
            <section className="drawer-section">
              <div className="pd-head">
                <GitBranch size={15} />
                <h3>条款分类</h3>
                <span className="pd-head-note">按语气与动词归位，同一句只归一类</span>
              </div>
              <div className="pd-obligations">
                {obligations.map((group) => {
                  const meta = OBLIGATION_META[group.kind] ?? {
                    label: group.kind,
                    hint: '',
                    tone: 'flow',
                  };
                  return (
                    <div className={`pd-ob pd-ob-${meta.tone}`} key={group.kind}>
                      <div className="pd-ob-head">
                        <span className="pd-ob-tag">{meta.label}</span>
                        <span className="pd-ob-hint">{meta.hint}</span>
                        <span className="pd-ob-count">{group.items.length}</span>
                      </div>
                      <ul>
                        {group.items.map((item, index) => (
                          <li key={`${group.kind}-${index}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {(targets.length > 0 || amountNumbers.length > 0 || ratioNumbers.length > 0) && (
            <section className="drawer-section">
              <div className="pd-head">
                <Ruler size={15} />
                <h3>量化指标</h3>
                <span className="pd-head-note">原文出现的数值，未做口径换算</span>
              </div>

              {targets.length > 0 && (
                <div className="pd-targets">
                  {targets.map((target, index) => (
                    <div className="pd-target" key={`${target.text}-${index}`}>
                      <span className="pd-target-year">{target.year}</span>
                      <p>{target.text}</p>
                      {target.value && <span className="pd-target-value">{target.value}</span>}
                    </div>
                  ))}
                </div>
              )}

              {(amountNumbers.length > 0 || ratioNumbers.length > 0) && (
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th>原文写法</th>
                      <th>折算</th>
                    </tr>
                  </thead>
                  <tbody>
                    {amountNumbers.slice(0, 8).map((item, index) => (
                      <tr key={`amount-${index}`}>
                        <td>金额</td>
                        <td>{item.raw}</td>
                        <td className="pd-num">{formatAmount(item)}</td>
                      </tr>
                    ))}
                    {ratioNumbers.slice(0, 6).map((item, index) => (
                      <tr key={`ratio-${index}`}>
                        <td>比率</td>
                        <td>{item.raw}</td>
                        <td className="pd-num">{item.value}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <section className="drawer-section">
            <div className="pd-head">
              <Landmark size={15} />
              <h3>政策工具与作用对象</h3>
            </div>
            <div className="field-block">
              <span>工具</span>
              <div className="tag-cloud">
                {policy.instruments.length > 0 ? (
                  policy.instruments.map((item) => (
                    <span className="mini-tag" key={item}>
                      {item}
                    </span>
                  ))
                ) : (
                  <span className="pd-empty">原文未出现可识别的具体工具表述</span>
                )}
              </div>
            </div>
            <div className="field-block">
              <span>对象</span>
              <div className="tag-cloud">
                {policy.targets.map((item) => (
                  <span className="mini-tag" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="field-block">
              <span>目标</span>
              <p>{policy.goals.join(' · ')}</p>
            </div>
          </section>

          {(implementers.length > 0 || funding.length > 0 || timeline.length > 0) && (
            <section className="drawer-section">
              <div className="pd-head">
                <Users size={15} />
                <h3>落实安排</h3>
                <span className="pd-head-note">谁执行、钱从哪来、什么时候交卷</span>
              </div>

              {implementers.length > 0 && (
                <div className="pd-row">
                  <span className="pd-row-label">实施主体</span>
                  <div className="tag-cloud">
                    {implementers.map((item) => (
                      <span className="mini-tag" key={item}>
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {funding.length > 0 && (
                <div className="pd-row">
                  <span className="pd-row-label">
                    <Coins size={12} /> 资金来源
                  </span>
                  <ul className="pd-list">
                    {funding.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {timeline.length > 0 && (
                <div className="pd-row">
                  <span className="pd-row-label">时间节点</span>
                  <div className="pd-timeline">
                    {timeline.map((node, index) => (
                      <div className="pd-tl-item" key={`${node.year}-${index}`}>
                        <span className="pd-tl-year">{node.year}</span>
                        <span className="pd-tl-text">{node.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {channelList.length > 0 && (
            <section className="drawer-section">
              <div className="pd-head">
                <GitBranch size={15} />
                <h3>传导渠道</h3>
                <span className="pd-head-note">正文关键词密度，非权重</span>
              </div>
              <div className="pd-channels">
                {channelList.map((channel) => (
                  <div className="pd-channel" key={channel.id}>
                    <span>{channel.name}</span>
                    <div className="pd-channel-bar">
                      <i style={{ width: `${Math.round((channel.hits / maxChannelHits) * 100)}%` }} />
                    </div>
                    <span className="pd-channel-hit">{channel.hits}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {paragraphs.length > 0 && (
            <section className="drawer-section">
              <div className="pd-head">
                <FileText size={15} />
                <h3>原文分段</h3>
                <button className="pd-toggle" onClick={() => setFullOpen((open) => !open)}>
                  {fullOpen ? (
                    <>
                      收起 <ChevronUp size={14} />
                    </>
                  ) : (
                    <>
                      展开全部 {paragraphs.length} 段 <ChevronDown size={14} />
                    </>
                  )}
                </button>
              </div>
              <div className={`pd-body ${fullOpen ? 'is-open' : ''}`}>
                {(fullOpen ? paragraphs : paragraphs.slice(0, 5)).map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </div>
              {!fullOpen && paragraphs.length > 5 && (
                <div className="pd-fade">
                  <button onClick={() => setFullOpen(true)}>还有 {paragraphs.length - 5} 段</button>
                </div>
              )}
            </section>
          )}

          <section className="drawer-section">
            <div className="pd-head">
              <ExternalLink size={15} />
              <h3>信源核对</h3>
            </div>
            <p className="pd-source">
              {policy.sourceName}｜{policy.issuer}｜{policy.date}
            </p>
            <a className="source-link" href={policy.sourceUrl} target="_blank" rel="noreferrer">
              前往原文核对
              <ExternalLink size={14} />
            </a>
            {policy.caveat && <div className="inline-warning pd-warn">{policy.caveat}</div>}
          </section>

          {related.length > 0 && (
            <section className="drawer-section">
              <div className="section-kicker">关联政策</div>
              <div className="related-list">
                {related.map((item) => (
                  <button key={item.id} onClick={() => onSelect(item.id)}>
                    {item.shortTitle}
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="drawer-actions">
          <button className="secondary-button" onClick={copyCitation}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? '已复制引用' : '复制引用'}
          </button>
          <button
            className={`primary-button ${inCompare ? 'is-disabled' : ''}`}
            onClick={() => onCompare(policy.id)}
            disabled={inCompare}
          >
            <Plus size={16} />
            {inCompare ? '已在对比中' : '加入政策对比'}
          </button>
        </div>
      </aside>
    </div>
  );
}
