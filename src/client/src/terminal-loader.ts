import { init } from "ghostty-web";
import { enableTerminalLigatures } from "./terminal-ligatures";

let initPromise: Promise<void> | null = null;

export const ensureGhostty = (): Promise<void> => {
  initPromise ??= (() => {
    // Patch the renderer before the first Terminal is constructed.
    enableTerminalLigatures();
    return init();
  })();
  return initPromise;
};
