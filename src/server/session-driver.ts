import type { MachineConfig, PaneState } from "./types.js";
import { PtySession } from "./pty-session.js";
import {
  canRefreshDurableSessionClient,
  disposeDurableSession,
  readDurableSessionCwd,
  refreshDurableSessionClient,
} from "./machines.js";
import { deleteWindowsAgentSession, shouldUseWindowsAgent, WindowsAgentSession } from "./windows-agent.js";

export interface ManagedSession {
  readonly pane: PaneState;
  readonly pid: number;
  readonly isExited: boolean;
  readonly replayOutput: string;
  write(data: string): void;
  writeTerminalResponse?(data: string): void;
  resize(cols: number, rows: number): void;
  detach?(): void;
  kill(): void;
  pause(): void;
  resume(): void;
  on(event: "output" | "title" | "cwd", listener: (data: string) => void): this;
  on(event: "exit", listener: (code: number | null) => void): this;
}

export interface SessionCapabilities {
  transport: "pty" | "local-multiplexer" | "ssh-multiplexer" | "windows-agent";
  restartDurable: boolean;
  replay: boolean;
  resize: boolean;
  cwd: "osc7" | "multiplexer" | "agent";
  agentOwned: boolean;
  refreshClient: boolean;
}

export interface SessionDriver {
  readonly id: "pty" | "windows-agent";
  capabilities(machine: MachineConfig): SessionCapabilities;
  create(
    pane: PaneState,
    machine: MachineConfig,
    cols: number,
    rows: number,
    env: Record<string, string>,
  ): ManagedSession;
  readCwd(machine: MachineConfig, paneId: string): string | undefined;
  refreshClient(machine: MachineConfig, paneId: string): boolean;
  dispose(machine: MachineConfig, paneId: string, hadLiveClient: boolean): void;
}

const ptyDriver: SessionDriver = {
  id: "pty",
  capabilities(machine) {
    const backend = machine.sessionBackend ?? "auto";
    const multiplexer = !machine.command?.length && (backend === "auto" || backend === "tmux" || backend === "screen");
    const restartDurable = multiplexer && (machine.kind === "local" || machine.kind === "ssh");
    return {
      transport: restartDurable
        ? machine.kind === "ssh"
          ? "ssh-multiplexer"
          : "local-multiplexer"
        : "pty",
      restartDurable,
      replay: true,
      resize: true,
      cwd: restartDurable && backend !== "screen" ? "multiplexer" : "osc7",
      agentOwned: false,
      refreshClient: canRefreshDurableSessionClient(machine),
    };
  },
  create: (pane, machine, cols, rows, env) => new PtySession(pane, machine, cols, rows, env),
  readCwd: readDurableSessionCwd,
  refreshClient: refreshDurableSessionClient,
  dispose(machine, paneId) {
    disposeDurableSession(machine, paneId);
  },
};

const windowsAgentDriver: SessionDriver = {
  id: "windows-agent",
  capabilities: () => ({
    transport: "windows-agent",
    restartDurable: true,
    replay: true,
    resize: true,
    cwd: "agent",
    agentOwned: true,
    refreshClient: false,
  }),
  create: (pane, machine, cols, rows, env) => new WindowsAgentSession(pane, machine, cols, rows, env),
  readCwd: () => undefined,
  refreshClient: () => false,
  dispose(machine, paneId, hadLiveClient) {
    if (!hadLiveClient) deleteWindowsAgentSession(machine, paneId);
  },
};

export const sessionDriverForMachine = (machine: MachineConfig): SessionDriver =>
  shouldUseWindowsAgent(machine) ? windowsAgentDriver : ptyDriver;

export const sessionCapabilitiesForMachine = (machine: MachineConfig): SessionCapabilities =>
  sessionDriverForMachine(machine).capabilities(machine);
