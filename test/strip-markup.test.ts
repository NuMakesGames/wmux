import assert from "node:assert/strict";
import { test } from "node:test";
import { stripMarkup } from "../src/server/state.js";

test("removes injected noise blocks with their content", () => {
  const input = "Fix the parser <system-reminder>As you answer the user's question…</system-reminder> now";
  assert.equal(stripMarkup(input).replace(/\s+/g, " ").trim(), "Fix the parser now");
});

test("strips slash-command envelopes", () => {
  const input = "<command-name>/model</command-name><command-message>model</command-message>Review the repo";
  assert.equal(stripMarkup(input).replace(/\s+/g, " ").trim(), "Review the repo");
});

test("strips stray tags but keeps their inner text", () => {
  assert.equal(stripMarkup("Add <b>bold</b> handling").replace(/\s+/g, " ").trim(), "Add bold handling");
});

test("leaves plain comparison operators alone", () => {
  assert.equal(stripMarkup("check a < b and c > d").replace(/\s+/g, " ").trim(), "check a < b and c > d");
});
