import assert from "node:assert/strict";
import test from "node:test";
import { PaneSocketController } from "../src/client/src/pane-socket.js";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly OPEN = 1;
  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onclose: ((event: { reason: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(_url: string) { FakeWebSocket.instances.push(this); }
  close(): void { this.closed = true; }
  open(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  emitClose(reason = "closed"): void { this.onclose?.({ reason }); }
  emitError(): void { this.onerror?.(); }
}

const withFakeBrowser = (run: (timers: Map<number, () => void>) => void): void => {
  const originalWebSocket = globalThis.WebSocket;
  const originalWindow = globalThis.window;
  const timers = new Map<number, () => void>();
  let nextTimer = 1;
  try {
    FakeWebSocket.instances = [];
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    globalThis.window = {
      setTimeout: (callback: () => void) => {
        const id = nextTimer++;
        timers.set(id, callback);
        return id;
      },
      clearTimeout: (id: number) => timers.delete(id),
    } as unknown as Window & typeof globalThis;
    run(timers);
  } finally {
    globalThis.WebSocket = originalWebSocket;
    globalThis.window = originalWindow;
  }
};

const createController = (changes: Array<[boolean, string]>) => new PaneSocketController({
  url: () => "ws://example.test/pane",
  paneId: "pane-1",
  onSocketChange: () => undefined,
  onOpen: () => undefined,
  onMessage: () => undefined,
  onConnectionChange: (connected, issue) => changes.push([connected, issue]),
});

test("PaneSocketController pauses pending retries and ignores stale callbacks after resume", () => {
  withFakeBrowser((timers) => {
    const changes: Array<[boolean, string]> = [];
    const controller = createController(changes);
    controller.start();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.emitClose("network lost");
    assert.equal(timers.size, 1);

    controller.pause();
    assert.equal(timers.size, 0);
    assert.deepEqual(changes, [[true, ""], [false, "network lost"], [false, ""]]);
    controller.resume();
    assert.equal(FakeWebSocket.instances.length, 2);
    const replacement = FakeWebSocket.instances[1];
    first.emitError();
    first.emitClose("stale failure");
    assert.equal(timers.size, 0);
    assert.deepEqual(changes, [[true, ""], [false, "network lost"], [false, ""]]);
    replacement.open();
    controller.pause();
    controller.resume();
    assert.equal(FakeWebSocket.instances.length, 3);
    replacement.emitClose("stale close");
    assert.equal(timers.size, 0);
  });
});

test("PaneSocketController manual reconnect replaces an active socket exactly once", () => {
  withFakeBrowser((timers) => {
    const changes: Array<[boolean, string]> = [];
    const controller = createController(changes);
    controller.start();
    const first = FakeWebSocket.instances[0];
    first.open();
    controller.reconnect("manual reconnect");
    assert.equal(FakeWebSocket.instances.length, 2);
    first.emitClose("stale close");
    assert.equal(FakeWebSocket.instances.length, 2);
    assert.equal(timers.size, 0);
    assert.deepEqual(changes, [[true, ""], [false, "manual reconnect"]]);
  });
});

test("PaneSocketController starts paused and keeps removed and disposed controllers terminal", () => {
  withFakeBrowser(() => {
    const changes: Array<[boolean, string]> = [];
    const controller = createController(changes);
    controller.pause();
    controller.start();
    assert.equal(FakeWebSocket.instances.length, 0);
    controller.resume();
    assert.equal(FakeWebSocket.instances.length, 1);
    controller.markRemoved();
    controller.resume();
    assert.equal(FakeWebSocket.instances.length, 1);

    const disposed = createController([]);
    disposed.start();
    assert.equal(FakeWebSocket.instances.length, 2);
    disposed.dispose();
    disposed.resume();
    disposed.reconnect();
    assert.equal(FakeWebSocket.instances.length, 2);
  });
});
