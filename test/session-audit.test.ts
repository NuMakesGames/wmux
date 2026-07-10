import assert from "node:assert/strict";
import test from "node:test";
import { expectedLocalDurablePaneIds } from "../src/server/session-audit.js";

test("only live local durable panes require local tmux or screen sessions", () => {
  const paneIds = expectedLocalDurablePaneIds({
    machines: [
      { id: "local", kind: "local", sessionBackend: "auto" },
      { id: "raw", kind: "local", sessionBackend: "pty" },
      { id: "command", kind: "local", command: ["watch", "date"] },
      { id: "remote", kind: "ssh", sessionBackend: "auto" },
      { id: "windows", kind: "powershell-ssh", sessionBackend: "agent" },
    ],
    workspaces: [
      {
        tabs: [
          {
            panes: [
              { id: "local-live", machineId: "local", status: "running" },
              { id: "local-idle", machineId: "local", status: "idle" },
              { id: "local-exited", machineId: "local", status: "exited" },
              { id: "raw-live", machineId: "raw", status: "running" },
              { id: "command-live", machineId: "command", status: "running" },
              { id: "remote-live", machineId: "remote", status: "running" },
              { id: "windows-live", machineId: "windows", status: "running" },
            ],
          },
        ],
      },
    ],
  });

  assert.deepEqual([...paneIds].sort(), ["local-idle", "local-live"]);
});

test("legacy local panes without a machine record still default to auto", () => {
  const paneIds = expectedLocalDurablePaneIds({
    workspaces: [{ tabs: [{ panes: [{ id: "legacy", machineId: "local", status: "idle" }] }] }],
  });

  assert.deepEqual([...paneIds], ["legacy"]);
});
