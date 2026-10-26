import { ArrowRight, Check, CircleAlert, Database, FileCheck2, MapPin, Scale, ShieldCheck } from 'lucide-react';

interface SourceLive {
  id: string;
  name: string;
  ok: boolean;
  count: number;
}

// 这里列的是本版实际跑通的栏目入口，与 server/sources.mjs 一一对应。
const SOURCE_ROWS = [
  {
    id: 'gov-central',
    name: '中国政府网 · 中央政策文件',
    entry: 'gov.cn/zhengce/zuixin',
    mode: '结构化 JSON 接口',
    use: '中共中央、国务院、国办文件，含 1000+ 条历史记录',
  },
  {
    id: 'mof-policy',
    name: '财政部 · 政策发布',
    entry: 'mof.gov.cn/zhengwuxinxi',
    mode: '栏目 HTML',
    use: '财税政策文件与配套通知',
  },
  {
    id: 'mof-tax',
    name: '财政部 · 税政司',
    entry: 'szs.mof.gov.cn/zhengcefabu',
    mode: '栏目 HTML',
    use: '税政司单独发布的税收公告，财税口径最细',
  },
  {
    id: 'ndrc-notice',
    name: '国家发展改革委 · 通知公告',
    entry: 'ndrc.gov.cn/xxgk/zcfb/tz',
    mode: '栏目 HTML',
    use: '产业、投资、价格领域的规范性通知',
  },
  {
    id: 'pbc-law',
    name: '中国人民银行 · 条法司',
    entry: 'pbc.gov.cn/tiaofasi',
    mode: '栏目 HTML',
    use: '央行规章与规范性文件',
  },
  {
    id: 'mof-news',
    name: '财政部 · 财政新闻',
    entry: 'mof.gov.cn/caizhengxinwen',
    mode: '栏目 HTML',
    use: '发布会实录与形势通报，作为背景材料',
  },
  {
    id: 'stats-release',
    name: '国家统计局 · 数据发布',
    entry: 'stats.gov.cn/sj/zxfb',
    mode: '栏目 HTML',
    use: '统计数据与解读，作为效果观测背景',
  },
];

