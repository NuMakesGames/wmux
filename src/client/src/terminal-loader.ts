import { init } from "ghostty-web";

let initPromise: Promise<void> | null = null;

export const ensureGhostty = (): Promise<void> => {
  initPromise ??= init();
  return initPromise;
};
