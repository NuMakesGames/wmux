import assert from "node:assert/strict";
import test from "node:test";
import {
  isBoundedPredictionEcho,
  layoutPredictedTerminalInput,
  predictedTerminalInput,
} from "../src/client/src/terminal-input-prediction.js";

test("terminal prediction accepts bounded printable input and backspace only", () => {
  assert.deepEqual(predictedTerminalInput(1, "a"), { sequence: 1, kind: "insert", text: "a" });
  assert.deepEqual(predictedTerminalInput(2, "\x7f"), { sequence: 2, kind: "backspace", text: "" });
  assert.equal(predictedTerminalInput(3, "\r"), null);
  assert.equal(predictedTerminalInput(4, "ab"), null);
  assert.equal(predictedTerminalInput(5, "λ"), null);
});

test("terminal prediction arms only from a small matching echo prefix", () => {
  assert.equal(isBoundedPredictionEcho("a", "a"), true);
  assert.equal(isBoundedPredictionEcho("a\x1b[0m", "a"), true);
  assert.equal(isBoundedPredictionEcho("prompt a", "a"), false);
  assert.equal(isBoundedPredictionEcho(`a${"x".repeat(16)}`, "a"), false);
});

test("terminal prediction lays out inserts and erases without mutating terminal state", () => {
  const predictions = [
    predictedTerminalInput(1, "a")!,
    predictedTerminalInput(2, "b")!,
    predictedTerminalInput(3, "\x7f")!,
    predictedTerminalInput(4, "c")!,
  ];
  assert.deepEqual(
    layoutPredictedTerminalInput({ x: 4, y: 2, visible: true }, 10, 5, predictions),
    {
      cells: [
        { col: 4, row: 2, text: "a" },
        { col: 5, row: 2, text: "c" },
      ],
      cursor: { col: 6, row: 2 },
      authoritativeCursor: { col: 4, row: 2 },
    },
  );
});

test("terminal prediction wraps inserts but refuses ambiguous wrapped backspace", () => {
  assert.deepEqual(
    layoutPredictedTerminalInput(
      { x: 3, y: 0, visible: true },
      4,
      2,
      [predictedTerminalInput(1, "x")!, predictedTerminalInput(2, "y")!],
    )?.cursor,
    { col: 1, row: 1 },
  );
  assert.equal(
    layoutPredictedTerminalInput(
      { x: 0, y: 1, visible: true },
      4,
      2,
      [predictedTerminalInput(1, "\b")!],
    ),
    null,
  );
});
