import assert from "node:assert/strict";
import test from "node:test";
import { resolveMachineTargetId } from "../src/client/src/machine-target.js";

test("remote-only machine lists replace a stale local creation target", () => {
  const machines = [{ id: "remote" }, { id: "backup" }];
  assert.equal(resolveMachineTargetId("local", machines), "remote");
});

test("an available explicit creation target remains selected", () => {
  const machines = [{ id: "remote" }, { id: "backup" }];
  assert.equal(resolveMachineTargetId("backup", machines), "backup");
});

test("zero-machine lists do not produce an invalid creation target", () => {
  assert.equal(resolveMachineTargetId("local", []), "");
});
