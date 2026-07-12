import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHttpServer } from "../src/server/http.js";
import type { SessionManager } from "../src/server/session-manager.js";
import { SettingsStore } from "../src/server/settings.js";
import { StateStore } from "../src/server/state.js";
import type { MachineConfig } from "../src/server/types.js";

const withServer = async (
  machines: MachineConfig[],
  run: (baseUrl: string) => Promise<void>,
): Promise<void> => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-http-target-"));
  const state = new StateStore(machines, path.join(directory, "state.json"));
  const settings = new SettingsStore(path.join(directory, "settings.json"));
  const server = await createHttpServer(
    "127.0.0.1",
    state,
    machines,
    {} as SessionManager,
    settings,
    { auth: { enabled: false, token: "", loginEnabled: false, sessionSecret: "test" } },
  );

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
    state.flush();
    fs.rmSync(directory, { recursive: true, force: true });
  }
};

const postWorkspace = (baseUrl: string, body: object = {}): Promise<Response> =>
  fetch(`${baseUrl}/api/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

test("workspace creation defaults to the first configured remote machine", async () => {
  const machines: MachineConfig[] = [
    { id: "remote", name: "Remote", kind: "ssh", host: "remote.ts.net", user: "user" },
  ];
  await withServer(machines, async (baseUrl) => {
    const response = await postWorkspace(baseUrl);
    const payload = (await response.json()) as { workspace: { machineId: string } };

    assert.equal(response.status, 201);
    assert.equal(payload.workspace.machineId, "remote");
  });
});

test("workspace creation rejects an explicit unknown machine", async () => {
  const machines: MachineConfig[] = [
    { id: "remote", name: "Remote", kind: "ssh", host: "remote.ts.net", user: "user" },
  ];
  await withServer(machines, async (baseUrl) => {
    const response = await postWorkspace(baseUrl, { machineId: "missing" });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "unknown_machine" });
  });
});

test("workspace creation reports when no machine target exists", async () => {
  await withServer([], async (baseUrl) => {
    const response = await postWorkspace(baseUrl);
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { error: "no_machine_available" });
  });
});
