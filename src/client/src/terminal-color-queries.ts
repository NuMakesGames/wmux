import type { ITheme } from "ghostty-web";

const MAX_OSC_COLOR_QUERY_CHARS = 4096;
const MAX_OSC_PALETTE_QUERIES = 256;
const OSC_START = "\x1b]";
const OSC_END = "\x1b\\";

const ansiColorKeys = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const satisfies readonly (keyof ITheme)[];

type CompleteTerminalTheme = Required<Pick<ITheme, "foreground" | "background" | (typeof ansiColorKeys)[number]>>;

export interface OscColorQueryResult {
  responses: string[];
  bellTerminators: number;
}

export class OscColorQueryParser {
  private carry = "";

  reset(): void {
    this.carry = "";
  }

  push(data: string, theme: CompleteTerminalTheme): OscColorQueryResult {
    const input = this.carry + data;
    this.carry = "";
    const responses: string[] = [];
    let bellTerminators = 0;
    let cursor = 0;

    while (cursor < input.length) {
      const start = input.indexOf(OSC_START, cursor);
      if (start === -1) {
        if (input.endsWith("\x1b")) this.carry = "\x1b";
        break;
      }

      const terminator = findOscTerminator(input, start + OSC_START.length);
      if (!terminator) {
        const fragment = input.slice(start);
        if (fragment.length <= MAX_OSC_COLOR_QUERY_CHARS) this.carry = fragment;
        break;
      }

      const payload = input.slice(start + OSC_START.length, terminator.index);
      if (payload.length <= MAX_OSC_COLOR_QUERY_CHARS) {
        const queryResponses = colorQueryResponses(payload, theme);
        responses.push(...queryResponses);
        if (queryResponses.length > 0 && terminator.length === 1) bellTerminators += 1;
      }
      cursor = terminator.index + terminator.length;
    }

    return { responses, bellTerminators };
  }
}

const findOscTerminator = (input: string, from: number): { index: number; length: number } | undefined => {
  for (let index = from; index < input.length; index += 1) {
    if (input[index] === "\x07") return { index, length: 1 };
    if (input[index] === "\x1b" && input[index + 1] === "\\") return { index, length: 2 };
  }
  return undefined;
};

const colorQueryResponses = (payload: string, theme: CompleteTerminalTheme): string[] => {
  if (payload === "10;?") return [oscColorResponse("10", theme.foreground)];
  if (payload === "11;?") return [oscColorResponse("11", theme.background)];

  const parts = payload.split(";");
  if (parts[0] !== "4" || parts.length < 3 || parts.length % 2 === 0) return [];
  const queryCount = (parts.length - 1) / 2;
  if (queryCount > MAX_OSC_PALETTE_QUERIES) return [];

  const responses: string[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    if (!/^(?:0|[1-9][0-9]{0,2})$/.test(parts[index]) || parts[index + 1] !== "?") return [];
    const paletteIndex = Number(parts[index]);
    if (paletteIndex > 255) return [];
    responses.push(oscColorResponse(`4;${paletteIndex}`, terminalPaletteColor(theme, paletteIndex)));
  }
  return responses;
};

const terminalPaletteColor = (theme: CompleteTerminalTheme, index: number): string => {
  if (index < ansiColorKeys.length) return theme[ansiColorKeys[index]];
  if (index < 232) {
    const cubeIndex = index - 16;
    const levels = [0, 95, 135, 175, 215, 255];
    return rgbToHex(
      levels[Math.floor(cubeIndex / 36)],
      levels[Math.floor(cubeIndex / 6) % 6],
      levels[cubeIndex % 6],
    );
  }
  const gray = 8 + (index - 232) * 10;
  return rgbToHex(gray, gray, gray);
};

const rgbToHex = (red: number, green: number, blue: number): string =>
  `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

const oscColorResponse = (command: string, color: string): string =>
  `${OSC_START}${command};${oscRgb(color)}${OSC_END}`;

const oscRgb = (color: string): string => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  if (!match) return "rgb:0000/0000/0000";
  return `rgb:${match[1]}${match[1]}/${match[2]}${match[2]}/${match[3]}${match[3]}`.toLowerCase();
};
