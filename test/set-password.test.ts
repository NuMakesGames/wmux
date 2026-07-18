import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { verifyCredentials, type AuthConfig } from "../src/server/auth.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = path.join(repoRoot, "scripts", "wmux-set-password");
const expectAvailable = process.platform !== "win32" && spawnSync("expect", ["-c", "exit 0"]).status === 0;

const isolatedAuthPath = (): { dir: string; authPath: string } => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-set-password-"));
  return { dir, authPath: path.join(dir, "auth.json") };
};

test("wmux-set-password writes credentials and explains the required restart", async () => {
  const { dir, authPath } = isolatedAuthPath();
  try {
    const result = spawnSync(process.execPath, [helper, "--username", "alice"], {
      cwd: repoRoot,
      encoding: "utf8",
      env: { ...process.env, WMUX_AUTH_PATH: authPath, WMUX_PASSWORD: "correct horse battery staple" },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /restart the running server to load the new credentials/);
    assert.match(result.stdout, /systemctl --user restart wmux\.service/);

    const record = JSON.parse(fs.readFileSync(authPath, "utf8")) as { username: string; passwordHash: string };
    assert.equal(record.username, "alice");
    assert.match(record.passwordHash, /^scrypt\$/);
    assert.equal(record.passwordHash.includes("correct horse battery staple"), false);
    const auth: AuthConfig = {
      enabled: true,
      token: "unused",
      loginEnabled: true,
      credentials: record,
      sessionSecret: "unused",
    };
    assert.equal(await verifyCredentials(auth, "alice", "correct horse battery staple"), true);
    if (process.platform !== "win32") assert.equal(fs.statSync(authPath).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("interactive password entry masks the password in a real PTY", { skip: !expectAvailable }, () => {
  const { dir, authPath } = isolatedAuthPath();
  const password = "not-visible-123";
  try {
    const env = Object.fromEntries(
      Object.entries({ ...process.env, WMUX_AUTH_PATH: authPath, WMUX_PASSWORD: "" })
        .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
    const harness = String.raw`
set timeout 8
set node $env(WMUX_TEST_NODE)
set helper $env(WMUX_TEST_HELPER)
set password $env(WMUX_TEST_PASSWORD)
spawn -noecho $node $helper --username alice
expect "Password: "
send -- "$password\r"
expect {
  eof {}
  timeout { exit 124 }
}
set result [wait]
exit [lindex $result 3]
`;
    const result = spawnSync("expect", ["-c", harness], {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        ...env,
        WMUX_TEST_NODE: process.execPath,
        WMUX_TEST_HELPER: helper,
        WMUX_TEST_PASSWORD: password,
      },
      timeout: 10_000,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stdout.includes(password), false, result.stdout);
    assert.match(result.stdout, new RegExp(`Password: \\*{${password.length}}`));
    assert.match(result.stdout, /systemctl --user restart wmux\.service/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
