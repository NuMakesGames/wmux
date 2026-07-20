import { AlertTriangle, Clipboard, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import {
  clearTerminalLatency,
  terminalLatency,
  type TerminalLatencyDistribution,
  type TerminalLatencySnapshot,
} from "./terminal-latency";
import type { DoctorReport } from "./types";

interface DiagnosticsModalProps {
  report: DoctorReport | null;
  loading: boolean;
  error: string;
  onRefresh: () => void;
  onClose: () => void;
}

export function DiagnosticsModal({ report, loading, error, onRefresh, onClose }: DiagnosticsModalProps) {
  const latency = useSyncExternalStore(terminalLatency.subscribe, terminalLatency.getSnapshot);
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
  const copyLatency = () => void navigator.clipboard.writeText(JSON.stringify(latency, null, 2)).catch(() => undefined);

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
        <div className="diagnostics-content">
          <LatencyDiagnostics snapshot={latency} onCopy={copyLatency} onClear={clearTerminalLatency} />
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
        </div>
      </section>
    </div>
  );
}

const formatLatency = (value: number | null): string => {
  if (value === null) return "—";
  return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
};

const formatChars = (value: number | null): string => value === null ? "—" : `${Math.round(value)} chars`;

function LatencyDiagnostics({
  snapshot,
  onCopy,
  onClear,
}: {
  snapshot: TerminalLatencySnapshot;
  onCopy: () => void;
  onClear: () => void;
}) {
  const rows: Array<{ label: string; metric: TerminalLatencyDistribution; unit?: "chars"; title: string }> = [
    {
      label: "Input dispatch",
      metric: snapshot.metrics.inputDispatch,
      title: "DOM key event to Ghostty terminal input callback",
    },
    {
      label: "Predicted paint",
      metric: snapshot.metrics.predictedPaint,
      title: "DOM key event to the first animation frame after speculative overlay mutation",
    },
    {
      label: "Predicted backspace",
      metric: snapshot.metrics.predictedBackspacePaint,
      title: "Backspace key event to the first animation frame after speculative overlay mutation",
    },
    {
      label: "Shell output",
      metric: snapshot.metrics.normalOutput,
      title: "Normal-screen input to the first sequence-acknowledged WebSocket output",
    },
    {
      label: "Shell canvas",
      metric: snapshot.metrics.normalRender,
      title: "Normal-screen input to Ghostty's post-canvas-render event",
    },
    {
      label: "Shell backspace",
      metric: snapshot.metrics.normalBackspaceRender,
      title: "Normal-screen Backspace input to Ghostty's post-canvas-render event",
    },
    {
      label: "Shell browser work",
      metric: snapshot.metrics.normalOutputToRender,
      title: "Normal-screen WebSocket output arrival to Ghostty's post-canvas-render event",
    },
    {
      label: "TUI output",
      metric: snapshot.metrics.alternateOutput,
      title: "Alternate-screen input to the first sequence-acknowledged WebSocket output",
    },
    {
      label: "TUI canvas",
      metric: snapshot.metrics.alternateRender,
      title: "Alternate-screen input to Ghostty's post-canvas-render event",
    },
    {
      label: "TUI backspace",
      metric: snapshot.metrics.alternateBackspaceRender,
      title: "Alternate-screen Backspace input to Ghostty's post-canvas-render event",
    },
    {
      label: "TUI browser work",
      metric: snapshot.metrics.alternateOutputToRender,
      title: "Alternate-screen WebSocket output arrival to Ghostty's post-canvas-render event",
    },
    {
      label: "Shell output size",
      metric: snapshot.metrics.normalOutputChars,
      unit: "chars",
      title: "Characters received before the sampled normal-screen render",
    },
    {
      label: "TUI output size",
      metric: snapshot.metrics.alternateOutputChars,
      unit: "chars",
      title: "Characters received before the sampled alternate-screen render",
    },
  ];

  return (
    <section className="latency-diagnostics" aria-label="Browser terminal latency">
      <div className="latency-diagnostics-header">
        <div>
          <span className="diagnostics-kicker">This browser</span>
          <h3>Terminal latency</h3>
        </div>
        <div className="diagnostics-actions">
          <button type="button" title="Copy latency measurements as JSON" onClick={onCopy}>
            <Clipboard size={15} />
          </button>
          <button type="button" title="Clear latency measurements" onClick={onClear}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>
      <p className="latency-diagnostics-note">
        Paint is approximated by the browser frame after prediction and Ghostty's post-canvas-render event; no input text is retained.
      </p>
      <div className="latency-summary">
        <span><strong>{snapshot.sampleCount}</strong> rendered samples</span>
        <span><strong>{snapshot.pendingCount}</strong> awaiting output</span>
        <span><strong>{snapshot.droppedCount}</strong> expired</span>
      </div>
      <div className="latency-table" role="table" aria-label="Terminal latency percentiles">
        <div className="latency-row latency-columns" role="row">
          <span>Stage</span><span>N</span><span>p50</span><span>p95</span><span>p99</span>
        </div>
        {rows.map(({ label, metric, unit, title }) => {
          const format = unit === "chars" ? formatChars : formatLatency;
          return (
            <div className="latency-row" role="row" key={label} title={title}>
              <span>{label}</span>
              <span>{metric.samples}</span>
              <span>{format(metric.p50)}</span>
              <span>{format(metric.p95)}</span>
              <span>{format(metric.p99)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
