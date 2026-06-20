import os from "node:os";
import net from "node:net";

const privateRanges = [
  /^10\./,
  /^127\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export const isAllowedBindHost = (host: string): boolean => {
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (host === "::1") return true;
  if (privateRanges.some((range) => range.test(host))) return true;
  const interfaces = os.networkInterfaces();
  return Object.values(interfaces)
    .flat()
    .some((address) => address?.address === host && !address.internal);
};

const normalizeHost = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > -1 ? trimmed.slice(1, end) : trimmed;
  }
  const colon = trimmed.lastIndexOf(":");
  return colon > -1 ? trimmed.slice(0, colon) : trimmed;
};

export const isAllowedRequestHost = (hostHeader: string | undefined, bindHost: string): boolean => {
  const host = normalizeHost(hostHeader);
  if (!host) return false;
  if (host === bindHost || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".ts.net")) return true;
  if (net.isIP(host)) return isAllowedBindHost(host);
  const allowed = (process.env.WMUX_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return allowed.includes(host);
};

export const isAllowedOrigin = (origin: string | undefined, bindHost: string): boolean => {
  if (!origin) return true;
  if (origin === "null") return false;
  try {
    const parsed = new URL(origin);
    return isAllowedRequestHost(parsed.host, bindHost);
  } catch {
    return false;
  }
};
