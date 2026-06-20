export type MachineKind = "local" | "ssh" | "powershell" | "service";
export type SessionBackend = "auto" | "pty" | "tmux" | "screen";

export interface MachineStatus {
  id: string;
  name: string;
  kind: MachineKind;
  host?: string;
  user?: string;
  port?: number;
  sessionBackend?: SessionBackend;
  reachable: boolean;
  reason?: string;
}

export interface PaneState {
  id: string;
  machineId: string;
  title: string;
  cwd?: string;
  status: "idle" | "running" | "exited";
  exitCode?: number | null;
  createdAt: string;
}

export type TitleSource = "default" | "auto" | "user";

export type SplitDirection = "horizontal" | "vertical";

export type LayoutNode =
  | { type: "pane"; paneId: string }
  | { type: "split"; direction: SplitDirection; first: LayoutNode; second: LayoutNode; ratio: number };

export interface SurfaceTab {
  id: string;
  title: string;
  titleSource?: TitleSource;
  activePaneId: string;
  layout: LayoutNode;
  panes: PaneState[];
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  nameSource?: TitleSource;
  descriptor?: string;
  descriptorSource?: TitleSource;
  machineId: string;
  activeTabId: string;
  tabs: SurfaceTab[];
  createdAt: string;
  updatedAt: string;
}

export interface TerminalNotification {
  id: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
  title: string;
  subtitle: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface TerminalMedia {
  id: string;
  workspaceId: string;
  tabId: string;
  paneId: string;
  name: string;
  mimeType: string;
  data: string;
  createdAt: string;
}

export interface WmuxSettings {
  terminalFontSize: number;
  machineAliases: Record<string, string>;
}

export interface BootstrapPayload {
  machines: MachineStatus[];
  workspaces: Workspace[];
  activeWorkspaceId: string;
  notifications: TerminalNotification[];
  settings: WmuxSettings;
}
