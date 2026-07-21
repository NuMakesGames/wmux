import assert from "node:assert/strict";
import test from "node:test";

import { formatSessionReference } from "../src/client/src/session-reference.ts";

test("formats pane ids as user-facing session references", () => {
  assert.equal(formatSessionReference("pane_440c9b01"), "Session pane_440c9b01");
});

test("omits missing session references", () => {
  assert.equal(formatSessionReference(undefined), undefined);
  assert.equal(formatSessionReference("  "), undefined);
});
