import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("agent event helper sends the full assistant response as structured JSON", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-agent-event-"));
  const transcriptPath = path.join(dir, "transcript.jsonl");
  fs.writeFileSync(
    transcriptPath,
    [
      JSON.stringify({
        type: "response_item",
        payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Please fix mobile chat" }] },
      }),
      JSON.stringify({
        type: "response_item",
        payload: {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: "First line of the response.\n\nSecond detailed line." },
            { type: "tool_call", text: '{"internal":"fragment"}' },
          ],
        },
      }),
    ].join("\n"),
  );

  let captured: Record<string, unknown> | undefined;
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      captured = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      response.writeHead(201, { "content-type": "application/json" });
      response.end("{}");
    });
  });

  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await execFileAsync(path.join(repoRoot, "scripts", "wmux-agent-event"), [
      "--url",
      `http://127.0.0.1:${address.port}`,
      "--agent",
      "codex",
      "--status",
      "completed",
      "--transcript",
      transcriptPath,
      "--force",
    ], {
      env: { ...process.env, HOME: dir, WMUX_TOKEN: "", WMUX_TOKEN_PATH: path.join(dir, "missing-token") },
    });

    assert.equal(captured?.title, "fix mobile chat");
    assert.equal(captured?.summary, "First line of the response.");
    assert.equal(captured?.message, "First line of the response.\n\nSecond detailed line.");
    assert.equal(JSON.stringify(captured).includes("internal"), false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
