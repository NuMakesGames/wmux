import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { StateStore } from "../src/server/state.js";
import type { MachineConfig } from "../src/server/types.js";

const machines: MachineConfig[] = [{ id: "local", name: "Local", kind: "local" }];

const withTempState = (run: (filePath: string, dir: string) => void): void => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-state-"));
  try {
    run(path.join(dir, "state.json"), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test("fresh store creates one workspace and persists atomically", () => {
  withTempState((filePath, dir) => {
    const store = new StateStore(machines, filePath);
    assert.equal(store.snapshot().workspaces.length, 1);
    assert.ok(fs.existsSync(filePath));
    // No temp file should be left behind after an atomic write.
    assert.equal(fs.readdirSync(dir).some((name) => name.endsWith(".tmp")), false);
    JSON.parse(fs.readFileSync(filePath, "utf8")); // valid JSON
  });
});

test("mutations round-trip through flush and reload", () => {
  withTempState((filePath) => {
    const store = new StateStore(machines, filePath);
    const workspace = store.createWorkspace("local");
    store.setWorkspaceTitle(workspace.id, "Renamed");
    store.flush();

    const reloaded = new StateStore(machines, filePath);
    const found = reloaded.snapshot().workspaces.find((w) => w.id === workspace.id);
    assert.equal(found?.name, "Renamed");
  });
});

test("a corrupt state file is quarantined and startup recovers", () => {
  withTempState((filePath, dir) => {
    fs.writeFileSync(filePath, "{ this is not valid json");
    const store = new StateStore(machines, filePath); // must not throw
    assert.equal(store.snapshot().workspaces.length, 1);
    const quarantined = fs.readdirSync(dir).filter((name) => name.includes(".corrupt-"));
    assert.equal(quarantined.length, 1);
  });
});

test("valid JSON with the wrong shape is also quarantined", () => {
  withTempState((filePath, dir) => {
    fs.writeFileSync(filePath, JSON.stringify({ notWorkspaces: true }));
    const store = new StateStore(machines, filePath);
    assert.equal(store.snapshot().workspaces.length, 1);
    assert.ok(fs.readdirSync(dir).some((name) => name.includes(".corrupt-")));
  });
});

test("restored panes marked running are downgraded to idle", () => {
  withTempState((filePath) => {
    const store = new StateStore(machines, filePath);
    const snapshot = store.snapshot();
    snapshot.workspaces[0].tabs[0].panes[0].status = "running";
    fs.writeFileSync(filePath, JSON.stringify(snapshot));

    const reloaded = new StateStore(machines, filePath);
    assert.equal(reloaded.snapshot().workspaces[0].tabs[0].panes[0].status, "idle");
  });
});

test("flush persists debounced writes synchronously", () => {
  withTempState((filePath) => {
    const store = new StateStore(machines, filePath);
    const workspace = store.createWorkspace("local");
    store.flush();
    const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
    assert.ok(onDisk.workspaces.some((w: { id: string }) => w.id === workspace.id));
  });
});
