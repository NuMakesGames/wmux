import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MAX_PROFILE_BYTES = 8 * 1024 * 1024;

export interface AgentProfileBundle {
  exists: boolean;
  manifest?: Record<string, unknown>;
  files?: Array<{ path: string; dataBase64: string; sha256: string }>;
}

export const resolveAgentProfilePath = (): string | undefined => {
  const explicit = process.env.WMUX_AGENT_PROFILE_PATH?.trim();
  const candidates = explicit
    ? [path.resolve(explicit.replace(/^~(?=$|\/)/, os.homedir()))]
    : [
        path.resolve(process.cwd(), "../wmux-agent-profile"),
        path.join(os.homedir(), ".wmux", "agent-profile"),
      ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "profile.json")));
};

const safeSourcePath = (root: string, source: unknown): string => {
  if (typeof source !== "string" || !source || path.isAbsolute(source)) {
    throw new Error("agent profile source paths must be non-empty and relative");
  }
  const resolved = path.resolve(root, source);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`agent profile source escapes its root: ${source}`);
  }
  return resolved;
};

const walkFiles = (root: string, current: string): string[] => {
  const files: string[] = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const fullPath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`agent profile contains a symlink: ${fullPath}`);
    if (entry.isDirectory()) files.push(...walkFiles(root, fullPath));
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
};

export const readAgentProfileBundle = (): AgentProfileBundle => {
  const root = resolveAgentProfilePath();
  if (!root) return { exists: false };
  const manifestPath = path.join(root, "profile.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  if (manifest.version !== 1 || typeof manifest.name !== "string") {
    throw new Error("agent profile manifest must have version 1 and a name");
  }
  const selected = new Set<string>([manifestPath]);
  for (const key of ["files", "managedText", "jsonMerges", "tomlBlocks"] as const) {
    const items = manifest[key];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const filePath = safeSourcePath(root, (item as Record<string, unknown>)?.source);
      const fileStat = fs.lstatSync(filePath);
      if (fileStat.isSymbolicLink() || !fileStat.isFile()) throw new Error(`agent profile source is not a regular file: ${filePath}`);
      selected.add(filePath);
    }
  }
  if (Array.isArray(manifest.trees)) {
    for (const item of manifest.trees) {
      const treePath = safeSourcePath(root, (item as Record<string, unknown>)?.source);
      const treeStat = fs.lstatSync(treePath);
      if (treeStat.isSymbolicLink() || !treeStat.isDirectory()) throw new Error(`agent profile tree is not a directory: ${treePath}`);
      for (const filePath of walkFiles(root, treePath)) selected.add(filePath);
    }
  }
  let total = 0;
  const files = [...selected].sort().map((filePath) => {
    const data = fs.readFileSync(filePath);
    total += data.length;
    if (total > MAX_PROFILE_BYTES) throw new Error("agent profile exceeds the 8 MiB bundle limit");
    return {
      path: path.relative(root, filePath).split(path.sep).join("/"),
      dataBase64: data.toString("base64"),
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    };
  });
  return { exists: true, manifest, files };
};
