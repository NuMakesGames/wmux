import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activateWorkspaceTabInState,
  applyRouteTargetToState,
  findWorkspaceTab,
  markWorkspaceNotificationsReadInState,
  parseRouteTarget,
  workspaceTabPath,
} from "../src/client/src/route-state.ts";
import type { BootstrapPayload } from "../src/client/src/types.ts";

const payload = (): BootstrapPayload =>
  ({
    machines: [],
    activeWorkspaceId: "ws1",
    workspaces: [
      {
        id: "ws1",
        name: "One",
        machineId: "local",
        activeTabId: "t1",
        tabs: [
          { id: "t1", title: "a", activePaneId: "p1", layout: { type: "pane", paneId: "p1" }, panes: [], createdAt: "" },
          { id: "t2", title: "b", activePaneId: "p2", layout: { type: "pane", paneId: "p2" }, panes: [], createdAt: "" },
        ],
        createdAt: "",
        updatedAt: "",
      },
      {
        id: "ws2",
        name: "Two",
        machineId: "local",
        activeTabId: "t3",
        tabs: [{ id: "t3", title: "c", activePaneId: "p3", layout: { type: "pane", paneId: "p3" }, panes: [], createdAt: "" }],
        createdAt: "",
        updatedAt: "",
      },
    ],
    notifications: [
      { id: "n1", workspaceId: "ws2", tabId: "t3", paneId: "p3", title: "t", subtitle: "", body: "", createdAt: "", read: false },
    ],
    agentEvents: [],
    runs: [],
    settings: { terminalFontSize: 14, terminalScrollbackRows: 1000, machineAliases: {} },
    streams: [],
  }) as unknown as BootstrapPayload;

test("parseRouteTarget parses workspace and optional tab", () => {
  assert.deepEqual(parseRouteTarget("/workspaces/ws1"), { workspaceId: "ws1", tabId: undefined });
  assert.deepEqual(parseRouteTarget("/workspaces/ws1/tabs/t2"), { workspaceId: "ws1", tabId: "t2" });
  assert.deepEqual(parseRouteTarget("/workspaces/a%20b/tabs/c%2Fd"), { workspaceId: "a b", tabId: "c/d" });
  assert.equal(parseRouteTarget("/"), null);
  assert.equal(parseRouteTarget("/other"), null);
});

test("workspaceTabPath round-trips through parseRouteTarget", () => {
  const path = workspaceTabPath("ws x", "t/y");
  assert.deepEqual(parseRouteTarget(path), { workspaceId: "ws x", tabId: "t/y" });
});

test("findWorkspaceTab resolves explicit and default tabs", () => {
  assert.equal(findWorkspaceTab(payload(), "ws1", "t2")?.tab.id, "t2");
  assert.equal(findWorkspaceTab(payload(), "ws1")?.tab.id, "t1");
  assert.equal(findWorkspaceTab(payload(), "missing"), null);
});

test("activateWorkspaceTabInState switches active workspace and tab", () => {
  const next = activateWorkspaceTabInState(payload(), "ws1", "t2");
  assert.equal(next.activeWorkspaceId, "ws1");
  assert.equal(next.workspaces.find((w) => w.id === "ws1")?.activeTabId, "t2");
});

test("activating an unknown workspace leaves state unchanged (same reference)", () => {
  const input = payload();
  assert.equal(activateWorkspaceTabInState(input, "nope", "t2"), input);
});

test("activating a workspace marks its notifications read", () => {
  const next = activateWorkspaceTabInState(payload(), "ws2", "t3");
  assert.equal(next.notifications.find((n) => n.id === "n1")?.read, true);
});

test("markWorkspaceNotificationsReadInState returns same ref when nothing changes", () => {
  const input = payload();
  assert.equal(markWorkspaceNotificationsReadInState(input, "ws1"), input);
});

test("applyRouteTargetToState is a no-op for null and unknown targets", () => {
  const input = payload();
  assert.equal(applyRouteTargetToState(input, null), input);
  assert.equal(applyRouteTargetToState(input, { workspaceId: "ghost" }), input);
  assert.equal(applyRouteTargetToState(input, { workspaceId: "ws2" }).activeWorkspaceId, "ws2");
});
