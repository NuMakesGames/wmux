import assert from "node:assert/strict";
import test from "node:test";
import { isBareShiftEnter, type TerminalKeyModifiers } from "../src/client/src/terminal-input.js";

const keyEvent = (overrides: Partial<TerminalKeyModifiers> = {}): TerminalKeyModifiers => ({
  key: "Enter",
  shiftKey: true,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...overrides,
});

test("bare Shift+Enter is recognized as terminal newline input", () => {
  assert.equal(isBareShiftEnter(keyEvent()), true);
});

test("Shift+Enter matching rejects other keys and additional modifiers", () => {
  assert.equal(isBareShiftEnter(keyEvent({ key: "a" })), false);
  assert.equal(isBareShiftEnter(keyEvent({ shiftKey: false })), false);
  assert.equal(isBareShiftEnter(keyEvent({ ctrlKey: true })), false);
  assert.equal(isBareShiftEnter(keyEvent({ altKey: true })), false);
  assert.equal(isBareShiftEnter(keyEvent({ metaKey: true })), false);
});
