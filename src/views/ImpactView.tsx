import { useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, MapPin, SlidersHorizontal } from 'lucide-react';
import type { Policy } from '../types';
import { CHANNEL_META, evaluateImpact, tagLabel } from '../lib/province';
import { ChinaMap } from '../components/ChinaMap';

export function ImpactView({
  policies,
  onOpenPolicy,
  onGoLibrary,
}: {
  policies: Policy[];
  onOpenPolicy: (id: string) => void;
  onGoLibrary: () => void;
}) {
  // 省级推演只使用"政策文件"，发布会实录与工作动态不作为政策工具来源。
  const documents = useMemo(
    () => policies.filter((policy) => (policy.docType ?? '政策文件') === '政策文件'),
    [policies],
  );
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    documents
      .filter((policy) => policy.origin !== 'auto' || (policy.bodyLength ?? 0) > 400)
      .map((policy) => policy.id),
  );
  const [activeCode, setActiveCode] = useState<string | null>(null);

  const selectedPolicies = useMemo(
    () => documents.filter((policy) => selectedIds.includes(policy.id)),
    [documents, selectedIds],
  );

  const impact = useMemo(() => evaluateImpact(selectedPolicies), [selectedPolicies]);

  const active = impact.provinces.find((item) => item.code === activeCode) ?? impact.provinces[0] ?? null;
  const topChannel = impact.channels[0] ?? null;

  const toggle = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <div className="inner-page impact-page">
      <header className="page-heading">
        <div className="eyebrow">
          <span className="eyebrow-index">04</span>
          PROVINCIAL IMPACT
          <span className="eyebrow-tag">{selectedPolicies.length} 项政策参与推演</span>
        </div>
        <div className="page-heading-row">
          <div>
            <h1>省级影响评估</h1>
            <p>
              把政策文本拆成传导渠道，再与各省经济结构匹配，输出「谁受影响更大、主要来自哪条渠道」。
              这是结构推演，不是政策效果的计量估计。
            </p>
          </div>
          <div className="library-summary">
            <div>
              <strong>{selectedPolicies.length}</strong>
              <span>参与政策</span>
            </div>
            <div>
              <strong>{impact.channels.length}</strong>
              <span>传导渠道</span>
            </div>
            <div>
              <strong>{impact.provinces[0]?.short ?? '—'}</strong>
              <span>最高暴露</span>
            </div>
          </div>
        </div>
      </header>

      <section className="panel impact-scope">
        <button className="scope-toggle" onClick={() => setOpen((value) => !value)}>
          <SlidersHorizontal size={15} />
          选择参与推演的政策
          <span className="scope-count">{selectedPolicies.length} / {documents.length}</span>
          <ChevronDown size={15} className={open ? 'is-open' : ''} />
        </button>
        {open && (
          <div className="scope-body">
            <div className="scope-actions">
              <button onClick={() => setSelectedIds(documents.map((policy) => policy.id))}>全选</button>
              <button onClick={() => setSelectedIds([])}>清空</button>
              <button
                onClick={() =>
                  setSelectedIds(
                    documents
                      .filter((policy) => policy.sourceLevel === '政策原文' || policy.origin === 'seed')
                      .map((policy) => policy.id),
                  )
                }
              >
                仅政策原文与校订语料
              </button>
            </div>
            <div className="scope-list">
              {documents.map((policy) => {
                const checked = selectedIds.includes(policy.id);
                return (
                  <button
                    key={policy.id}
                    className={`scope-item ${checked ? 'is-checked' : ''}`}
                    onClick={() => toggle(policy.id)}
                  >
                    <span className="scope-check">{checked ? <Check size={12} /> : null}</span>
                    <span className="scope-meta">
                      <strong>{policy.shortTitle || policy.title}</strong>
                      <small>
                        {policy.date} · {policy.issuer} · {policy.sourceLevel}
                      </small>
                    </span>
                  </button>
                );
              })}
            </div>
            {documents.length === 0 && (
              <p className="scope-empty">
                尚未加载政策文件。<button className="link-button" onClick={onGoLibrary}>去政策库看看</button>
              </p>
            )}
            {policies.length > documents.length && (
              <p className="scope-note">
                发布会实录、数据发布与工作动态共 {policies.length - documents.length} 项不作为政策工具参与推演。
              </p>
            )}
          </div>
        )}
      </section>

      {selectedPolicies.length === 0 ? (
        <section className="panel empty-state">
          <MapPin size={26} />
          <h2>还没有选择政策</h2>
          <p>展开上方「选择参与推演的政策」，或先到政策库采集最新中央政策。</p>
          <button className="primary-button" onClick={onGoLibrary}>
            打开政策库
            <ArrowRight size={15} />
          </button>
        </section>
      ) : (
        <>
          <section className="impact-grid">
            <div className="panel map-panel">
              <div className="panel-heading">
                <h2>省级受影响强度</h2>
                <span className="panel-subtitle">点击省份查看主要传导渠道</span>
              </div>
              <ChinaMap provinces={impact.provinces} selected={activeCode} onSelect={setActiveCode} />
              <p className="map-disclaimer">
                本图为政策影响分析示意图，行政边界来源于公开省级矢量数据（含台湾省、香港特别行政区、澳门特别行政区与南海诸岛），
                仅供参考，不作为国界与行政区划的权威依据。港澳台不参与本模型打分。
              </p>
              <p className="map-scope">
                <strong>这一页是结构推算，不是观测值。</strong>分数由"政策渠道权重 × 各省经济结构"算出，
                不依赖任何地方发文，所以全国 31 个省级单位都有值、都可排序。
                它与「央地传导」页的时滞观测是两套口径：那边只在能抓到政策文件的 6 个地方单元有数据，抓不到的不补造。
                两者不能互相验证——这里分数高不代表那边响应快，那边没有数据也不代表这里算错。
              </p>
            </div>

            <aside className="panel province-panel">
              {active ? (
                <>
                  <div className="province-head">
                    <div>
                      <span className="province-rank">第 {active.rank} 位 / 31</span>
                      <h2>{active.name}</h2>
                    </div>
                    <div className="province-score">
                      <strong>{active.exposure.toFixed(1)}</strong>
                      <span>暴露度</span>
                    </div>
                  </div>
                  <p className="province-note">{active.note}</p>
                  <div className="province-tags">
                    {active.tags.map((tag) => (
                      <span key={tag}>{tagLabel(tag)}</span>
                    ))}
                  </div>

                  <div className="province-metrics">
                    <div>
                      <span>受益侧</span>
                      <strong className="is-benefit">+{active.benefit.toFixed(1)}</strong>
                    </div>
                    <div>
                      <span>承压侧</span>
                      <strong className="is-pressure">
                        {active.pressure > 0.05 ? `−${active.pressure.toFixed(1)}` : '—'}
                      </strong>
                    </div>
                  </div>

                  <div className="province-drivers">
                    <h3>渠道贡献拆解</h3>
                    {active.contributions.map((contribution) => {
                      const max = Math.max(...active.contributions.map((item) => Math.abs(item.value)), 0.01);
                      const ratio = Math.abs(contribution.value) / max;
                      return (
                        <div key={contribution.id} className="driver-row">
                          <span className="driver-name">{contribution.short}</span>
                          <div className="driver-track">
                            <div
                              className={`driver-bar ${contribution.value >= 0 ? 'is-benefit' : 'is-pressure'}`}
                              style={{ width: `${Math.max(ratio * 100, 2)}%` }}
                            />
                          </div>
                          <span className="driver-value">
                            {contribution.value >= 0 ? '+' : '−'}
                            {Math.abs(contribution.value).toFixed(1)}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {active.drivers.length > 0 && (
                    <ul className="province-reasons">
                      {active.drivers.map((driver) => (
                        <li key={driver}>{driver}</li>
                      ))}
                    </ul>
                  )}

                  <div className="province-policies">
                    <h3>参与推演的政策</h3>
                    {impact.policies.slice(0, 4).map((policy) => (
                      <button key={policy.id} onClick={() => onOpenPolicy(policy.id)}>
                        <span>{policy.title}</span>
                        <small>{policy.date}</small>
                      </button>
                    ))}
                    {impact.policies.length > 4 && <p>等 {impact.policies.length} 项</p>}
                  </div>
                </>
              ) : (
                <p>暂无可评估省份</p>
              )}
            </aside>
          </section>

          <section className="panel channel-panel">
            <div className="panel-heading">
              <h2>政策传导渠道分解</h2>
              <span className="panel-subtitle">
                当前政策组合的主要作用渠道{topChannel ? `：${CHANNEL_META[topChannel.id as keyof typeof CHANNEL_META]?.desc ?? topChannel.name}` : ''}
              </span>
            </div>
            <div className="channel-list">
              {impact.channels.map((channel) => {
                const max = Math.max(...impact.channels.map((item) => item.weight), 0.001);
                return (
                  <div key={channel.id} className="channel-row">
                    <span className="channel-name">{channel.name}</span>
                    <div className="channel-track">
                      <div
                        className={`channel-bar ${channel.polarity < 0 ? 'is-pressure' : ''}`}
                        style={{ width: `${Math.max((channel.weight / max) * 100, 2)}%` }}
                      />
                    </div>
                    <span className="channel-meta">
                      {(channel.weight * 100).toFixed(1)}% · {channel.policyCount} 项
                      {channel.polarity < 0 ? ' · 收紧' : channel.polarity === 0 ? ' · 方向不明' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel rank-panel">
            <div className="panel-heading">
              <h2>省级暴露度排名</h2>
              <span className="panel-subtitle">前 5 省合计占全部暴露度的 {impact.national.concentration}%</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>省级行政区</th>
                    <th>暴露度</th>
                    <th>受益侧</th>
                    <th>承压侧</th>
                    <th>主要渠道</th>
                  </tr>
                </thead>
                <tbody>
                  {impact.provinces.map((province) => (
                    <tr
                      key={province.code}
                      className={active?.code === province.code ? 'is-active' : ''}
                      onClick={() => setActiveCode(province.code)}
                    >
                      <td className="rank-cell">{province.rank}</td>
                      <td>
                        <strong>{province.short}</strong>
                      </td>
                      <td>
                        <div className="exposure-cell">
                          <span className="exposure-bar" style={{ width: `${province.exposure}%` }} />
                          <em>{province.exposure.toFixed(1)}</em>
                        </div>
                      </td>
                      <td className="is-benefit">+{province.benefit.toFixed(1)}</td>
                      <td className="is-pressure">
                        {province.pressure > 0.05 ? `−${province.pressure.toFixed(1)}` : '—'}
                      </td>
                      <td className="driver-cell">
                        {province.contributions
                          .slice(0, 2)
                          .map((item) => item.short)
                          .join(' / ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel caveat-panel">
            <div className="panel-heading">
              <h2>方法与边界</h2>
              <span className="panel-subtitle">这组数字能说明什么、不能说明什么</span>
            </div>
            <ol>
              {impact.caveats.map((caveat) => (
                <li key={caveat}>{caveat}</li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
