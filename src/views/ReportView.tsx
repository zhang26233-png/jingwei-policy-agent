import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, ExternalLink, FileText, Printer, RefreshCw } from 'lucide-react';
import type { Policy } from '../types';
import { fetchLocals } from '../lib/api';
import { buildTransfer, type LocalPayload } from '../lib/transfer';
import { buildReportModel, downloadReportHtml, renderReportHtml } from '../lib/researchReport';
import './report.css';

interface ReportViewProps {
  policies: Policy[];
}

export function ReportView({ policies }: ReportViewProps) {
  const [payload, setPayload] = useState<LocalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generatedAt, setGeneratedAt] = useState(() => new Date());
  const [reloadKey, setReloadKey] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // 不在 effect 里同步 setLoading：那会触发级联渲染（lint 也会报）。
  // 重试用 reloadKey 驱动，effect 只负责拉数据与回填结果。
  const reload = () => {
    setLoading(true);
    setError(null);
    setReloadKey((key) => key + 1);
  };

  useEffect(() => {
    let alive = true;
    fetchLocals()
      .then((data) => {
        if (!alive) return;
        setPayload(data);
        setGeneratedAt(new Date());
        setError(null);
      })
      .catch((err: Error) => {
        if (alive) setError(err.message);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const result = useMemo(
    () =>
      buildTransfer(
        payload,
        policies.map((policy) => ({ id: policy.id, title: policy.title, date: policy.date })),
      ),
    [payload, policies],
  );

  const model = useMemo(
    () => (result ? buildReportModel(result, payload, policies, generatedAt) : null),
    [result, payload, policies, generatedAt],
  );

  // 预览与下载共用同一个字符串：两处各写一遍必然漂移。
  const html = useMemo(() => (result && model ? renderReportHtml(model, result) : ''), [result, model]);

  const openInNewWindow = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    // 新窗口加载完再回收，否则可能拿到空白页
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  const print = () => {
    const win = frameRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  };

  return (
    <section className="rpt-page">
      <header className="rpt-head">
        <div>
          <span className="rpt-kicker">RESEARCH REPORT · 研究报告</span>
          <h1>把央地传导的观察，写成一份能交出去的报告</h1>
          <p>
            报告按市场研究报告的体例组织：核心结论前置，图 1—5 依次回答"接没接、差几天、差在哪、能说到哪"，
            表 1—5 给出可核对的台账与口径。导出为自包含 HTML，可直接发出去，也可用浏览器打印成 A4 或 PDF。
          </p>
        </div>
        <div className="rpt-actions">
          <button type="button" onClick={() => model && result && downloadReportHtml(model, result)} disabled={!html}>
            <Download size={15} />
            下载报告
          </button>
          <button type="button" onClick={print} disabled={!html}>
            <Printer size={15} />
            打印 / 存 PDF
          </button>
          <button type="button" onClick={openInNewWindow} disabled={!html}>
            <ExternalLink size={15} />
            新窗口打开
          </button>
          <button type="button" className="ghost" onClick={reload} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'is-spinning' : undefined} />
            重新生成
          </button>
        </div>
      </header>

      {loading && (
        <div className="rpt-state">
          <RefreshCw size={18} className="is-spinning" />
          <span>正在读取地方语料并生成报告…</span>
        </div>
      )}

      {!loading && error && (
        <div className="rpt-state is-error">
          <FileText size={18} />
          <span>读取地方语料失败：{error}</span>
          <button type="button" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && !html && (
        <div className="rpt-state">
          <FileText size={18} />
          <span>
            地方语料尚未就绪（<code>/api/locals</code> 无可判数据）。先跑一次地方采集，或换用「央地传导」页核对数据源状态。
          </span>
        </div>
      )}

      {html && model && (
        <>
          <div className="rpt-facts">
            <span>
              <b>{model.counts.observable}</b> 组可判配对
            </span>
            <span>
              <b>{model.counts.respond}</b> 组确认跟进
            </span>
            <span>
              中位时滞 <b>{model.lag.median ?? '—'}</b> 天
            </span>
            <span>
              覆盖 <b>{model.units.length}</b> 个地方单元
            </span>
            <span className="rpt-facts-note">
              打印时选择「另存为 PDF」、纸张 A4、边距默认，即可得到可发送的报告文件。
            </span>
          </div>
          <iframe ref={frameRef} className="rpt-frame" title="研究报告预览" srcDoc={html} />
        </>
      )}
    </section>
  );
}
