import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalProtocolResponse } from "../src/client/src/terminal-protocol.js";

test("terminal protocol replies are distinguished from keyboard input", () => {
  assert.equal(isTerminalProtocolResponse("\x1b[?62;22c"), true);
  assert.equal(isTerminalProtocolResponse("\x1b[>1;2;3c"), true);
  assert.equal(isTerminalProtocolResponse("\x1b[0n"), true);
  assert.equal(isTerminalProtocolResponse("\x1b[24;80R"), true);
  assert.equal(isTerminalProtocolResponse("\x1b[?62;22c\x1b[?62;22c"), true);
  assert.equal(isTerminalProtocolResponse("\x1b[A"), false);
  assert.equal(isTerminalProtocolResponse("\x1bf"), false);
  assert.equal(isTerminalProtocolResponse("text"), false);
});
