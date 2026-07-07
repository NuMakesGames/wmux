import assert from "node:assert/strict";
import { test } from "node:test";
import { compactMiddlePath, normalizeUserPath } from "../src/client/src/path-display.ts";

test("normalizeUserPath collapses common user home directories", () => {
  assert.equal(normalizeUserPath("/home/gisenberg/git/wmux"), "~/git/wmux");
  assert.equal(normalizeUserPath("/Users/gisenberg/git/wmux"), "~/git/wmux");
  assert.equal(normalizeUserPath("C:\\Users\\gisen\\git\\wmux"), "~/git/wmux");
  assert.equal(normalizeUserPath("/var/tmp/wmux"), "/var/tmp/wmux");
});

test("compactMiddlePath preserves the front and tail of long paths", () => {
  const compact = compactMiddlePath("~/git/gisenberg/wmux/ef3", 16);
  assert.equal(compact.text, "~/git/gise../ef3");
  assert.equal(compact.prefix, "~/git/gise");
  assert.equal(compact.marker, "..");
  assert.equal(compact.suffix, "/ef3");
});

test("compactMiddlePath leaves short paths unchanged", () => {
  const compact = compactMiddlePath("~/wmux", 24);
  assert.equal(compact.text, "~/wmux");
  assert.equal(compact.compacted, false);
});
