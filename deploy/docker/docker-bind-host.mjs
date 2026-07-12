import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import { pathToFileURL } from "node:url";

const isPrivateIPv4 = (host) => {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false;
  }
  const [first, second] = octets;
  return (
    first === 10 ||
    first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
};

const isSafeContainerBindHost = (host) => {
  const family = net.isIP(host);
  if (family === 4) return isPrivateIPv4(host) && !host.startsWith("127.");
  if (family === 6) {
    const normalized = host.toLowerCase();
    return normalized.startsWith("fc") || normalized.startsWith("fd");
  }
  return false;
};

export const validatePublishHost = (host) => {
  if (net.isIP(host) !== 4 || !isPrivateIPv4(host)) {
    throw new Error(
      `Refusing WMUX_PUBLISH_HOST=${host}. Publish only to IPv4 loopback, Tailscale 100.64.0.0/10, or RFC1918.`,
    );
  }
};

const defaultRouteInterface = () => {
  try {
    const rows = fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").slice(1);
    for (const row of rows) {
      const fields = row.trim().split(/\s+/);
      const flags = Number.parseInt(fields[3] ?? "0", 16);
      if (fields[1] === "00000000" && (flags & 0x2) !== 0) return fields[0];
    }
  } catch {
    // Non-Linux environments fall back to stable interface ordering.
  }
  return undefined;
};

export const selectBindHost = () => {
  const configured = process.env.WMUX_HOST?.trim();
  if (configured) {
    if (!isSafeContainerBindHost(configured)) {
      throw new Error(
        `Refusing WMUX_HOST=${configured}. Use a non-loopback Tailscale, RFC1918, or IPv6 ULA container address.`,
      );
    }
    return configured;
  }

  const candidates = Object.entries(os.networkInterfaces())
    .flatMap(([name, addresses]) => (addresses ?? []).map((address) => ({ name, ...address })))
    .filter((address) => address.family === "IPv4" && !address.internal && isPrivateIPv4(address.address));

  const preferredInterface = defaultRouteInterface();
  candidates.sort((left, right) => {
    const leftDefault = left.name === preferredInterface ? 0 : 1;
    const rightDefault = right.name === preferredInterface ? 0 : 1;
    return leftDefault - rightDefault || left.name.localeCompare(right.name) || left.address.localeCompare(right.address);
  });

  const selected = candidates[0]?.address;
  if (!selected) {
    throw new Error(
      "No private container IPv4 address was found. Set WMUX_HOST to a non-loopback Tailscale, RFC1918, or IPv6 ULA address.",
    );
  }
  return selected;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes("--validate-publish")) {
      validatePublishHost(process.env.WMUX_PUBLISH_HOST?.trim() || "127.0.0.1");
    } else {
      process.stdout.write(`${selectBindHost()}\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
