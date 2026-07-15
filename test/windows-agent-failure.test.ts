import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { probeWindowsAgent, WindowsAgentSession } from "../src/server/windows-agent.js";
import {
  expectedWindowsAgentProtocolVersion,
  expectedWindowsAgentReleaseVersion,
} from "../src/server/windows-helpers.js";
import { TerminalCheckpoint } from "../src/server/terminal-checkpoint.js";
import type { MachineConfig, PaneState } from "../src/server/types.js";

const waitUntil = async (predicate: () => boolean, timeoutMs = 1000) => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

test("Windows agent control failures are contained", async () => {
  const pane: PaneState = {
    id: "pane_failure_test",
    machineId: "windows",
    title: "PowerShell",
    status: "idle",
    createdAt: new Date(0).toISOString(),
  };
  const machine: MachineConfig = {
    id: "windows",
    name: "Windows",
    kind: "powershell-ssh",
    host: "127.0.0.1",
    sessionBackend: "agent",
    agentUrl: "http://127.0.0.1:1",
  };
  const session = new WindowsAgentSession(pane, machine, 80, 24);

  session.write("echo test\r");
  session.resize(100, 40);
  session.kill();

  // Connection-refused rejections arrive asynchronously. node:test treats an
  // unhandled rejection as a test failure, which protects the service-level
  // contract this regression test covers.
  await new Promise((resolve) => setTimeout(resolve, 100));
});

test("Windows agent health probes fail within their timeout budget", async () => {
  const server = http.createServer((_request, response) => {
    setTimeout(() => response.end(JSON.stringify({ ok: true })), 250);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const startedAt = Date.now();
  const result = await probeWindowsAgent(
    {
      id: "windows-timeout",
      name: "Windows timeout",
      kind: "powershell-ssh",
      host: "127.0.0.1",
      sessionBackend: "agent",
      agentUrl: `http://127.0.0.1:${address.port}`,
    },
    30,
  );
  assert.equal(result.reachable, false);
  assert.match(result.reason ?? "", /timed out/);
  assert.ok(Date.now() - startedAt < 200);
  server.close();
  await once(server, "close");
});

test("Windows agent detach preserves the remote session while kill deletes it", async () => {
  const deleted: string[] = [];
  const created: string[] = [];
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    if (request.method === "POST" && /^\/sessions\/pane_/.test(path)) {
      created.push(path);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: path.split("/")[2], pid: 123, base: 0, cursor: 0 }));
      return;
    }
    if (request.method === "GET" && path.includes("/output")) {
      setTimeout(() => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ base: 0, cursor: 0, dataBase64: "", exited: false }));
      }, 10);
      return;
    }
    if (request.method === "DELETE") {
      deleted.push(path);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ removed: true }));
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const machine: MachineConfig = {
    id: "windows",
    name: "Windows",
    kind: "powershell-ssh",
    host: "127.0.0.1",
    sessionBackend: "agent",
    agentUrl: `http://127.0.0.1:${address.port}`,
  };
  const pane = (id: string): PaneState => ({
    id,
    machineId: "windows",
    title: "PowerShell",
    status: "idle",
    createdAt: new Date(0).toISOString(),
  });

  const detached = new WindowsAgentSession(pane("pane_detach"), machine, 80, 24);
  await waitUntil(() => created.includes("/sessions/pane_detach"));
  detached.detach();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(deleted, []);

  const killed = new WindowsAgentSession(pane("pane_kill"), machine, 80, 24);
  await waitUntil(() => created.includes("/sessions/pane_kill"));
  killed.kill();
  await waitUntil(() => deleted.includes("/sessions/pane_kill"));

  server.close();
  await once(server, "close");
});

