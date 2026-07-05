import { authHeaders } from "./token";
import type { BootstrapPayload, DurableSessionAudit, SplitDirection, WmuxSettings } from "./types";

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}

export interface PaneAttachment {
  id: string;
  paneId: string;
  name: string;
  mimeType: string;
  bytes: number;
  url: string;
  createdAt: string;
}

const json = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
};

export interface AuthInfo {
  authEnabled: boolean;
  loginEnabled: boolean;
}

export const api = {
  bootstrap: () => json<BootstrapPayload>("/api/bootstrap"),
  authInfo: () => json<AuthInfo>("/api/auth-info"),
  login: async (username: string, password: string): Promise<{ token: string; expiresInMs: number }> => {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (response.status === 401) throw new Error("Invalid username or password");
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ token: string; expiresInMs: number }>;
  },
  streams: () => json<{ streams: BootstrapPayload["streams"] }>("/api/streams"),
  requestStream: (machineId: string, requestId: string, ttlMs: number) =>
    json<{ streams: BootstrapPayload["streams"] }>(`/api/streams/${encodeURIComponent(machineId)}/request`, {
      method: "POST",
      body: JSON.stringify({ requestId, ttlMs }),
    }),
  releaseStream: (machineId: string, requestId: string) =>
    json<{ streams: BootstrapPayload["streams"] }>(
      `/api/streams/${encodeURIComponent(machineId)}/request/${encodeURIComponent(requestId)}`,
      { method: "DELETE" },
    ),
  auditSessions: () => json<DurableSessionAudit>("/api/session-audit"),
  cleanupSession: (backend: "tmux" | "screen", name: string) =>
    json<DurableSessionAudit>(`/api/session-audit/${backend}/${encodeURIComponent(name)}`, { method: "DELETE" }),
  updateSettings: (settings: WmuxSettings) =>
    json<{ settings: WmuxSettings; state: BootstrapPayload }>("/api/settings", {
      method: "POST",
      body: JSON.stringify(settings),
    }),
  createWorkspace: (machineId: string) =>
    json<{ workspace: BootstrapPayload["workspaces"][number]; state: BootstrapPayload }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({ machineId }),
    }),
  activateWorkspace: (workspaceId: string) =>
    json<BootstrapPayload>(`/api/workspaces/${workspaceId}/active`, { method: "POST" }),
  closeWorkspace: (workspaceId: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}`, { method: "DELETE" }),
  setWorkspaceTitle: (workspaceId: string, title: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}/title`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  setWorkspaceAutoTitle: (workspaceId: string, title: string, descriptor?: string, tabId?: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}/auto-title`, {
      method: "POST",
      body: JSON.stringify({ title, descriptor, tabId, tabOnlyIfMultiple: true }),
    }),
  createTab: (workspaceId: string, machineId: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}/tabs`, {
      method: "POST",
      body: JSON.stringify({ machineId }),
    }),
  activateTab: (workspaceId: string, tabId: string) =>
    json<BootstrapPayload>(`/api/workspaces/${workspaceId}/tabs/${tabId}/active`, {
      method: "POST",
    }),
  closeTab: (workspaceId: string, tabId: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}/tabs/${tabId}`, {
      method: "DELETE",
    }),
  setTabTitle: (workspaceId: string, tabId: string, title: string) =>
    json<{ state: BootstrapPayload }>(`/api/workspaces/${workspaceId}/tabs/${tabId}/title`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  splitPane: (tabId: string, paneId: string, direction: SplitDirection, machineId?: string) =>
    json<{ state: BootstrapPayload }>(`/api/tabs/${tabId}/split`, {
      method: "POST",
      body: JSON.stringify({ paneId, direction, ...(machineId ? { machineId } : {}) }),
    }),
  updateSplitRatio: (tabId: string, path: string, ratio: number) =>
    json<{ state: BootstrapPayload }>(`/api/tabs/${tabId}/split-ratio`, {
      method: "POST",
      body: JSON.stringify({ path, ratio }),
    }),
  activatePane: (tabId: string, paneId: string) =>
    json<BootstrapPayload>(`/api/tabs/${tabId}/panes/${paneId}/active`, { method: "POST" }),
  closePane: (tabId: string, paneId: string) =>
    json<{ state: BootstrapPayload }>(`/api/tabs/${tabId}/panes/${paneId}`, { method: "DELETE" }),
  sendPaneInput: (paneId: string, data: string, cols = 96, rows = 32) =>
    json<BootstrapPayload>(`/api/panes/${encodeURIComponent(paneId)}/input`, {
      method: "POST",
      body: JSON.stringify({ data, cols, rows }),
    }),
  uploadPaneAttachment: (paneId: string, attachment: { name: string; mimeType: string; data: string }) =>
    json<{ attachment: PaneAttachment }>(`/api/panes/${encodeURIComponent(paneId)}/attachments`, {
      method: "POST",
      body: JSON.stringify(attachment),
    }),
  createNotification: (paneId: string, title: string, subtitle: string, body: string) =>
    json<{ state: BootstrapPayload }>("/api/notifications", {
      method: "POST",
      body: JSON.stringify({ paneId, title, subtitle, body }),
    }),
  markNotificationRead: (notificationId: string) =>
    json<BootstrapPayload>(`/api/notifications/${notificationId}/read`, { method: "POST" }),
  markWorkspaceNotificationsRead: (workspaceId: string) =>
    json<BootstrapPayload>(`/api/workspaces/${workspaceId}/notifications/read`, { method: "POST" }),
};
