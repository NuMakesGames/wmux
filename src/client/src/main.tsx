import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ensureWmuxFonts } from "./fonts";
import { enableTerminalLigatures } from "./terminal-ligatures";
import { initToken } from "./token";
import "./styles.css";

initToken();
enableTerminalLigatures();

void ensureWmuxFonts()
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById("root") as HTMLElement).render(<App />);
  });
