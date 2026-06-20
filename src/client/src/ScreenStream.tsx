import { ExternalLink, ScreenShare, X } from "lucide-react";
import type { MachineStatus, StreamStatus } from "./types";

interface ScreenStreamViewerProps {
  machine: MachineStatus | undefined;
  stream: StreamStatus | undefined;
  onClose: () => void;
}

export function ScreenStreamViewer({ machine, stream, onClose }: ScreenStreamViewerProps) {
  const machineId = machine?.id ?? stream?.machineId ?? "unknown";
  const machineName = machine?.name ?? machineId;
  const streamUrl = stream ? `${stream.webRtcUrl}?controls=false&muted=true&autoplay=true&playsInline=true` : "";

  return (
    <div className="stream-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <section className="stream-panel" role="dialog" aria-modal="true" aria-label={`${machineName} screen stream`}>
        <div className="stream-header">
          <div>
            <h2>{machineName} stream</h2>
            <span className={`stream-status ${stream?.live ? "live" : "waiting"}`}>
              {stream?.live ? "live" : "waiting for agent"}
              {stream ? ` / ${stream.viewerCount} viewer${stream.viewerCount === 1 ? "" : "s"}` : ""}
            </span>
          </div>
          <div className="stream-actions">
            {stream ? (
              <a className="stream-link" href={stream.webRtcUrl} target="_blank" rel="noreferrer" title="Open MediaMTX stream">
                <ExternalLink size={15} />
                <span>open</span>
              </a>
            ) : null}
            <button type="button" title="Close stream" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="stream-video-shell">
          {stream?.live ? (
            <iframe className="stream-frame" src={streamUrl} title={`${machineName} WebRTC stream`} allow="autoplay; fullscreen; picture-in-picture" />
          ) : (
            <div className="stream-empty">
              <ScreenShare size={30} />
              <strong>No active pixel stream</strong>
              <span>
                Start `wmux-stream-agent --machine {machineId}` on {machineName} from that machine's graphical login session.
              </span>
              {stream?.reason ? <span>{stream.reason}</span> : null}
            </div>
          )}
        </div>
        {stream ? (
          <div className="stream-agent-hint">
            <span>RTSP publish</span>
            <code>{stream.publishRtspUrl}</code>
            <span>WHIP publish</span>
            <code>{stream.publishWhipUrl}</code>
          </div>
        ) : null}
      </section>
    </div>
  );
}
