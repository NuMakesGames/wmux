import { useEffect, useRef, useState } from "react";
import { FitAddon, Terminal } from "ghostty-web";
import { Columns2, Maximize2, Rows2, X } from "lucide-react";
import { ensureGhostty } from "./terminal-loader";
import type { MachineStatus, PaneState, SplitDirection, TerminalMedia } from "./types";

interface Props {
  pane: PaneState;
  active: boolean;
  unreadCount: number;
  machines: MachineStatus[];
  splitMachineId: string;
  terminalFontSize: number;
  canClose: boolean;
  mediaItems: TerminalMedia[];
  onActivate: () => void;
  onSplit: (direction: SplitDirection, machineId: string) => void;
  onClose: () => void;
  onDismissMedia: (mediaId: string) => void;
}

export function TerminalPane({
  pane,
  active,
  unreadCount,
  machines,
  splitMachineId,
  terminalFontSize,
  canClose,
  mediaItems,
  onActivate,
  onSplit,
  onClose,
  onDismissMedia,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let fitAddon: FitAddon | null = null;
    const start = async () => {
      await ensureGhostty();
      if (cancelled || !containerRef.current) return;
      const term = new Terminal({
        cursorBlink: true,
        fontSize: terminalFontSize,
        fontFamily: 'Menlo, Monaco, "Cascadia Mono", "Courier New", monospace',
        scrollback: 10000,
        theme: {
          background: "#101114",
          foreground: "#d8dee9",
          cursor: "#f7c95c",
          selectionBackground: "#31445f",
        },
      });
      fitAddon = new FitAddon();
      fitAddonRef.current = fitAddon;
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      terminalRef.current = term;
      await waitForVisibleBox(containerRef.current);
      fitAddon.fit();
      paintBlankGrid(term);
      fitAddon.observeResize();

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/panes/${pane.id}?cols=${safeCols(term.cols)}&rows=${safeRows(term.rows)}`,
      );
      socketRef.current = ws;

      term.attachCustomKeyEventHandler((event) => {
        if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          if (event.key === "ArrowLeft") {
            sendInput(ws, "\x1bb");
            return true;
          }
          if (event.key === "ArrowRight") {
            sendInput(ws, "\x1bf");
            return true;
          }
        }
        return false;
      });

      term.onData((data) => {
        sendInput(ws, data);
      });
      term.onResize((size) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
        }
      });
      ws.onopen = () => setConnected(true);
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "ready" && message.replay) term.write(message.replay);
        if (message.type === "ready" && !message.replay) paintBlankGrid(term);
        if (message.type === "output") term.write(message.data);
        if (message.type === "exit") term.write(`\r\n[wmux] process exited with code ${message.code}\r\n`);
        if (message.type === "removed") ws.close();
      };
    };
    void start();

    return () => {
      cancelled = true;
      socketRef.current?.close();
      fitAddon?.dispose();
      terminalRef.current?.dispose();
      socketRef.current = null;
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [pane.id]);

  useEffect(() => {
    const term = terminalRef.current;
    if (!term?.renderer) return;
    term.renderer.setFontSize(terminalFontSize);
    requestAnimationFrame(() => {
      fitAddonRef.current?.fit();
    });
  }, [terminalFontSize]);

  const currentMachine = machines.find((machine) => machine.id === pane.machineId);
  const selectedMachine = machines.find((machine) => machine.id === splitMachineId);
  const canSplit = selectedMachine?.reachable ?? false;

  return (
    <section
      className={`terminal-pane ${active ? "active" : ""} ${unreadCount > 0 ? "unread" : ""} ${
        mediaItems.length > 0 ? "has-media" : ""
      }`}
      onMouseDown={onActivate}
    >
      <div className="pane-toolbar">
        <div className="pane-title">
          <span className={`status-dot ${connected ? "on" : ""}`} />
          <span>{pane.title}</span>
          <span className="machine-label">{currentMachine?.name ?? pane.machineId}</span>
          {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}
        </div>
        <div className="pane-actions">
          <button title={`Split right on ${selectedMachine?.name ?? splitMachineId}`} disabled={!canSplit} onClick={() => onSplit("vertical", splitMachineId)}>
            <Columns2 size={16} />
          </button>
          <button title={`Split down on ${selectedMachine?.name ?? splitMachineId}`} disabled={!canSplit} onClick={() => onSplit("horizontal", splitMachineId)}>
            <Rows2 size={16} />
          </button>
          <button title="Focus pane" onClick={onActivate}>
            <Maximize2 size={15} />
          </button>
          <button title="Close pane" disabled={!canClose} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="terminal-host" />
      {mediaItems.length > 0 ? (
        <div className="media-shelf">
          {mediaItems.slice(0, 3).map((item) => (
            <MediaPreview key={item.id} item={item} onDismiss={() => onDismissMedia(item.id)} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MediaPreview({ item, onDismiss }: { item: TerminalMedia; onDismiss: () => void }) {
  const src = `data:${item.mimeType};base64,${item.data}`;
  return (
    <figure className="media-preview">
      <div className="media-preview-header">
        <span>{item.name}</span>
        <button title="Dismiss media" onClick={onDismiss}>
          <X size={14} />
        </button>
      </div>
      {renderMedia(item, src)}
    </figure>
  );
}

const renderMedia = (item: TerminalMedia, src: string) => {
  if (item.mimeType.startsWith("image/") && item.mimeType !== "image/svg+xml") {
    return <img src={src} alt={item.name} />;
  }
  if (item.mimeType.startsWith("audio/")) {
    return <audio controls src={src} />;
  }
  if (item.mimeType.startsWith("video/")) {
    return <video controls src={src} />;
  }
  return (
    <a className="media-download" download={item.name} href={src}>
      Download {item.mimeType}
    </a>
  );
};

const safeCols = (cols: number): number => (Number.isFinite(cols) && cols >= 2 ? Math.floor(cols) : 80);
const safeRows = (rows: number): number => (Number.isFinite(rows) && rows >= 1 ? Math.floor(rows) : 24);

const sendInput = (ws: WebSocket, data: string): void => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "input", data }));
};

const paintBlankGrid = (term: Terminal): void => {
  const cols = safeCols(term.cols);
  const rows = safeRows(term.rows);
  const line = " ".repeat(cols);
  term.write(`\x1b[2J\x1b[3J\x1b[H${Array.from({ length: rows }, () => line).join("\r\n")}\x1b[H`);
};

const waitForVisibleBox = (element: HTMLElement): Promise<void> =>
  new Promise((resolve) => {
    const hasSize = () => element.clientWidth > 0 && element.clientHeight > 0;
    if (hasSize()) {
      resolve();
      return;
    }
    let frames = 0;
    const tick = () => {
      frames += 1;
      if (hasSize() || frames > 10) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
