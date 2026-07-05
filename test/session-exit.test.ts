import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeliberateExit } from "../src/server/session-manager.js";

test("clean exit after a real session is deliberate", () => {
  assert.equal(isDeliberateExit(0, 60_000), true);
  assert.equal(isDeliberateExit(0, 3_000), true);
});

test("non-zero exit is never deliberate (ssh/connection failure keeps the pane)", () => {
  assert.equal(isDeliberateExit(255, 60_000), false);
  assert.equal(isDeliberateExit(1, 60_000), false);
  assert.equal(isDeliberateExit(null, 60_000), false);
});

test("near-instant clean exit is treated as a spawn failure, not a user exit", () => {
  assert.equal(isDeliberateExit(0, 10), false);
  assert.equal(isDeliberateExit(0, 2_999), false);
});
