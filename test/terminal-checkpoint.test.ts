import assert from "node:assert/strict";
import { test } from "node:test";
import { selectAttachReplay, TerminalCheckpoint } from "../src/server/terminal-checkpoint.js";

test("terminal checkpoints round-trip an alternate-screen viewport and cursor", () => {
  const source = new TerminalCheckpoint(16, 5);
  const restored = new TerminalCheckpoint(16, 5);
  try {
    source.write("\x1b[?1049h\x1b[2J\x1b[H\x1b[31;1mFRETWORK\x1b[3;4Hmeasure 28\x1b[?25l");
    const snapshot = source.snapshot();
    restored.write(snapshot);

    assert.equal(source.isAlternateScreen, true);
    assert.equal(restored.isAlternateScreen, true);
    assert.deepEqual(restored.screenLines(), source.screenLines());
    assert.deepEqual(restored.cursor(), source.cursor());
    assert.match(restored.screenLines().join("\n"), /FRETWORK/);
    assert.match(restored.screenLines().join("\n"), /measure 28/);
  } finally {
    source.dispose();
    restored.dispose();
  }
});

test("attach replay keeps raw history until a checkpoint is required", () => {
  const checkpoint = new TerminalCheckpoint(12, 3);
  try {
    checkpoint.write("shell output\r\n");
    assert.deepEqual(selectAttachReplay("shell output\r\n", false, checkpoint), {
      data: "shell output\r\n",
      kind: "raw",
    });

    checkpoint.write("\x1b[?1049h\x1b[2J\x1b[Hcodex tui");
    const alternateReplay = selectAttachReplay("stale cursor deltas", false, checkpoint);
    assert.equal(alternateReplay.kind, "checkpoint");
    assert.match(alternateReplay.data, /codex tui/);
  } finally {
    checkpoint.dispose();
  }
});

test("truncated normal-screen history restores the authoritative current screen", () => {
  const source = new TerminalCheckpoint(14, 4);
  const restored = new TerminalCheckpoint(14, 4);
  try {
    source.write("old history\r\n");
    source.write("\x1b[2J\x1b[Hcurrent screen\x1b[4;2H>");
    const replay = selectAttachReplay("arbitrary tail", true, source);
    assert.equal(replay.kind, "checkpoint");

    restored.write(replay.data);
    assert.deepEqual(restored.screenLines(), source.screenLines());
    assert.deepEqual(restored.cursor(), source.cursor());
  } finally {
    source.dispose();
    restored.dispose();
  }
});

test("checkpoint snapshots retain split private input-mode sequences", () => {
  const checkpoint = new TerminalCheckpoint(10, 2);
  try {
    checkpoint.write("\x1b[?20");
    checkpoint.write("04h\x1b[?1000hready");
    const snapshot = checkpoint.snapshot();
    assert.match(snapshot, /\x1b\[\?2004h/);
    assert.match(snapshot, /\x1b\[\?1000h/);
  } finally {
    checkpoint.dispose();
  }
});

test("Windows-style reframing keeps the viewport and cursor anchored from the top", () => {
  const checkpoint = new TerminalCheckpoint(12, 3);
  try {
    checkpoint.write("one\r\ntwo\r\nPS> ");
    assert.deepEqual(checkpoint.cursor(), { x: 4, y: 2, visible: true });

    checkpoint.reframe(12, 6);

    assert.deepEqual(checkpoint.cursor(), { x: 4, y: 2, visible: true });
    assert.match(checkpoint.screenLines()[2], /^PS> /);
    assert.equal(checkpoint.screenLines()[5].trim(), "");
  } finally {
    checkpoint.dispose();
  }
});
