import http from "node:http";
import https from "node:https";
import { selectBindHost } from "./docker-bind-host.mjs";

const port = Number(process.env.WMUX_PORT ?? "3478");
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid WMUX_PORT: ${process.env.WMUX_PORT ?? ""}`);
  process.exit(1);
}

let host;
try {
  host = selectBindHost();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const nativeTls = Boolean(process.env.WMUX_CERT_FILE && process.env.WMUX_KEY_FILE);
const client = nativeTls ? https : http;
const request = client.get({
  host,
  port,
  path: "/api/health",
  // This probes the container's private address, while certificates normally
  // cover WMUX_PUBLIC_URL. Public clients still perform normal TLS validation.
  ...(nativeTls ? { rejectUnauthorized: false } : {}),
}, (response) => {
  response.resume();
  if (response.statusCode !== 200) {
    console.error(`Health check returned HTTP ${response.statusCode ?? "unknown"}.`);
    process.exitCode = 1;
  }
});

request.setTimeout(3000, () => request.destroy(new Error("Health check timed out.")));
request.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
