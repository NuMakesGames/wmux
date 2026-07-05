// Shared OSC 7 (current-working-directory report) capture logic used by both
// the local PTY session and the Windows agent session. The emit side lives in
// scripts/windows/wmux-cwd-prompt.ps1 (PowerShell) and the shell rc bootstraps
// in machines.ts; the wire format is `ESC ]7;file://HOST/PATH (BEL | ESC \)`.

const MAX_CWD_CAPTURE_BYTES = 8192;

export interface Osc7Capture {
  cwds: string[];
  pending: string;
}

// Scans `pending + data` for complete OSC 7 sequences. Returns the decoded
// cwds in order plus the trailing unterminated sequence (if any) to carry as
// the next call's `pending`, capped at MAX_CWD_CAPTURE_BYTES.
export const captureOsc7 = (pending: string, data: string): Osc7Capture => {
  const combined = pending + data;
  const pendingStart = combined.lastIndexOf("\x1b]7;");
  let searchable = combined;
  let nextPending = "";
  if (pendingStart !== -1) {
    const tail = combined.slice(pendingStart);
    if (!tail.includes("\x07") && !tail.includes("\x1b\\")) {
      searchable = combined.slice(0, pendingStart);
      nextPending = tail.slice(-MAX_CWD_CAPTURE_BYTES);
    }
  }

  const cwds: string[] = [];
  for (const match of searchable.matchAll(/\x1b]7;file:\/\/([^\x07\x1b]*)(?:\x07|\x1b\\)/g)) {
    const cwd = cwdFromFileUri(match[1]);
    if (cwd) cwds.push(cwd);
  }
  return { cwds, pending: nextPending };
};

export const cwdFromFileUri = (value: string): string | undefined => {
  const slash = value.indexOf("/");
  if (slash === -1) return undefined;
  const pathPart = value.slice(slash);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  if (/^\/[A-Za-z]:[\\/]/.test(decoded)) decoded = decoded.slice(1);
  if (decoded.length > 4096) return undefined;
  if (/[\x00-\x1f\x7f]/.test(decoded)) return undefined;
  if (/^[A-Za-z]:[\\/]/.test(decoded)) return decoded;
  if (!decoded.startsWith("/")) return undefined;
  return decoded;
};