export function MethodView({ sources }: { sources?: SourceLive[] }) {
  return (
    <div className="inner-page method-page">
      <header className="method-hero">
        <div className="eyebrow">
          <span className="eyebrow-index">05</span>
          METHOD & BOUNDARIES
          <span className="eyebrow-tag">答辩用</span>
        </div>
        <h1>通用大模型能写出像样的解释，<br />但不能替你证明它来自哪里。</h1>
        <p>
          所以本项目不训练“更懂政策的模型”。我们把通用模型放在后端，作为分析与表达引擎；
          在它外面建设语料边界、结构化政策卡片、证据绑定和可复现的评测。
        </p>
      </header>

      <section className="method-grid">
        <article>
          <Database size={22} />
          <span className="method-index">01</span>
          <h2>固定语料与版本</h2>
          <p>明确收录哪些文件、截止到哪一天、哪些版本已失效。没有语料边界，就没有“没有找到”这种结论。</p>
        </article>
        <article>
          <FileCheck2 size={22} />
          <span className="method-index">02</span>
          <h2>段落级证据绑定</h2>
          <p>每条结论回到具体文件、发布日期和原文段落。来源分为政策原文、官方发布、权威媒体。</p>
        </article>
        <article>
          <Scale size={22} />
          <span className="method-index">03</span>
          <h2>事实、观察、推断分开</h2>
          <p>政策写了什么、数据变了多少、机制上可能怎么传导，是三种不同强度的陈述，不能混成一句。</p>
        </article>
        <article>
          <MapPin size={22} />
          <span className="method-index">04</span>
          <h2>省级影响是结构推演</h2>
          <p>政策渠道权重 × 省份结构敏感度，输出“谁受影响更大、来自哪条渠道”，并单独标注方向不明的渠道。</p>
        </article>
      </section>

      <section className="ab-section">
        <div className="section-heading">
          <span className="section-kicker">VALIDATION DESIGN / 验证设计</span>
          <h2>用 A/B 对照证明系统不是套壳</h2>
          <p>答辩时最有说服力的不是架构图，而是同一批问题下，通用模型与本系统的可核查差异。</p>
        </div>
        <div className="ab-table">
          <div className="ab-head">
            <span>维度</span>
            <span>A 组：通用大模型 + 联网 + 精心提示词</span>
            <span>B 组：宏策智研</span>
          </div>
          {[
            ['事实与日期', '可能混淆年份、文件或条款', '固定快照与结构化字段'],
            ['引用支持', '给链接，但段落不一定支持结论', '结论绑定原文与条款'],
            ['来源覆盖', '无法证明是否漏掉文件', '可显示命中数与语料边界'],
            ['复现一致性', '同题多次回答可能变化', '语料与规则固定，可重复'],
            ['无答案问题', '倾向继续生成解释', '证据不足时明确拒答'],
            ['可视化', '生成图表代码，口径不稳定', '指标口径与来源固定'],
          ].map((row) => (
            <div className="ab-row" key={row[0]}>
              <span>{row[0]}</span>
              <span>{row[1]}</span>
              <span>
                <Check size={14} />
                {row[2]}
              </span>
            </div>
          ))}
        </div>
        <div className="ab-note">
          <CircleAlert size={16} />
          <p>
            继续推进的判据：在“引用支持率、来源覆盖率、复现一致性”中至少两项明显优于 A 组。否则应缩小题目，而不是继续堆功能。
          </p>
        </div>
      </section>

      <section className="boundary-section">
        <div className="section-heading">
          <span className="section-kicker">SOURCE AUDIT / 信源接入审计</span>
          <h2>七个真能抓的官方栏目，和一批抓不到的</h2>
        </div>
        <p className="method-lead">
          信源不是列个名单就算接入。每个来源都要实测四件事：栏目页能否直连、列表能否解析出日期、
          正文能否提取、文种能否区分。下表是本版逐个跑通的实测结果，抓不到的原因也一并列出——
          "哪些没接上"和"哪些接上了"同样是方法的一部分。
        </p>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>来源</th>
                <th>入口</th>
                <th>抓取方式</th>
                <th>本次入库</th>
                <th>用途</th>
              </tr>
            </thead>
            <tbody>
              {SOURCE_ROWS.map((row) => {
                const live = sources?.find((source) => source.id === row.id);
                return (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td className="src-entry">{row.entry}</td>
                    <td>{row.mode}</td>
                    <td className="src-count">
                      {live ? (live.ok ? `${live.count} 条` : '失败') : '—'}
                    </td>
                    <td>{row.use}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="source-miss">
          <h3>
            <CircleAlert size={16} />
            实测抓不到、因此没有接入的来源
          </h3>
          <ul>
            <li>
              <strong>工业和信息化部</strong>：栏目页只返回空壳，列表由前端脚本渲染，静态抓取拿不到条目。
            </li>
            <li>
              <strong>商务部</strong>：栏目路径已改版，原公开目录返回 404。
            </li>
            <li>
              <strong>住房城乡建设部 / 人力资源社会保障部</strong>：栏目页返回空页面或极短占位页，无可用列表。
            </li>
            <li>
              <strong>国家金融监督管理总局</strong>：列表为动态加载，无公开的结构化接口。
            </li>
          </ul>
          <p>
            这些来源目前只能靠人工补录。把它们写出来，是为了避免一个常见误判：把"没抓到"当成"没有政策"。
          </p>
        </div>

        <div className="extract-levels">
          <h3>
            <FileCheck2 size={16} />
            一条政策会被拆成两层
          </h3>
          <div className="extract-grid">
            <div>
              <span className="method-index">第一层</span>
              <h4>用于排序与计算</h4>
              <p>
                发文机关、文号、日期、文种、主题、政策工具、作用对象、政策目标、九条传导渠道的命中密度、
                金额与比例数字。这一层决定优先级分数、机制链与省级影响。
              </p>
            </div>
            <div>
              <span className="method-index">第二层</span>
              <h4>用于逐条阅读</h4>
              <p>
                章节结构、条款分类（目标／约束／禁止／激励／程序）、量化目标、实施主体、资金来源、
                时间节点、适用范围、原文分段。这一层只做归位与筛选，不改写原句。
              </p>
            </div>
          </div>
          <p className="extract-note">
            已知缺口：政府文件的核心内容常常只放在附件（PDF／OFD）里，网页正文只有一纸通知。
            系统能识别出这类情况并标注"主体在附件"，但不解析附件内容——这是本版明确的能力边界。
          </p>
        </div>
      </section>

      <section className="boundary-section">
        <div className="section-heading">
          <span className="section-kicker">PIPELINE / 一键研判口径</span>
          <h2>"优先级"和"机制"是怎么算出来的</h2>
        </div>
        <p className="method-lead">
          一键研判不是让模型写一段总结，而是走一条固定的七步流水线：连接官方栏目 → 抓取正文 → 结构化抽取 →
          七维评分 → 机制建模 → 关系推演 → 省级影响。每一步的中间结果都留在页面上，可逐条复核。
        </p>
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr>
                <th>环节</th>
                <th>判据</th>
                <th>不可越界的部分</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>优先级排序</td>
                <td>发文层级 22%、时效性 18%（半衰期 60 天）、力度强度 18%（工具数 + 金额量级／比例指标）、覆盖广度 13%、约束强度 12%、政策信号 12%、新增信息 5%</td>
                <td>只回答"先看哪条"，不回答"效果多大"；分数不能跨期比较</td>
              </tr>
              <tr>
                <td>作用机制</td>
                <td>政策工具 → 中间变量 → 主体行为 → 宏观结果，附方向、强度（1—3 格）、时滞与原文依据句</td>
                <td>方向由表述倾向判定，时滞是定性区间，不是估计值</td>
              </tr>
              <tr>
                <td>相互关系</td>
                <td>同发文机关 + 时间邻近 + 同渠道 → 配套协同；同主渠道 + 时序 → 承接加码；财政 × 信贷 → 工具互补；同渠道方向相反 → 目标张力</td>
                <td>关系是文本推断，不等于发文机关确认的配套关系，强度 0—1 只是相对排序</td>
              </tr>
              <tr>
                <td>省级影响</td>
                <td>渠道权重（注意力占比）× 省份结构敏感度（定性归纳），先算逐渠道贡献再汇总</td>
                <td>结构推演，不是计量估计；未用统计年鉴校准，方向不明的渠道不计分</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="boundary-section">
        <div className="section-heading">
          <span className="section-kicker">CURRENT MVP / 真实边界</span>
          <h2>这一版做了什么，没做什么</h2>
        </div>
        <div className="boundary-columns">
          <div>
            <h3>
              <ShieldCheck size={17} />
              已经实现
            </h3>
            <ul>
              <li><strong>一键研判</strong>：不用提问，按一次启动即完成抓取—打分—机制—关系—影响全流程</li>
              <li>四个官方来源自动采集（财政部政策发布与财政新闻、人民银行条法司、中国政府网国务院文件）</li>
              <li>七维优先级评分、四段传导机制链、五类政策关系图，口径全部公开</li>
              <li>政策文件与背景材料分开：发布会实录、数据发布、工作动态默认不当作政策工具</li>
              <li>结构化政策卡片：工具、对象、目标、传导渠道、数字、原文位置</li>
              <li>原文事实 / 数据观察 / 机制推断三层输出，条条可回溯</li>
              <li>政策传导链与利率、存准率联动图</li>
              <li>省级影响结构模型：渠道权重 × 省份敏感度，可逐省拆解</li>
              <li>研究、决策参考、公众三种阅读模式；对比与简报导出</li>
            </ul>
          </div>
          <div>
            <h3>
              <CircleAlert size={17} />
              明确没做
            </h3>
            <ul>
              <li>没有用统计年鉴或投入产出表校准省份敏感系数</li>
              <li>没有覆盖地方实施细则与执行进度</li>
              <li>没有训练或微调大模型</li>
              <li>没有估计政策因果效应</li>
              <li>没有用优先级分数给政策排"优劣"，分数只表示"先看哪条"</li>
              <li>没有人工确认政策之间的配套关系，关系图全部由规则推导</li>
              <li>没有用生成内容替代原文</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="next-section">
        <div>
          <span className="section-kicker">NEXT / 下一步</span>
          <h2>从演示快照走向可用的研究基础设施</h2>
        </div>
        <div className="next-steps">
          <div>
            <span>01</span>
            <h3>用统计年鉴校准省份系数</h3>
            <p>把标签式敏感度换成增加值结构、进出口依存度、财政自给率等可查指标，模型才具备可辩护性。</p>
          </div>
          <div>
            <span>02</span>
            <h3>用大模型做抽取，不放开回答</h3>
            <p>模型只填结构化字段，结论由数据库查询与证据校验生成；抽取结果保留人工复核入口。</p>
          </div>
          <div>
            <span>03</span>
            <h3>建立30题评测集</h3>
            <p>覆盖单篇、比较、影响、无答案问题，记录引用支持率与一致性。</p>
          </div>
        </div>
        <a className="method-source-link" href="https://www.gov.cn/" target="_blank" rel="noreferrer">
          当前语料来源：中国政府网及相关部门公开信息
          <ArrowRight size={14} />
        </a>
      </section>
    </div>
  );
}
