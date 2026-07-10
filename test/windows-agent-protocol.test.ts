import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Windows agent recognizes fixed terminal queries across output chunks", () => {
  const source = String.raw`
import json
import runpy

module = runpy.run_path("scripts/wmux-windows-agent")
responder = module["TerminalQueryResponder"]()
replies = []
for chunk in (b"prefix\x1b[", b"csuffix\x1b[5", b"n\x1b[0", b"c"):
    replies.extend(responder.feed(chunk))

class FakeProcess:
    def __init__(self):
        self.writes = []
    def write(self, value):
        self.writes.append(value)

backend = object.__new__(module["ConptyBackend"])
backend.process = FakeProcess()
backend.lock = __import__("threading").Lock()
backend.closed = False
backend.query_responder = module["TerminalQueryResponder"]()
backend.locally_answered = {}
backend._answer_terminal_queries(b"\x1b[c")
backend.write_terminal_response(b"\x1b[?62;22c")
backend.write_terminal_response(b"\x1b[?62;22c")
backend.write_terminal_response(b"user-input")

print(json.dumps({
    "replies": [reply.decode("ascii") for reply in replies],
    "writes": backend.process.writes,
}))
`;
  const result = spawnSync("python3", ["-c", source], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    replies: ["\x1b[?62;22c", "\x1b[0n", "\x1b[?62;22c"],
    writes: ["\x1b[?62;22c", "user-input"],
  });
});
