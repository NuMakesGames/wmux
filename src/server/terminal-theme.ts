import {
  TERMINAL_COLOR_SCHEME_MODES,
  type TerminalColorSchemeId,
} from "../shared/protocol.js";

export const terminalThemeEnvironment = (colorScheme: TerminalColorSchemeId): Record<string, string> => ({
  WMUX_COLOR_SCHEME: colorScheme,
  WMUX_COLOR_MODE: TERMINAL_COLOR_SCHEME_MODES[colorScheme],
});
