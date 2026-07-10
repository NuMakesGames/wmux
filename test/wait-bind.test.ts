import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const helper = path.resolve("scripts/wmux-wait-bind");

test("bind wait helper accepts loopback immediately", () => {
  const result = spawnSync(process.execPath, [helper, "127.0.0.1"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("bind wait helper times out for an unavailable address", () => {
  const result = spawnSync(process.execPath, [helper, "203.0.113.1"], {
    encoding: "utf8",
    env: { ...process.env, WMUX_BIND_WAIT_MS: "1" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /was not assigned within 1ms/);
});
