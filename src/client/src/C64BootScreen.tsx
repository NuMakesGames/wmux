import { useEffect, useRef, useState } from "react";
import { FitAddon, Terminal } from "ghostty-web";
import { WMUX_MONO_FONT_FAMILY } from "./fonts";
import { LoginView } from "./LoginView";
import { ensureGhostty } from "./terminal-loader";

interface C64BootScreenProps {
  authRequired: boolean;
  ready: boolean;
  onAuthenticated: () => void;
  onComplete: () => void;
}

const C64_BLUE = "#40318d";
const C64_LIGHT_BLUE = "#7869c4";

export function C64BootScreen({ authRequired, ready, onAuthenticated, onComplete }: C64BootScreenProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const authRequiredRef = useRef(authRequired);
  const readyRef = useRef(ready);
  const [showCredentials, setShowCredentials] = useState(false);
  const [status, setStatus] = useState("Starting Ghostty");

  useEffect(() => {
    authRequiredRef.current = authRequired;
  }, [authRequired]);

  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    let terminal: Terminal | null = null;
    let fitAddon: FitAddon | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pause = (milliseconds: number) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, reducedMotion ? 0 : milliseconds));
    const write = (text: string) => terminal?.write(text.replaceAll("\n", "\r\n"));

    const start = async () => {
      await ensureGhostty();
      if (cancelled || !hostRef.current) return;

      terminal = new Terminal({
        cols: 40,
        rows: 25,
        cursorBlink: true,
        cursorStyle: "block",
        disableStdin: true,
        fontSize: window.matchMedia("(max-width: 600px)").matches ? 13 : 17,
        fontFamily: WMUX_MONO_FONT_FAMILY,
        scrollback: 0,
        theme: {
          background: C64_BLUE,
          foreground: C64_LIGHT_BLUE,
          cursor: C64_LIGHT_BLUE,
          cursorAccent: C64_BLUE,
          selectionBackground: C64_LIGHT_BLUE,
          selectionForeground: C64_BLUE,
        },
      });
      fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(hostRef.current);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;
      fitAddon.fit();
      fitAddon.observeResize();

      setStatus("Reading wmux disk directory");
      write("\x1b[2J\x1b[H");
      write("    **** COMMODORE 64 BASIC V2 ****\n\n");
      write(" 64K RAM SYSTEM  38911 BASIC BYTES FREE\n\n");
      write("READY.\n");
      await pause(130);
      write('LOAD "$",8\n\n');
      await pause(100);
      write("SEARCHING FOR $\nLOADING\nREADY.\n");
      await pause(120);
      write("LIST\n\n");

      const directory = [
        '0 "WMUX BOOT DISK" 64 2A',
        '4    "GHOSTTY"          PRG',
        '8    "MACHINES"         SEQ',
        '12   "WORKSPACES"       SEQ',
        '16   "SESSIONS"         PRG',
        '20   "EVENTS"           REL',
        "644 BLOCKS FREE.",
      ];
      for (const line of directory) {
        if (cancelled) return;
        write(`${line}\n`);
        await pause(55);
      }

      setStatus("Loading wmux bootstrap program");
      await pause(100);
      write("\nREADY.\n");
      write('LOAD "*",8\n\n');
      await pause(120);
      write("SEARCHING FOR *\nLOADING\nREADY.\n");
      await pause(120);
      write("LIST\n\n");

      const program = [
        '10 PRINT "WMUX LOADING"',
        "20 SYS 49152 : REM START GHOSTTY",
        "30 GOSUB 100 : REM MACHINES",
        "40 GOSUB 200 : REM WORKSPACES",
        "50 GOSUB 300 : REM SESSIONS",
        "60 GOSUB 400 : REM EVENTS",
        '70 PRINT "READY."',
        "80 END",
      ];
      for (const line of program) {
        if (cancelled) return;
        write(`${line}\n`);
        await pause(45);
      }

      setStatus("Waiting for wmux service");
      write("\nREADY.\nRUN\n");
      let challenged = false;
      const showAuthChallenge = () => {
        if (challenged || !authRequiredRef.current) return;
        challenged = true;
        write("\n?AUTHENTICATION REQUIRED\nENTER CREDENTIALS BELOW\n");
        setStatus("Authentication required");
        setShowCredentials(true);
      };
      showAuthChallenge();
      while (!readyRef.current && !cancelled) {
        showAuthChallenge();
        await pause(80);
      }
      if (cancelled) return;

      setStatus("Running wmux");
      setShowCredentials(false);
      write(challenged ? "\nACCESS GRANTED.\nWMUX READY.\n" : "\nWMUX READY.\n");
      await pause(260);
      if (!cancelled) onComplete();
    };

    void start();
    return () => {
      cancelled = true;
      fitAddon?.dispose();
      terminal?.dispose();
    };
  }, [onComplete]);

  return (
    <main className="c64-boot-screen">
      <section className="c64-boot-bezel" aria-label="wmux loading">
        <div ref={hostRef} className="c64-boot-terminal" aria-hidden="true" />
        {showCredentials ? <LoginView embedded onAuthenticated={onAuthenticated} /> : null}
        <span className="visually-hidden" role="status" aria-live="polite">
          {status}
        </span>
      </section>
    </main>
  );
}
