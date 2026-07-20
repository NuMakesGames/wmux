import assert from "node:assert/strict";
import test from "node:test";
import { TERMINAL_COLOR_SCHEME_IDS, TERMINAL_COLOR_SCHEME_MODES } from "../src/shared/protocol.js";
import { terminalThemeEnvironment } from "../src/server/terminal-theme.js";

test("every color scheme exposes stable session theme metadata", () => {
  for (const colorScheme of TERMINAL_COLOR_SCHEME_IDS) {
    assert.deepEqual(terminalThemeEnvironment(colorScheme), {
      WMUX_COLOR_SCHEME: colorScheme,
      WMUX_COLOR_MODE: TERMINAL_COLOR_SCHEME_MODES[colorScheme],
    });
  }
  assert.deepEqual(terminalThemeEnvironment("tokyo-night"), {
    WMUX_COLOR_SCHEME: "tokyo-night",
    WMUX_COLOR_MODE: "dark",
  });
});
