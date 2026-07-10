import { AlertTriangle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";
import type { DoctorReport } from "./types";

interface DiagnosticsModalProps {
  report: DoctorReport | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function DiagnosticsModal({ report, loading, error, onRefresh, onClose }: DiagnosticsModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const hasIssues = Boolean(
    report && (report.summary.exitedPaneCount || report.summary.sessionIssueCount || report.panes.some((pane) => pane.issue)),
  );

  return (
    <div className="diagnostics-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="diagnostics-panel" role="dialog" aria-modal="true" aria-label="wmux diagnostics">
        <header className="diagnostics-header">
          <div>
            <span className="diagnostics-kicker">System</span>
            <h2>Diagnostics</h2>
          </div>
          <div className="diagnostics-actions">
            <button type="button" title="Refresh diagnostics" onClick={onRefresh} disabled={loading}>
              <RefreshCw size={16} className={loading ? "spin" : ""} />
            </button>
            <button type="button" title="Close diagnostics" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </header>
        {error ? <div className="diagnostics-error">{error}</div> : null}
        {report ? (
          <>
            <div className={`diagnostics-summary ${hasIssues ? "warning" : "healthy"}`}>
              {hasIssues ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
              <strong>{hasIssues ? "Review required" : "All pane drivers healthy"}</strong>
              <span>{report.summary.restartDurablePaneCount}/{report.summary.paneCount} restart-durable</span>
              <span>{report.summary.sessionIssueCount} session issues</span>
            </div>
            <div className="diagnostics-table" role="table" aria-label="Pane diagnostics">
              <div className="diagnostics-row diagnostics-columns" role="row">
                <span>Pane</span><span>Host</span><span>Driver</span><span>Durability</span><span>Status</span>
              </div>
              {report.panes.map((pane) => (
                <div className={`diagnostics-row ${pane.issue ? "issue" : ""}`} role="row" key={pane.paneId}>
                  <span title={pane.paneId}>{pane.title}</span>
                  <span>{pane.machineName}</span>
                  <span>{pane.transport}</span>
                  <span>{pane.restartDurable ? "restart-safe" : "process-local"}</span>
                  <span title={pane.issue}>{pane.issue ?? pane.status}</span>
                </div>
              ))}
            </div>
          </>
        ) : loading ? <div className="diagnostics-loading">Checking pane drivers...</div> : null}
      </section>
    </div>
  );
}
