import assert from "node:assert/strict";
import { test } from "node:test";
import { appendBoundedReplay } from "../src/server/replay-buffer.js";

const totalBytes = (chunks: string[]): number => chunks.reduce((sum, c) => sum + Buffer.byteLength(c), 0);

test("keeps everything while under the cap", () => {
  const chunks: string[] = [];
  let bytes = 0;
  bytes = appendBoundedReplay(chunks, bytes, "hello", 100);
  bytes = appendBoundedReplay(chunks, bytes, "world", 100);
  assert.equal(chunks.join(""), "helloworld");
  assert.equal(bytes, 10);
});

test("trims oldest bytes to stay within the cap", () => {
  const chunks: string[] = [];
  let bytes = 0;
  for (let i = 0; i < 100; i += 1) bytes = appendBoundedReplay(chunks, bytes, "0123456789", 50);
  assert.ok(bytes <= 50);
  assert.equal(bytes, totalBytes(chunks));
  // The newest data is always retained.
  assert.ok(chunks.join("").endsWith("0123456789"));
});

test("never splits a multi-byte character mid-sequence when trimming", () => {
  const chunks: string[] = [];
  let bytes = 0;
  // "é" is 2 bytes in UTF-8; fill past a tight cap and ensure the result decodes.
  bytes = appendBoundedReplay(chunks, bytes, "ééééééééé", 6);
  const joined = chunks.join("");
  assert.equal(bytes, totalBytes(chunks));
  assert.ok(bytes <= 6);
  // Round-trips cleanly with no replacement characters from a split code unit.
  assert.equal(Buffer.from(joined, "utf8").toString("utf8"), joined);
});