test("a new Windows pane stages and safely activates an outdated agent", async () => {
  const expectedRelease = expectedWindowsAgentReleaseVersion();
  let release = "0.7";
  let helperBundleVersion = "stale";
  let staged = false;
  let drained = false;
  let created = false;
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    response.setHeader("content-type", "application/json");
    if (request.method === "GET" && path === "/health") {
      response.end(JSON.stringify({
        ok: true,
        version: release,
        releaseVersion: release,
        protocolVersion: release === expectedRelease ? expectedWindowsAgentProtocolVersion() : undefined,
        helperBundleVersion,
        activeSessions: 0,
        draining: drained,
      }));
      return;
    }
    if (request.method === "GET" && path === "/sessions") {
      response.end(JSON.stringify({ sessions: [] }));
      return;
    }
    if (request.method === "POST" && path.startsWith("/sessions/__wmux_update_")) {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          helperBundle?: { bundleVersion?: string };
        };
        helperBundleVersion = body.helperBundle?.bundleVersion ?? helperBundleVersion;
        staged = true;
        response.end(JSON.stringify({ id: path.split("/")[2], status: "running" }));
      });
      return;
    }
    if (request.method === "DELETE" && path.startsWith("/sessions/__wmux_update_")) {
      response.end(JSON.stringify({ removed: true }));
      return;
    }
    if (request.method === "POST" && path === "/drain") {
      drained = true;
      setTimeout(() => {
        release = expectedRelease;
        drained = false;
      }, 20);
      response.end(JSON.stringify({ activeSessions: 0, draining: true, restartWhenIdle: true }));
      return;
    }
    if (request.method === "POST" && path === "/sessions/pane_update") {
      created = true;
      response.end(JSON.stringify({ id: "pane_update", pid: 123, base: 0, cursor: 0 }));
      return;
    }
    if (request.method === "GET" && path.startsWith("/sessions/pane_update/output")) {
      response.end(JSON.stringify({ base: 0, cursor: 0, dataBase64: "", exited: false }));
      return;
    }
    response.writeHead(404).end(JSON.stringify({ error: "not_found" }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const session = new WindowsAgentSession(
    {
      id: "pane_update",
      machineId: "windows",
      title: "PowerShell",
      status: "idle",
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "windows",
      name: "Windows",
      kind: "powershell-ssh",
      host: "127.0.0.1",
      sessionBackend: "agent",
      agentUrl: `http://127.0.0.1:${address.port}`,
    },
    80,
    24,
    {},
    async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/drain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restartWhenIdle: true }),
      });
      assert.equal(response.ok, true);
    },
  );
  await session.attachReady;
  assert.equal(staged, true);
  assert.equal(drained, false);
  assert.equal(created, true);
  assert.match(session.replayOutput, new RegExp(`Updating Windows agent 0\\.7 → ${expectedRelease}`));
  assert.match(session.replayOutput, new RegExp(`updated to ${expectedRelease}`));
  session.detach();
  server.close();
  await once(server, "close");
});

test("OSC 7 cwd wins over a stale cwd returned by an older Windows agent", async () => {
  let outputRequests = 0;
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    response.writeHead(200, { "content-type": "application/json" });
    if (request.method === "POST" && path === "/sessions/pane_cwd") {
      response.end(JSON.stringify({ id: "pane_cwd", pid: 123, base: 0, cwd: "C:\\Users\\operator" }));
      return;
    }
    if (request.method === "GET" && path.includes("/output")) {
      outputRequests += 1;
      const data = outputRequests === 1 ? "\x1b]7;file://WIN/C%3A/Windows\x07" : "";
      response.end(JSON.stringify({
        cursor: data.length,
        dataBase64: Buffer.from(data).toString("base64"),
        cwd: "C:\\Users\\operator",
        exited: false,
      }));
      return;
    }
    response.end(JSON.stringify({ removed: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const session = new WindowsAgentSession(
    {
      id: "pane_cwd",
      machineId: "windows",
      title: "PowerShell",
      status: "idle",
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "windows",
      name: "Windows",
      kind: "powershell-ssh",
      host: "127.0.0.1",
      sessionBackend: "agent",
      agentUrl: `http://127.0.0.1:${address.port}`,
    },
    80,
    24,
  );
  const cwds: string[] = [];
  session.on("cwd", (cwd) => cwds.push(cwd));
  await waitUntil(() => outputRequests >= 2);
  assert.equal(cwds.at(-1), "C:/Windows");
  session.detach();
  server.close();
  await once(server, "close");
});

test("Windows agent queues initial resize and input until session creation completes", async () => {
  let created = false;
  let earlyRequests = 0;
  const operations: string[] = [];
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    if (request.method === "POST" && path === "/sessions/pane_startup") {
      setTimeout(() => {
        created = true;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "pane_startup", pid: 123, base: 0 }));
      }, 50);
      return;
    }
    if (request.method === "POST" && path.endsWith("/resize")) {
      if (!created) earlyRequests += 1;
      operations.push("resize");
      response.writeHead(created ? 200 : 404, { "content-type": "application/json" });
      response.end(JSON.stringify(created ? { ok: true } : { error: "unknown_session" }));
      return;
    }
    if (request.method === "POST" && path.endsWith("/input")) {
      if (!created) earlyRequests += 1;
      operations.push("input");
      response.writeHead(created ? 200 : 404, { "content-type": "application/json" });
      response.end(JSON.stringify(created ? { ok: true } : { error: "unknown_session" }));
      return;
    }
    if (request.method === "GET" && path.includes("/output")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ cursor: 0, exited: false }));
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const session = new WindowsAgentSession(
    {
      id: "pane_startup",
      machineId: "windows",
      title: "PowerShell",
      status: "idle",
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "windows",
      name: "Windows",
      kind: "powershell-ssh",
      host: "127.0.0.1",
      sessionBackend: "agent",
      agentUrl: `http://127.0.0.1:${address.port}`,
    },
    80,
    24,
  );
  session.resize(120, 40);
  session.write("echo ready\r");
  await waitUntil(() => operations.length === 2);
  assert.equal(earlyRequests, 0);
  assert.deepEqual(operations, ["resize", "input"]);
  session.detach();
  server.close();
  await once(server, "close");
});

