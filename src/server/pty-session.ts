import { EventEmitter } from "node:events";
import os from "node:os";
import path from "node:path";
import { spawn, type IPty } from "node-pty";
import type { MachineConfig, PaneState } from "./types.js";
import { buildSpawnSpec } from "./machines.js";

interface PtyEvents {
  output: [string];
  title: [string];
  cwd: [string];
  exit: [number | null];
}

const MAX_REPLAY_BYTES = 2 * 1024 * 1024;

export class PtySession extends EventEmitter<PtyEvents> {
  private pty: IPty;
  private replay: string[] = [];
  private replayBytes = 0;
  private exited = false;
  private title: string;

  constructor(
    readonly pane: PaneState,
    machine: MachineConfig,
    cols: number,
    rows: number,
    extraEnv: Record<string, string> = {},
  ) {
    super();
    const spec = buildSpawnSpec(machine, cols, rows, extraEnv);
    this.title = spec.title;
    const trackProcessTitle = spec.trackProcessTitle ?? true;
    this.pty = spawn(spec.file, spec.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd: spec.cwd,
      env: spec.env,
    });

    this.pty.onData((data) => {
      this.appendReplay(data);
      this.emit("output", data);
      if (!trackProcessTitle) return;
      const processTitle = this.pty.process?.trim();
      if (processTitle && processTitle !== this.title) {
        this.title = processTitle;
        this.emit("title", processTitle);
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.exited = true;
      this.emit("exit", exitCode);
    });
  }

  get pid(): number {
    return this.pty.pid;
  }

  get isExited(): boolean {
    return this.exited;
  }

  get replayOutput(): string {
    return this.replay.join("");
  }

  write(data: string): void {
    if (!this.exited) this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    if (this.exited || cols < 2 || rows < 1) return;
    try {
      this.pty.resize(cols, rows);
    } catch {
      /* PTY already exited */
    }
  }

  kill(): void {
    if (this.exited) return;
    try {
      this.pty.kill();
    } catch {
      /* PTY already exited */
    }
  }

  private appendReplay(data: string): void {
    this.replay.push(data);
    this.replayBytes += Buffer.byteLength(data);
    while (this.replayBytes > MAX_REPLAY_BYTES && this.replay.length > 1) {
      const removed = this.replay.shift() ?? "";
      this.replayBytes -= Buffer.byteLength(removed);
    }
  }
}

export const describeLocalCwd = (): string => path.basename(process.cwd()) || os.hostname();
