import { useEffect, useRef } from "react";
import type { SplitDirection } from "./types";

export interface KeyboardShortcutHandlers {
  // When a modal surface (settings, command palette) is open, only the
  // palette toggle itself remains active.
  modalOpen: boolean;
  openCommandPalette: () => void;
  toggleSidebar: () => void;
  createWorkspace: () => void | Promise<void>;
  createTab: () => void | Promise<void>;
  closeActiveTab: () => void | Promise<void>;
  closeActiveWorkspace: () => void | Promise<void>;
  // null when there is no active pane to split (shortcut is ignored).
  splitActivePane: ((direction: SplitDirection) => void | Promise<void>) | null;
  focusPaneRelative: (delta: number) => void | Promise<void>;
  activateWorkspaceRelative: (delta: number) => void | Promise<void>;
  activateTabRelative: (delta: number) => void | Promise<void>;
  // null when state has not loaded / no workspace is active.
  activateWorkspaceAtDigit: ((digit: number) => void | Promise<void>) | null;
  activateTabAtDigit: ((digit: number) => void | Promise<void>) | null;
  jumpLatestUnread: () => void | Promise<void>;
}

// Global keyboard shortcuts, registered once on window with capture so they
// win over the focused terminal. Handlers are read through a ref so the
// listener never needs re-registering.
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = handlersRef.current;
      const key = event.key.toLowerCase();
      const primary = event.metaKey || event.ctrlKey;
      const primaryOnly = primary && !event.altKey && !(event.metaKey && event.ctrlKey);
      const primaryWithAlt = primary && event.altKey && !(event.metaKey && event.ctrlKey);

      const run = (action: () => void | Promise<void>) => {
        event.preventDefault();
        event.stopPropagation();
        void action();
      };

      if (!current.modalOpen && primaryOnly && key === "k") {
        run(current.openCommandPalette);
        return;
      }

      if (current.modalOpen) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const digit = /^[1-9]$/.test(key) ? Number(key) : null;

      if (primaryOnly && key === "b") {
        run(current.toggleSidebar);
        return;
      }

      if (primaryOnly && !event.shiftKey && key === "n") {
        run(current.createWorkspace);
        return;
      }

      if (primaryOnly && !event.shiftKey && key === "t") {
        run(current.createTab);
        return;
      }

      if (primaryOnly && key === "w") {
        run(() => (event.shiftKey ? current.closeActiveWorkspace() : current.closeActiveTab()));
        return;
      }

      if (primaryOnly && key === "d") {
        const splitActivePane = current.splitActivePane;
        if (!splitActivePane) return;
        run(() => splitActivePane(event.shiftKey ? "horizontal" : "vertical"));
        return;
      }

      if (primaryWithAlt && key.startsWith("arrow")) {
        run(() => current.focusPaneRelative(key === "arrowleft" || key === "arrowup" ? -1 : 1));
        return;
      }

      if (((event.metaKey && event.ctrlKey) || (event.altKey && event.ctrlKey && !event.metaKey)) && (event.key === "]" || event.key === "[")) {
        run(() => current.activateWorkspaceRelative(event.key === "]" ? 1 : -1));
        return;
      }

      if (primaryOnly && event.shiftKey && (event.key === "]" || event.key === "[")) {
        run(() => current.activateTabRelative(event.key === "]" ? 1 : -1));
        return;
      }

      if (event.ctrlKey && !event.metaKey && !event.altKey && key === "tab") {
        run(() => current.activateTabRelative(event.shiftKey ? -1 : 1));
        return;
      }

      if (primaryOnly && digit !== null) {
        const activateWorkspaceAtDigit = current.activateWorkspaceAtDigit;
        if (!activateWorkspaceAtDigit) return;
        run(() => activateWorkspaceAtDigit(digit));
        return;
      }

      if (event.altKey && !event.metaKey && digit !== null) {
        const activateTabAtDigit = current.activateTabAtDigit;
        if (!activateTabAtDigit) return;
        run(() => activateTabAtDigit(digit));
        return;
      }

      if (primaryOnly && event.shiftKey && key === "u") {
        run(current.jumpLatestUnread);
      }
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, []);
}
