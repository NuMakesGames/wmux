import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, CheckCheck, CirclePlus, Link2, PanelLeft, Plus, Server, Settings, TerminalSquare, X } from "lucide-react";
import { api } from "./api";
import { LayoutView } from "./LayoutView";
import type {
  BootstrapPayload,
  LayoutNode,
  MachineStatus,
  SplitDirection,
  TerminalMedia,
  TerminalNotification,
  WmuxSettings,
} from "./types";

const defaultSettings: WmuxSettings = {
  terminalFontSize: 14,
  machineAliases: {},
};

export function App() {
  const [state, setState] = useState<BootstrapPayload | null>(null);
  const [newMachineId, setNewMachineId] = useState("local");
  const [error, setError] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mediaItems, setMediaItems] = useState<TerminalMedia[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<WmuxSettings | null>(null);
  const seenNotificationIds = useRef(new Set<string>());
  const lastSyncedPath = useRef("");

  useEffect(() => {
    api
      .bootstrap()
      .then(async (payload) => {
        for (const notification of payload.notifications) seenNotificationIds.current.add(notification.id);
        const routed = await activateRouteTarget(payload);
        setState(routed);
      })
      .catch((nextError) => setError(String(nextError)));
  }, []);

  useEffect(() => {
    let closed = false;
    let reconnectTimer: number | undefined;
    let socket: WebSocket | null = null;
    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/events`);
      socket = ws;
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "notification") {
          const notification = message.notification as TerminalNotification;
          seenNotificationIds.current.add(notification.id);
          showBrowserNotification(notification);
        }
        if (message.type === "media") {
          const media = message.media as TerminalMedia;
          setMediaItems((items) => [media, ...items.filter((item) => item.id !== media.id)].slice(0, 20));
        }
        if (message.type === "state" || message.type === "notification") {
          api.bootstrap().then(setState).catch((nextError) => setError(String(nextError)));
        }
      };
      ws.onclose = () => {
        if (!closed) reconnectTimer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  const activeWorkspace = useMemo(
    () => state?.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state?.workspaces[0],
    [state],
  );
  const activeTab = activeWorkspace?.tabs.find((tab) => tab.id === activeWorkspace.activeTabId) ?? activeWorkspace?.tabs[0];
  const machines = state?.machines ?? [];
  const persistedSettings = state?.settings ?? defaultSettings;
  const settings = previewSettings ?? persistedSettings;
  const displayMachines = useMemo(() => machines.map((machine) => withMachineAlias(machine, settings)), [machines, settings]);
  const notifications = state?.notifications ?? [];
  const unreadNotifications = notifications.filter((notification) => !notification.read);
  const unreadByPaneId = useMemo(() => countUnreadBy(notifications, "paneId"), [notifications]);
  const unreadByTabId = useMemo(() => countUnreadBy(notifications, "tabId"), [notifications]);
  const unreadByWorkspaceId = useMemo(() => countUnreadBy(notifications, "workspaceId"), [notifications]);
  const latestUnreadByWorkspaceId = useMemo(() => latestUnreadByWorkspace(notifications), [notifications]);
  const mediaByPaneId = useMemo(() => groupMediaByPane(mediaItems), [mediaItems]);

  const refresh = async (nextState?: BootstrapPayload) => {
    setState(nextState ?? (await api.bootstrap()));
  };

  const updateSettings = async (nextSettings: WmuxSettings) => {
    const response = await api.updateSettings(nextSettings);
    setPreviewSettings(null);
    setState(response.state);
    setSettingsOpen(false);
  };

  const cancelSettings = () => {
    setPreviewSettings(null);
    setSettingsOpen(false);
  };

  useEffect(() => {
    if (!state || !activeWorkspace || !activeTab) return;
    const nextPath = workspaceTabPath(activeWorkspace.id, activeTab.id);
    if (window.location.pathname === nextPath) {
      lastSyncedPath.current = nextPath;
      return;
    }
    const replace = lastSyncedPath.current === "" || window.location.pathname !== lastSyncedPath.current;
    window.history[replace ? "replaceState" : "pushState"](null, "", nextPath);
    lastSyncedPath.current = nextPath;
  }, [state, activeWorkspace, activeTab]);

  useEffect(() => {
    const onPopState = () => {
      api.bootstrap()
        .then(activateRouteTarget)
        .then(setState)
        .catch((nextError) => setError(String(nextError)));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const selectedMachine = displayMachines.find((machine) => machine.id === newMachineId) ?? displayMachines[0];

  const createWorkspace = async (machineId: string) => {
    await api.createWorkspace(machineId);
    await refresh();
  };

  const activateWorkspaceLink = async (event: React.MouseEvent<HTMLAnchorElement>, workspaceId: string, tabId: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    window.history.pushState(null, "", workspaceTabPath(workspaceId, tabId));
    lastSyncedPath.current = window.location.pathname;
    await refresh(await activateRouteTarget(await api.bootstrap()));
  };

  const copyActiveLink = async () => {
    if (!activeWorkspace || !activeTab) return;
    const url = new URL(workspaceTabPath(activeWorkspace.id, activeTab.id), window.location.origin);
    await navigator.clipboard?.writeText(url.toString());
  };

  const createTab = async (machineId: string) => {
    if (!activeWorkspace) return;
    const response = await api.createTab(activeWorkspace.id, machineId);
    await refresh(response.state);
  };

  const splitPane = async (paneId: string, direction: SplitDirection, machineId: string) => {
    if (!activeTab) return;
    const response = await api.splitPane(activeTab.id, paneId, direction, machineId);
    await refresh(response.state);
  };

  const closePane = async (paneId: string) => {
    if (!activeTab || activeTab.panes.length <= 1) return;
    const response = await api.closePane(activeTab.id, paneId);
    await refresh(response.state);
  };

  const closeActiveTab = async () => {
    if (!activeWorkspace || !activeTab || activeWorkspace.tabs.length <= 1) return;
    const response = await api.closeTab(activeWorkspace.id, activeTab.id);
    await refresh(response.state);
  };

  const closeActiveWorkspace = async () => {
    if (!state || !activeWorkspace || state.workspaces.length <= 1) return;
    const response = await api.closeWorkspace(activeWorkspace.id);
    await refresh(response.state);
  };

  const activateWorkspaceAt = async (index: number) => {
    if (!state) return;
    const workspace = state.workspaces[index];
    if (workspace) await refresh(await api.activateWorkspace(workspace.id));
  };

  const activateWorkspaceRelative = async (delta: number) => {
    if (!state || !activeWorkspace) return;
    const current = state.workspaces.findIndex((workspace) => workspace.id === activeWorkspace.id);
    if (current === -1) return;
    const next = modulo(current + delta, state.workspaces.length);
    await activateWorkspaceAt(next);
  };

  const activateTabAt = async (index: number) => {
    if (!activeWorkspace) return;
    const tab = activeWorkspace.tabs[index];
    if (tab) await refresh(await api.activateTab(activeWorkspace.id, tab.id));
  };

  const activateTabRelative = async (delta: number) => {
    if (!activeWorkspace || !activeTab) return;
    const current = activeWorkspace.tabs.findIndex((tab) => tab.id === activeTab.id);
    if (current === -1) return;
    const next = modulo(current + delta, activeWorkspace.tabs.length);
    await activateTabAt(next);
  };

  const focusPaneRelative = async (delta: number) => {
    if (!activeTab) return;
    const paneIds = flattenPaneIds(activeTab.layout);
    const current = paneIds.indexOf(activeTab.activePaneId);
    if (current === -1 || paneIds.length < 2) return;
    const nextPaneId = paneIds[modulo(current + delta, paneIds.length)];
    await refresh(await api.activatePane(activeTab.id, nextPaneId));
  };

  const jumpLatestUnread = async () => {
    const latest = notifications.find((notification) => !notification.read);
    if (!latest) return;
    await refresh(await api.activateWorkspace(latest.workspaceId));
    await refresh(await api.activateTab(latest.workspaceId, latest.tabId));
    await refresh(await api.activatePane(latest.tabId, latest.paneId));
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (settingsOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const key = event.key.toLowerCase();
      const digit = /^[1-9]$/.test(key) ? Number(key) : null;
      const primary = event.metaKey || event.ctrlKey;
      const primaryOnly = primary && !event.altKey && !(event.metaKey && event.ctrlKey);
      const primaryWithAlt = primary && event.altKey && !(event.metaKey && event.ctrlKey);

      const run = (action: () => void | Promise<void>) => {
        event.preventDefault();
        event.stopPropagation();
        void action();
      };

      if (primaryOnly && key === "b") {
        run(() => setSidebarCollapsed((value) => !value));
        return;
      }

      if (primaryOnly && !event.shiftKey && key === "n") {
        run(() => createWorkspace(newMachineId));
        return;
      }

      if (primaryOnly && !event.shiftKey && key === "t") {
        run(() => createTab(newMachineId));
        return;
      }

      if (primaryOnly && key === "w") {
        run(() => (event.shiftKey ? closeActiveWorkspace() : closeActiveTab()));
        return;
      }

      if (primaryOnly && key === "d") {
        const pane = activeTab?.panes.find((candidate) => candidate.id === activeTab.activePaneId);
        if (!pane) return;
        run(() => splitPane(pane.id, event.shiftKey ? "horizontal" : "vertical", newMachineId));
        return;
      }

      if (primaryWithAlt && key.startsWith("arrow")) {
        run(() => focusPaneRelative(key === "arrowleft" || key === "arrowup" ? -1 : 1));
        return;
      }

      if (((event.metaKey && event.ctrlKey) || (event.altKey && event.ctrlKey && !event.metaKey)) && (event.key === "]" || event.key === "[")) {
        run(() => activateWorkspaceRelative(event.key === "]" ? 1 : -1));
        return;
      }

      if (primaryOnly && event.shiftKey && (event.key === "]" || event.key === "[")) {
        run(() => activateTabRelative(event.key === "]" ? 1 : -1));
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === "tab") {
        run(() => activateTabRelative(event.shiftKey ? -1 : 1));
        return;
      }

      if (primaryOnly && digit !== null) {
        if (!state) return;
        run(() => activateWorkspaceAt(digit === 9 ? state.workspaces.length - 1 : digit - 1));
        return;
      }

      if (event.altKey && !event.metaKey && digit !== null) {
        if (!activeWorkspace) return;
        run(() => activateTabAt(digit === 9 ? activeWorkspace.tabs.length - 1 : digit - 1));
        return;
      }

      if (primaryOnly && event.shiftKey && key === "u") {
        run(jumpLatestUnread);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [activeTab, activeWorkspace, state, newMachineId, notifications, settingsOpen]);

  const enableBrowserNotifications = async () => {
    if (!("Notification" in window) || Notification.permission !== "default") return;
    await Notification.requestPermission();
  };

  const markWorkspaceRead = async () => {
    if (!activeWorkspace) return;
    await refresh(await api.markWorkspaceNotificationsRead(activeWorkspace.id));
  };

  if (error) return <div className="load-state">wmux failed to load: {error}</div>;
  if (!state || !activeWorkspace || !activeTab) return <div className="load-state">Loading wmux...</div>;

  return (
    <main className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <PanelLeft size={18} />
          <span>wmux</span>
        </div>
        <div className="target-host">
          <div className="target-host-label">
            <span>Target host</span>
            <span className={`reach-dot ${selectedMachine?.reachable ? "on" : ""}`} />
          </div>
          <div className="new-session">
            <select title="Target host for new workspaces, tabs, and splits" value={newMachineId} onChange={(event) => setNewMachineId(event.target.value)}>
            {displayMachines.map((machine) => (
              <option key={machine.id} value={machine.id} disabled={!machine.reachable}>
                {machine.name}
              </option>
              ))}
            </select>
            <button
              title={`New workspace on ${selectedMachine?.name ?? newMachineId}`}
              disabled={!selectedMachine?.reachable}
              onClick={() => createWorkspace(newMachineId)}
            >
              <CirclePlus size={17} />
            </button>
          </div>
        </div>
        <div className="sidebar-label">Workspaces</div>
        <nav className="workspace-list">
            {state.workspaces.map((workspace) => {
              const machine = machineFor(displayMachines, workspace.machineId);
              const sourceMachine = machineFor(machines, workspace.machineId);
              const unreadCount = unreadByWorkspaceId.get(workspace.id) ?? 0;
              const latestUnread = latestUnreadByWorkspaceId.get(workspace.id);
              const descriptor =
                latestUnread?.body ||
                latestUnread?.subtitle ||
                displayWorkspaceDescriptor(workspace.descriptor, machine, sourceMachine, workspace.machineId);
              const tab = workspace.tabs.find((candidate) => candidate.id === workspace.activeTabId) ?? workspace.tabs[0];
              if (!tab) return null;
              return (
              <a
                key={workspace.id}
                href={workspaceTabPath(workspace.id, tab.id)}
                className={`workspace-item ${workspace.id === activeWorkspace.id ? "active" : ""} ${
                  machine?.reachable ? "" : "disabled"
                }`}
                onClick={(event) => activateWorkspaceLink(event, workspace.id, tab.id)}
                >
                  <span className={`reach-dot ${machine?.reachable ? "on" : ""}`} />
                  <span className="workspace-title">{workspace.name}</span>
                  {unreadCount > 0 ? <span className="badge workspace-badge">{unreadCount}</span> : null}
                  <span className="workspace-meta">{descriptor}</span>
                </a>
              );
            })}
        </nav>
        <div className="sidebar-label host-label">Host status</div>
        <div className="machine-list">
          {displayMachines.map((machine) => (
            <div key={machine.id} className="machine-row" title={machine.reason ?? machine.kind}>
              <Server size={14} />
              <span>{machine.name}</span>
              <span className={`reach-dot ${machine.reachable ? "on" : ""}`} />
            </div>
          ))}
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="tabs">
            {activeWorkspace.tabs.map((tab) => (
              <a
                key={tab.id}
                href={workspaceTabPath(activeWorkspace.id, tab.id)}
                className={`tab ${tab.id === activeTab.id ? "active" : ""} ${(unreadByTabId.get(tab.id) ?? 0) > 0 ? "unread" : ""}`}
                onClick={(event) => activateWorkspaceLink(event, activeWorkspace.id, tab.id)}
              >
                <TerminalSquare size={15} />
                <span>{tab.title}</span>
                {(unreadByTabId.get(tab.id) ?? 0) > 0 ? <span className="badge">{unreadByTabId.get(tab.id)}</span> : null}
              </a>
            ))}
            <button
              className="icon-button"
              title={`New tab on ${selectedMachine?.name ?? newMachineId}`}
              disabled={!selectedMachine?.reachable}
              onClick={() => createTab(newMachineId)}
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="machine-picker">
            <button
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings size={16} />
            </button>
            <button
              title="Copy active session link"
              disabled={!navigator.clipboard}
              onClick={copyActiveLink}
            >
              <Link2 size={16} />
            </button>
            <button
              title="Enable browser notifications"
              disabled={!("Notification" in window) || Notification.permission !== "default"}
              onClick={enableBrowserNotifications}
            >
              {unreadNotifications.length > 0 ? <BellRing size={16} /> : <Bell size={16} />}
            </button>
            <button
              title="Mark workspace notifications read"
              disabled={(unreadByWorkspaceId.get(activeWorkspace.id) ?? 0) === 0}
              onClick={markWorkspaceRead}
            >
              <CheckCheck size={16} />
            </button>
          </div>
        </header>
        <LayoutView
          tab={activeTab}
          machines={displayMachines}
          splitMachineId={newMachineId}
          terminalFontSize={settings.terminalFontSize}
          unreadByPaneId={unreadByPaneId}
          mediaByPaneId={mediaByPaneId}
          onActivatePane={async (paneId) => refresh(await api.activatePane(activeTab.id, paneId))}
          onSplit={splitPane}
          onClosePane={closePane}
          onDismissMedia={(mediaId) => setMediaItems((items) => items.filter((item) => item.id !== mediaId))}
        />
      </section>
      {settingsOpen ? (
        <SettingsModal
          machines={machines}
          settings={persistedSettings}
          onPreview={setPreviewSettings}
          onSave={updateSettings}
          onCancel={cancelSettings}
        />
      ) : null}
    </main>
  );
}

const machineFor = (machines: MachineStatus[], machineId: string): MachineStatus | undefined =>
  machines.find((machine) => machine.id === machineId);

const withMachineAlias = (machine: MachineStatus, settings: WmuxSettings): MachineStatus => {
  const alias = cleanAlias(settings.machineAliases[machine.id] ?? "");
  return alias ? { ...machine, name: alias } : machine;
};

const displayWorkspaceDescriptor = (
  descriptor: string | undefined,
  displayMachine: MachineStatus | undefined,
  sourceMachine: MachineStatus | undefined,
  machineId: string,
): string => {
  const raw = descriptor?.trim();
  if (!raw) return displayMachine?.name ?? machineId;
  if (raw === machineId || raw === sourceMachine?.name || raw === displayMachine?.id) {
    return displayMachine?.name ?? raw;
  }
  return raw;
};

function SettingsModal({
  machines,
  settings,
  onPreview,
  onSave,
  onCancel,
}: {
  machines: MachineStatus[];
  settings: WmuxSettings;
  onPreview: (settings: WmuxSettings | null) => void;
  onSave: (settings: WmuxSettings) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<WmuxSettings>(() => normalizeSettings(settings));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(normalizeSettings(settings));
  }, [settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const applyDraft = (nextSettings: WmuxSettings) => {
    const normalized = normalizeSettings(nextSettings);
    setDraft(normalized);
    onPreview(normalized);
  };

  const setAlias = (machineId: string, value: string) => {
    const machineAliases = { ...draft.machineAliases };
    const alias = cleanAlias(value);
    if (alias) {
      machineAliases[machineId] = alias;
    } else {
      delete machineAliases[machineId];
    }
    applyDraft({ ...draft, machineAliases });
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(normalizeSettings(draft));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-backdrop" onMouseDown={(event) => event.currentTarget === event.target && onCancel()}>
      <form
        className="settings-panel"
        aria-labelledby="settings-title"
        role="dialog"
        aria-modal="true"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" title="Cancel settings" onClick={onCancel}>
            <X size={16} />
          </button>
        </div>
        <div className="settings-body">
          <section className="settings-section">
            <h3>Ghostty</h3>
            <label className="settings-row">
              <span>Font size</span>
              <input
                type="range"
                min="10"
                max="24"
                value={draft.terminalFontSize}
                onChange={(event) =>
                  applyDraft({
                    ...draft,
                    terminalFontSize: clampFontSize(Number(event.target.value)),
                  })
                }
              />
              <input
                className="settings-number"
                type="number"
                min="10"
                max="24"
                value={draft.terminalFontSize}
                onChange={(event) =>
                  applyDraft({
                    ...draft,
                    terminalFontSize: clampFontSize(Number(event.target.value)),
                  })
                }
              />
            </label>
          </section>
          <section className="settings-section">
            <h3>Host aliases</h3>
            {machines.map((machine) => (
              <label key={machine.id} className="settings-row">
                <span>{machine.name}</span>
                <input
                  type="text"
                  maxLength={40}
                  placeholder={machine.id}
                  value={draft.machineAliases[machine.id] ?? ""}
                  onChange={(event) => setAlias(machine.id, event.target.value)}
                />
              </label>
            ))}
          </section>
        </div>
        <div className="settings-actions">
          <button
            type="button"
            onClick={() => applyDraft({ ...defaultSettings })}
          >
            Reset
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

const normalizeSettings = (settings: WmuxSettings): WmuxSettings => ({
  terminalFontSize: clampFontSize(settings.terminalFontSize),
  machineAliases: Object.fromEntries(
    Object.entries(settings.machineAliases ?? {})
      .map(([machineId, alias]) => [machineId, cleanAlias(alias)] as const)
      .filter(([, alias]) => alias.length > 0),
  ),
});

const clampFontSize = (value: number): number => {
  const fallback = defaultSettings.terminalFontSize;
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.min(24, Math.max(10, Math.round(numeric)));
};

const cleanAlias = (value: string): string => value.replace(/\s+/g, " ").trim().slice(0, 40);

const workspaceTabPath = (workspaceId: string, tabId: string): string =>
  `/workspaces/${encodeURIComponent(workspaceId)}/tabs/${encodeURIComponent(tabId)}`;

const parseRouteTarget = (): { workspaceId: string; tabId?: string } | null => {
  const match = window.location.pathname.match(/^\/workspaces\/([^/]+)(?:\/tabs\/([^/]+))?\/?$/);
  if (!match) return null;
  return {
    workspaceId: decodeURIComponent(match[1]),
    tabId: match[2] ? decodeURIComponent(match[2]) : undefined,
  };
};

const activateRouteTarget = async (payload: BootstrapPayload): Promise<BootstrapPayload> => {
  const target = parseRouteTarget();
  if (!target) return payload;
  const workspace = payload.workspaces.find((candidate) => candidate.id === target.workspaceId);
  if (!workspace) return payload;
  const tab = target.tabId
    ? workspace.tabs.find((candidate) => candidate.id === target.tabId)
    : workspace.tabs.find((candidate) => candidate.id === workspace.activeTabId) ?? workspace.tabs[0];
  if (!tab) return payload;

  let next = payload;
  if (next.activeWorkspaceId !== workspace.id) {
    next = await api.activateWorkspace(workspace.id);
  }
  const nextWorkspace = next.workspaces.find((candidate) => candidate.id === workspace.id);
  if (nextWorkspace && nextWorkspace.activeTabId !== tab.id) {
    next = await api.activateTab(workspace.id, tab.id);
  }
  return next;
};

const countUnreadBy = (
  notifications: TerminalNotification[],
  field: "paneId" | "tabId" | "workspaceId",
): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const notification of notifications) {
    if (notification.read) continue;
    counts.set(notification[field], (counts.get(notification[field]) ?? 0) + 1);
  }
  return counts;
};

const latestUnreadByWorkspace = (notifications: TerminalNotification[]): Map<string, TerminalNotification> => {
  const latest = new Map<string, TerminalNotification>();
  for (const notification of notifications) {
    if (notification.read || latest.has(notification.workspaceId)) continue;
    latest.set(notification.workspaceId, notification);
  }
  return latest;
};

const groupMediaByPane = (items: TerminalMedia[]): Map<string, TerminalMedia[]> => {
  const grouped = new Map<string, TerminalMedia[]>();
  for (const item of items) {
    grouped.set(item.paneId, [...(grouped.get(item.paneId) ?? []), item]);
  }
  return grouped;
};

const showBrowserNotification = (notification: TerminalNotification): void => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const title = notification.subtitle ? `${notification.title}: ${notification.subtitle}` : notification.title;
  new Notification(title, {
    body: notification.body,
    tag: notification.id,
  });
};

const modulo = (value: number, length: number): number => ((value % length) + length) % length;

const flattenPaneIds = (node: LayoutNode): string[] => {
  if (node.type === "pane") return [node.paneId];
  return [...flattenPaneIds(node.first), ...flattenPaneIds(node.second)];
};
