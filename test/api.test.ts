import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../src/client/src/api.ts";

test("create requests carry browser-local source pane context", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ path: string; body: unknown }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({
      path: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;

  try {
    await api.createWorkspace("local", "pane_source");
    await api.createTab("ws_target", "local", "pane_source");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(requests, [
    { path: "/api/workspaces", body: { machineId: "local", sourcePaneId: "pane_source" } },
    {
      path: "/api/workspaces/ws_target/tabs",
      body: { machineId: "local", sourcePaneId: "pane_source" },
    },
  ]);
});
