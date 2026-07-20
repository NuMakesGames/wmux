import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { captureOsc7, cwdFromFileUri } from "../src/server/osc7.js";
import { windowsCwdPromptSnippet } from "../src/server/windows-helpers.js";

const repoRoot = path.join(import.meta.dirname, "..");

test("parses a complete OSC 7 report", () => {
  const { cwds, pending } = captureOsc7("", "before\x1b]7;file://host/home/user\x07after");
  assert.deepEqual(cwds, ["/home/user"]);
  assert.equal(pending, "");
});

test("accepts the ST terminator", () => {
  const { cwds } = captureOsc7("", "\x1b]7;file://host/srv\x1b\\");
  assert.deepEqual(cwds, ["/srv"]);
});

test("buffers a sequence split across chunks", () => {
  const first = captureOsc7("", "\x1b]7;file://host/ho");
  assert.deepEqual(first.cwds, []);
  assert.equal(first.pending, "\x1b]7;file://host/ho");
  const second = captureOsc7(first.pending, "me/user\x07");
  assert.deepEqual(second.cwds, ["/home/user"]);
  assert.equal(second.pending, "");
});

test("reports multiple cwds in order", () => {
  const { cwds } = captureOsc7("", "\x1b]7;file://h/a\x07mid\x1b]7;file://h/b\x07");
  assert.deepEqual(cwds, ["/a", "/b"]);
});

test("caps the pending buffer", () => {
  const { pending } = captureOsc7("", "\x1b]7;" + "x".repeat(20000));
  assert.ok(pending.length <= 8192);
});

test("decodes percent-encoded segments", () => {
  assert.equal(cwdFromFileUri("host/home/with%20space"), "/home/with space");
});

test("strips the leading slash from Windows drive paths", () => {
  assert.equal(cwdFromFileUri("PC/C:/Users/me"), "C:/Users/me");
});

test("rejects paths with control characters or no path part", () => {
  assert.equal(cwdFromFileUri("host/home/a%0Ab"), undefined);
  assert.equal(cwdFromFileUri("hostonly"), undefined);
  assert.equal(cwdFromFileUri(`host/${"a".repeat(5000)}`), undefined);
});

test("parses the format the PowerShell prompt snippet emits", () => {
  // Mirrors __wmuxEmitCwd: ESC ]7;file://$HostName$PathPart BEL with the
  // path URI-escaped per segment and drive letters prefixed with a slash.
  const emitted = "\x1b]7;file://GAMING-PC/C:/Users/g%20i/proj\x07";
  const { cwds } = captureOsc7("", emitted);
  assert.deepEqual(cwds, ["C:/Users/g i/proj"]);
});

test("canonical cwd prompt snippet matches the Windows agent's embedded copy", () => {
  const canonical = fs.readFileSync(path.join(repoRoot, "scripts", "windows", "wmux-cwd-prompt.ps1"), "utf8");
  const agentSource = fs.readFileSync(path.join(repoRoot, "scripts", "wmux-windows-agent"), "utf8");
  const match = agentSource.match(/CWD_PROMPT_PS1 = r"""([\s\S]*?)"""/);
  assert.ok(match, "scripts/wmux-windows-agent must define CWD_PROMPT_PS1 = r\"\"\"...\"\"\"");
  assert.equal(match[1], canonical, "agent CWD_PROMPT_PS1 drifted from scripts/windows/wmux-cwd-prompt.ps1");
});

test("windows-helpers serves the canonical snippet verbatim", () => {
  const canonical = fs.readFileSync(path.join(repoRoot, "scripts", "windows", "wmux-cwd-prompt.ps1"), "utf8");
  assert.equal(windowsCwdPromptSnippet(), canonical);
});

test("canonical console theme helper matches the Windows agent's embedded copy", () => {
  const canonical = fs.readFileSync(path.join(repoRoot, "scripts", "windows", "wmux-console-theme.ps1"), "utf8");
  const agentSource = fs.readFileSync(path.join(repoRoot, "scripts", "wmux-windows-agent"), "utf8");
  const match = agentSource.match(/WINDOWS_CONSOLE_THEME_PS1 = r"""([\s\S]*?)"""/);
  assert.ok(match, "scripts/wmux-windows-agent must define WINDOWS_CONSOLE_THEME_PS1");
  assert.equal(match[1], canonical, "agent WINDOWS_CONSOLE_THEME_PS1 drifted from scripts/windows/wmux-console-theme.ps1");
});
