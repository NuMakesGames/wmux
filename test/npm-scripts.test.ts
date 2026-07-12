import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

test("npm build and screenshot scripts work in Windows command shells", () => {
  assert.equal(packageJson.scripts["build:client"], "vite build");
  assert.equal(
    packageJson.scripts["docs:screenshots"],
    "playwright test e2e/docs-screenshots.spec.ts --project=chromium --project=mobile-chromium",
  );
});

test("the npm screenshot lifecycle enables documentation capture", () => {
  const source = fs.readFileSync(path.join(repoRoot, "e2e", "docs-screenshots.spec.ts"), "utf8");

  assert.match(source, /process\.env\.WMUX_CAPTURE_DOCS === "1"/);
  assert.match(source, /process\.env\.npm_lifecycle_event === "docs:screenshots"/);
});
