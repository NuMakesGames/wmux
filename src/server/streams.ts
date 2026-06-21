import { EventEmitter } from "node:events";
import type { MachineConfig } from "./types.js";

export interface StreamStatus {
  machineId: string;
  path: string;
  live: boolean;
  requested: boolean;
  requestCount: number;
  requestedUntil?: string;
  viewerCount: number;
  startedAt?: string;
  webRtcUrl: string;
  publishRtspUrl: string;
  publishWhipUrl: string;
  reason?: string;
}

export interface StreamRequestStatus {
  machineId: string;
  requested: boolean;
  requestCount: number;
  requestedUntil?: string;
}

interface MediaMtxPath {
  name?: string;
  online?: boolean;
  ready?: boolean;
  onlineTime?: string;
  readyTime?: string;
  readers?: unknown[];
}

interface MediaMtxPathList {
  items?: MediaMtxPath[];
}

const DEFAULT_REQUEST_TTL_MS = 20_000;
const MIN_REQUEST_TTL_MS = 5_000;
const MAX_REQUEST_TTL_MS = 60_000;

export class StreamRequestStore extends EventEmitter {
  private requests = new Map<string, Map<string, number>>();

  touch(machineId: string, requestId: string, ttlMs = DEFAULT_REQUEST_TTL_MS): StreamRequestStatus {
    const cleanRequestId = requestId.trim();
    if (!cleanRequestId) throw new Error("missing_request_id");
    const previous = this.snapshot(machineId);
    const machineRequests = this.requests.get(machineId) ?? new Map<string, number>();
    const requestedTtl = Number.isFinite(ttlMs) ? ttlMs : DEFAULT_REQUEST_TTL_MS;
    const ttl = Math.min(MAX_REQUEST_TTL_MS, Math.max(MIN_REQUEST_TTL_MS, Math.floor(requestedTtl)));
    machineRequests.set(cleanRequestId, Date.now() + ttl);
    this.requests.set(machineId, machineRequests);
    const next = this.snapshot(machineId);
    if (previous.requested !== next.requested || previous.requestCount !== next.requestCount) this.emit("change", next);
    return next;
  }

  release(machineId: string, requestId: string): StreamRequestStatus {
    const previous = this.snapshot(machineId);
    const machineRequests = this.requests.get(machineId);
    if (machineRequests) {
      machineRequests.delete(requestId);
      if (machineRequests.size === 0) this.requests.delete(machineId);
    }
    const next = this.snapshot(machineId);
    if (previous.requested !== next.requested || previous.requestCount !== next.requestCount) this.emit("change", next);
    return next;
  }

  snapshot(machineId: string): StreamRequestStatus {
    const machineRequests = this.prune(machineId);
    const expirations = [...machineRequests.values()];
    const requestedUntil = expirations.length > 0 ? new Date(Math.max(...expirations)).toISOString() : undefined;
    return {
      machineId,
      requested: expirations.length > 0,
      requestCount: expirations.length,
      requestedUntil,
    };
  }

  snapshotMany(machineIds: string[]): Map<string, StreamRequestStatus> {
    return new Map(machineIds.map((machineId) => [machineId, this.snapshot(machineId)]));
  }

  private prune(machineId: string): Map<string, number> {
    const machineRequests = this.requests.get(machineId) ?? new Map<string, number>();
    const now = Date.now();
    let changed = false;
    for (const [requestId, expiresAt] of machineRequests.entries()) {
      if (expiresAt <= now) {
        machineRequests.delete(requestId);
        changed = true;
      }
    }
    if (machineRequests.size === 0) {
      this.requests.delete(machineId);
    } else {
      this.requests.set(machineId, machineRequests);
    }
    if (changed) {
      this.emit("change", this.snapshot(machineId));
    }
    return machineRequests;
  }
}

export const streamPathForMachine = (machineId: string): string =>
  `wmux-${machineId.replace(/[^A-Za-z0-9_-]/g, "-")}`;

export const resolveStreamStatuses = async (
  machines: MachineConfig[],
  host: string,
  requests?: StreamRequestStore,
): Promise<StreamStatus[]> => {
  const base = mediaMtxBase(host);
  const paths = await readMediaMtxPaths(base.apiUrl).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "MediaMTX status unavailable",
    items: [] as MediaMtxPath[],
  }));

  const pathItems = "items" in paths ? paths.items ?? [] : [];
  const errorReason = "error" in paths ? paths.error : undefined;
  const byName = new Map(pathItems.map((path) => [path.name, path]));
  const requestStatuses = requests?.snapshotMany(machines.map((machine) => machine.id)) ?? new Map<string, StreamRequestStatus>();
  return machines.map((machine) => {
    const path = streamPathForMachine(machine.id);
    const status = byName.get(path);
    const live = Boolean(status?.online ?? status?.ready);
    const requestStatus = requestStatuses.get(machine.id) ?? {
      machineId: machine.id,
      requested: false,
      requestCount: 0,
    };
    return {
      machineId: machine.id,
      path,
      live,
      requested: requestStatus.requested,
      requestCount: requestStatus.requestCount,
      requestedUntil: requestStatus.requestedUntil,
      viewerCount: status?.readers?.length ?? 0,
      startedAt: status?.onlineTime ?? status?.readyTime,
      webRtcUrl: `${base.webRtcOrigin}/${path}`,
      publishRtspUrl: `rtsp://${base.host}:8554/${path}`,
      publishWhipUrl: `${base.webRtcOrigin}/${path}/whip`,
      reason: live ? undefined : errorReason,
    };
  });
};

const readMediaMtxPaths = async (apiUrl: string): Promise<MediaMtxPathList> => {
  const response = await fetch(`${apiUrl}/v3/paths/list`);
  if (!response.ok) throw new Error(`MediaMTX API returned ${response.status}`);
  return (await response.json()) as MediaMtxPathList;
};

const mediaMtxBase = (host: string): { host: string; apiUrl: string; webRtcOrigin: string } => {
  const mediaHost = process.env.WMUX_STREAM_HOST || host;
  const apiUrl = process.env.WMUX_MEDIAMTX_API_URL || "http://127.0.0.1:9997";
  const webRtcOrigin = process.env.WMUX_MEDIAMTX_WEBRTC_ORIGIN || `http://${mediaHost}:8889`;
  return { host: mediaHost, apiUrl, webRtcOrigin };
};
