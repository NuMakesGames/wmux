import assert from "node:assert/strict";
import test from "node:test";
import { buildDoctorReport } from "../src/server/doctor.js";
import { StateStore } from "../src/server/state.js";
import type { DurableSessionAudit } from "../src/server/session-audit.js";
import type { MachineConfig, MachineStatus } from "../src/server/types.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("doctor reports driver durability and pane failures without machine secrets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-doctor-"));
  const machines: MachineConfig[] = [
    { id: "local", name: "Local", kind: "local", sessionBackend: "tmux", agentToken: "secret" },
  ];
  try {
    const state = new StateStore(machines, path.join(dir, "state.json"));
    const pane = state.snapshot().workspaces[0].tabs[0].panes[0];
    state.updatePane(pane.id, { status: "exited", exitCode: 7 });
    const statuses: MachineStatus[] = [{
      id: "local",
      name: "Local",
      kind: "local",
      sessionBackend: "tmux",
      reachable: true,
      checkedAt: new Date().toISOString(),
    }];
    const audit: DurableSessionAudit = {
      summary: { statePath: "test", activePaneCount: 0, sessionCount: 0, orphanCount: 0, duplicateCount: 0, missingCount: 0 },
      sessions: [],
      missing: [],
    };
    const report = buildDoctorReport(state.snapshot(), machines, statuses, audit);
    assert.equal(report.panes[0].transport, "local-multiplexer");
    assert.equal(report.panes[0].restartDurable, true);
    assert.match(report.panes[0].issue ?? "", /code 7/);
    assert.equal(JSON.stringify(report).includes("secret"), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
