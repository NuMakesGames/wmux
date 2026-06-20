import type { MachineConfig } from "./types.js";

export interface StreamStatus {
  machineId: string;
  path: string;
  live: boolean;
  viewerCount: number;
  startedAt?: string;
  webRtcUrl: string;
  publishRtspUrl: string;
  publishWhipUrl: string;
  reason?: string;
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

export const streamPathForMachine = (machineId: string): string =>
  `wmux-${machineId.replace(/[^A-Za-z0-9_-]/g, "-")}`;

export const resolveStreamStatuses = async (
  machines: MachineConfig[],
  host: string,
): Promise<StreamStatus[]> => {
  const base = mediaMtxBase(host);
  const paths = await readMediaMtxPaths(base.apiUrl).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : "MediaMTX status unavailable",
    items: [] as MediaMtxPath[],
  }));

  const pathItems = "items" in paths ? paths.items ?? [] : [];
  const errorReason = "error" in paths ? paths.error : undefined;
  const byName = new Map(pathItems.map((path) => [path.name, path]));
  return machines.map((machine) => {
    const path = streamPathForMachine(machine.id);
    const status = byName.get(path);
    const live = Boolean(status?.online ?? status?.ready);
    return {
      machineId: machine.id,
      path,
      live,
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
