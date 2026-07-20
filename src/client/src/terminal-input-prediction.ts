export interface PredictedTerminalInput {
  sequence: number;
  kind: "insert" | "backspace";
  text: string;
}

export interface PredictedTerminalCell {
  col: number;
  row: number;
  text: string;
}

export interface PredictedTerminalLayout {
  cells: PredictedTerminalCell[];
  cursor: { col: number; row: number };
  authoritativeCursor: { col: number; row: number };
}

export const predictedTerminalInput = (sequence: number, data: string): PredictedTerminalInput | null => {
  if (data === "\b" || data === "\x7f") return { sequence, kind: "backspace", text: "" };
  if (data.length === 1 && data >= " " && data <= "~") {
    return { sequence, kind: "insert", text: data };
  }
  return null;
};

export const isBoundedPredictionEcho = (data: string, expected: string): boolean =>
  expected.length === 1 && data.startsWith(expected) && data.length <= 16;

export const layoutPredictedTerminalInput = (
  cursor: { x: number; y: number; visible?: boolean },
  cols: number,
  rows: number,
  predictions: readonly PredictedTerminalInput[],
): PredictedTerminalLayout | null => {
  if (!cursor.visible || cols < 2 || rows < 1 || predictions.length === 0) return null;
  let col = cursor.x;
  let row = cursor.y;
  if (col < 0 || col >= cols || row < 0 || row >= rows) return null;
  const cells = new Map<string, PredictedTerminalCell>();

  for (const prediction of predictions) {
    if (prediction.kind === "backspace") {
      // Crossing a wrapped row is ambiguous without reading the terminal's
      // wide-cell/wrap metadata, so fail closed at the left edge.
      if (col === 0) return null;
      col -= 1;
      cells.set(`${row}:${col}`, { col, row, text: "" });
      continue;
    }

    cells.set(`${row}:${col}`, { col, row, text: prediction.text });
    col += 1;
    if (col < cols) continue;
    col = 0;
    row += 1;
    if (row >= rows) return null;
  }

  return {
    cells: [...cells.values()],
    cursor: { col, row },
    authoritativeCursor: { col: cursor.x, row: cursor.y },
  };
};
