import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedOrigin, isAllowedRequestHost } from "../src/server/bind.js";

const BIND = "100.101.102.103";

test("accepts the exact bind host", () => {
  assert.equal(isAllowedRequestHost(BIND, BIND), true);
  assert.equal(isAllowedRequestHost(`${BIND}:3478`, BIND), true);
});

test("accepts loopback and tailnet names", () => {
  assert.equal(isAllowedRequestHost("localhost", BIND), true);
  assert.equal(isAllowedRequestHost("box.tailnet.ts.net", BIND), true);
});

test("accepts private-range IPs, rejects public IPs", () => {
  assert.equal(isAllowedRequestHost("192.168.1.5", BIND), true);
  assert.equal(isAllowedRequestHost("10.0.0.2", BIND), true);
  assert.equal(isAllowedRequestHost("8.8.8.8", BIND), false);
});

test("rejects an unknown host and an empty host", () => {
  assert.equal(isAllowedRequestHost("evil.example.com", BIND), false);
  assert.equal(isAllowedRequestHost(undefined, BIND), false);
});

test("honors WMUX_ALLOWED_HOSTS", () => {
  const prev = process.env.WMUX_ALLOWED_HOSTS;
  process.env.WMUX_ALLOWED_HOSTS = "wmux.internal, other.host";
  try {
    assert.equal(isAllowedRequestHost("wmux.internal", BIND), true);
    assert.equal(isAllowedRequestHost("unlisted.host", BIND), false);
  } finally {
    if (prev === undefined) delete process.env.WMUX_ALLOWED_HOSTS;
    else process.env.WMUX_ALLOWED_HOSTS = prev;
  }
});

test("origin: absent allowed, mismatched rejected, matching allowed", () => {
  assert.equal(isAllowedOrigin(undefined, BIND), true);
  assert.equal(isAllowedOrigin("null", BIND), false);
  assert.equal(isAllowedOrigin("https://evil.example.com", BIND), false);
  assert.equal(isAllowedOrigin(`http://${BIND}:3478`, BIND), true);
  assert.equal(isAllowedOrigin("https://box.ts.net", BIND), true);
});
