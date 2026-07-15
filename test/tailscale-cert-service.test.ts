import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const writeExecutable = (filePath: string, contents: string): void => {
  fs.writeFileSync(filePath, contents, { mode: 0o700 });
};

test("certificate renewal skips issuance and restart while the current certificate is valid", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-cert-valid-"));
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "commands.log");
  const cert = path.join(dir, "cert.pem");
  const key = path.join(dir, "key.pem");
  fs.mkdirSync(bin);
  fs.writeFileSync(cert, "certificate");
  fs.writeFileSync(key, "key");
  writeExecutable(path.join(bin, "openssl"), `#!/bin/sh\necho openssl >> "${log}"\nexit 0\n`);
  writeExecutable(path.join(bin, "tailscale"), `#!/bin/sh\necho tailscale >> "${log}"\nexit 1\n`);
  writeExecutable(path.join(bin, "systemctl"), `#!/bin/sh\necho systemctl >> "${log}"\nexit 1\n`);

  try {
    const result = spawnSync("bash", ["scripts/wmux-cert-renew"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        WMUX_CERT_DOMAIN: "host.example.ts.net",
        WMUX_CERT_FILE: cert,
        WMUX_KEY_FILE: key,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.readFileSync(log, "utf8").trim(), "openssl");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("certificate renewal issues a replacement and restarts wmux only near expiry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wmux-cert-expiring-"));
  const bin = path.join(dir, "bin");
  const log = path.join(dir, "commands.log");
  const cert = path.join(dir, "cert.pem");
  const key = path.join(dir, "key.pem");
  fs.mkdirSync(bin);
  fs.writeFileSync(cert, "old certificate");
  fs.writeFileSync(key, "old key");
  writeExecutable(path.join(bin, "openssl"), `#!/bin/sh\necho openssl >> "${log}"\nexit 1\n`);
  writeExecutable(path.join(bin, "tailscale"), `#!/bin/sh\necho tailscale >> "${log}"\nprintf renewed > "${cert}"\nprintf renewed > "${key}"\n`);
  writeExecutable(path.join(bin, "systemctl"), `#!/bin/sh\necho "systemctl $*" >> "${log}"\n`);

  try {
    const result = spawnSync("bash", ["scripts/wmux-cert-renew"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        WMUX_CERT_DOMAIN: "host.example.ts.net",
        WMUX_CERT_FILE: cert,
        WMUX_KEY_FILE: key,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), [
      "openssl",
      "tailscale",
      "systemctl --user try-restart wmux.service",
    ]);
    assert.equal(fs.statSync(cert).mode & 0o777, 0o644);
    assert.equal(fs.statSync(key).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("certificate installer provisions a daily persistent user timer and explains operator access", () => {
  const installer = fs.readFileSync("scripts/install-tailscale-cert-service.sh", "utf8");
  assert.match(installer, /tailscale status --json/);
  assert.match(installer, /sudo tailscale set --operator/);
  assert.match(installer, /OnCalendar=daily/);
  assert.match(installer, /Persistent=true/);
  assert.match(installer, /wmux-cert-renew\.timer/);
});
