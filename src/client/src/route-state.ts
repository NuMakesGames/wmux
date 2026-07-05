import type { BootstrapPayload, SurfaceTab } from "./types";

export interface RouteTarget {
  workspaceId: string;
  tabId?: string;
}

export const workspaceTabPath = (workspaceId: string, tabId: string): string =>
  `/workspaces/${encodeURIComponent(workspaceId)}/tabs/${encodeURIComponent(tabId)}`;

/** Parse a `/workspaces/:id(/tabs/:id)?` pathname into a route target, or null. */
export const parseRouteTarget = (pathname: string): RouteTarget | null => {
  const match = pathname.match(/^\/workspaces\/([^/]+)(?:\/tabs\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    workspaceId: decodeURIComponent(match[1]),
    tabId: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
};

export const findWorkspaceTab = (
  payload: BootstrapPayload,
  workspaceId: string,
  tabId?: string,
): { workspace: BootstrapPayload["workspaces"][number]; tab: SurfaceTab } | null => {
  const workspace = payload.workspaces.find((candidate) => candidate.id === workspaceId);
  if (!workspace) return null;
  const tab = tabId
    ? workspace.tabs.find((candidate) => candidate.id === tabId)
    : workspace.tabs.find((candidate) => candidate.id === workspace.activeTabId) ?? workspace.tabs[0];
  return tab ? { workspace, tab } : null;
};

export const markWorkspaceNotificationsReadInState = (
  payload: BootstrapPayload,
  workspaceId: string,
): BootstrapPayload => {
  let changed = false;
  const notifications = payload.notifications.map((notification) => {
    if (notification.workspaceId !== workspaceId || notification.read) return notification;
    changed = true;
    return { ...notification, read: true };
  });
  return changed ? { ...payload, notifications } : payload;
};

export const activateWorkspaceTabInState = (
  payload: BootstrapPayload,
  workspaceId: string,
  tabId: string,
): BootstrapPayload => {
  const target = findWorkspaceTab(payload, workspaceId, tabId);
  if (!target) return payload;
  const nextPayload = markWorkspaceNotificationsReadInState(payload, workspaceId);
  if (nextPayload.activeWorkspaceId === workspaceId && target.workspace.activeTabId === tabId) return nextPayload;
  return {
    ...nextPayload,
    activeWorkspaceId: workspaceId,
    workspaces: nextPayload.workspaces.map((workspace) =>
      workspace.id === workspaceId ? { ...workspace, activeTabId: tabId } : workspace,
    ),
  };
};

export const applyRouteTargetToState = (
  payload: BootstrapPayload,
  target: RouteTarget | null,
): BootstrapPayload => {
  if (!target) return payload;
  const route = findWorkspaceTab(payload, target.workspaceId, target.tabId);
  return route ? activateWorkspaceTabInState(payload, route.workspace.id, route.tab.id) : payload;
};