test("Windows agent hydrates a 24-row replay before attaching it to a taller split", async () => {
  const historical = "\x1b[2J\x1b[Hhistory\x1b[24;1HPS> ";
  const historyBytes = Buffer.byteLength(historical);
  const resizes: Array<{ cols: number; rows: number }> = [];
  const server = http.createServer((request, response) => {
    const path = request.url ?? "";
    response.writeHead(200, { "content-type": "application/json" });
    if (request.method === "POST" && path === "/sessions/pane_replay_geometry") {
      response.end(JSON.stringify({
        id: "pane_replay_geometry",
        pid: 123,
        base: 0,
        cursor: historyBytes,
        cols: 80,
        rows: 24,
      }));
      return;
    }
    if (request.method === "POST" && path.endsWith("/resize")) {
      let body = "";
      request.on("data", (chunk) => { body += chunk.toString(); });
      request.on("end", () => {
        resizes.push(JSON.parse(body));
        response.end(JSON.stringify({ ok: true }));
      });
      return;
    }
    if (request.method === "GET" && path.includes("/output")) {
      const cursor = Number(new URL(path, "http://agent").searchParams.get("cursor") ?? 0);
      response.end(JSON.stringify(cursor === 0 ? {
        base: 0,
        startCursor: 0,
        cursor: historyBytes,
        cols: 80,
        rows: 24,
        resizes: [],
        dataBase64: Buffer.from(historical).toString("base64"),
        exited: false,
      } : {
        base: 0,
        startCursor: historyBytes,
        cursor: historyBytes,
        cols: 80,
        rows: 33,
        resizes: [],
        dataBase64: "",
        exited: false,
      }));
      return;
    }
    response.end(JSON.stringify({ removed: true }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const session = new WindowsAgentSession(
    {
      id: "pane_replay_geometry",
      machineId: "windows",
      title: "PowerShell",
      status: "idle",
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "windows",
      name: "Windows",
      kind: "powershell-ssh",
      host: "127.0.0.1",
      sessionBackend: "agent",
      agentUrl: `http://127.0.0.1:${address.port}`,
    },
    80,
    33,
  );
  session.resize(80, 33);
  await session.attachReady;

  const attach = session.attachReplay;
  const restored = new TerminalCheckpoint(80, 33);
  try {
    restored.write(attach.data);
    assert.equal(attach.kind, "checkpoint");
    assert.deepEqual(restored.cursor(), { x: 4, y: 23, visible: true });
    assert.match(restored.screenLines()[23], /^PS> /);
    assert.equal(restored.screenLines()[32].trim(), "");
    assert.deepEqual(resizes, [{ cols: 80, rows: 33 }]);
  } finally {
    restored.dispose();
    session.detach();
    server.close();
    await once(server, "close");
  }
});
