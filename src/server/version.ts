import fs from "node:fs";
import type { MachinePlatform } from "./types.js";

export const WMUX_VERSION = (() => {
  try {
    const packageJson = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version?: unknown };
    return typeof packageJson.version === "string" && packageJson.version ? packageJson.version.replace(/^v/i, "") : "dev";
  } catch {
    return "dev";
  }
})();

export const wmuxReleaseVersion = (platform: MachinePlatform): string => `v${WMUX_VERSION}-${platform}`;
