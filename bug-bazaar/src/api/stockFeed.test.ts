// D4-4: the live stock connection. "Recovers after a disconnect" and "stops
// when the page closes", tested with a fake WebSocket, fake timers and fake
// page events, so every reconnect and timer is deterministic.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  backoffDelay,
  createStockFeed,
  HEARTBEAT_TIMEOUT_MS,
  type StockFeedStatus,
} from "./stockFeed.ts";

/** A WebSocket the test drives: open(), receive(), serverClose(). */
class FakeSocket {
  static instances: FakeSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  closedByClient = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closedByClient = true;
    this.readyState = FakeSocket.CLOSED;
  }
  // test helpers
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: typeof message === "string" ? message : JSON.stringify(message) });
  }
  serverClose() {
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }
}

/** Page events the test fires: hide(), show(), online(), pagehide(). */
function fakePage() {
  const listeners = new Map<string, Set<() => void>>();
  let hidden = false;
  const fire = (type: string) => {
    for (const listener of listeners.get(type) ?? []) listener();
  };
  return {
    addEventListener: (type: string, listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)?.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) =>
      listeners.get(type)?.delete(listener),
    isHidden: () => hidden,
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
    hide: () => {
      hidden = true;
      fire("visibilitychange");
    },
    show: () => {
      hidden = false;
      fire("visibilitychange");
    },
    online: () => fire("online"),
    pagehide: () => fire("pagehide"),
  };
}

let page: ReturnType<typeof fakePage>;
let statuses: StockFeedStatus[];
let snapshots: Record<string, number>[];
let updates: [string, number][];

function setup() {
  return createStockFeed({
    url: "ws://test/api/stock",
    onSnapshot: (stock) => snapshots.push(stock),
    onUpdate: (id, stock) => updates.push([id, stock]),
    onStatus: (status) => statuses.push(status),
    WebSocketImpl: FakeSocket as unknown as typeof WebSocket,
    page,
    random: () => 1, // no jitter: delays are the full backoff ceiling
  });
}

const latest = () => {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket created");
  return socket;
};

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  page = fakePage();
  statuses = [];
  snapshots = [];
  updates = [];
});
afterEach(() => {
  vi.useRealTimers();
});

describe("backoffDelay", () => {
  it("doubles from 1 s, caps at 30 s, and jitters between 50% and 100%", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, () => 1))).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000,
    ]);
    expect(backoffDelay(2, () => 0)).toBe(2000); // 50% of 4000
  });
});

describe("connecting and receiving", () => {
  it("connects only when there's something to watch, then subscribes", () => {
    const feed = setup();
    expect(FakeSocket.instances).toHaveLength(0);
    feed.setProductIds(["p-2", "p-1", "p-1"]);
    expect(latest().url).toBe("ws://test/api/stock");
    latest().open();
    expect(latest().sent).toEqual([{ type: "subscribe", productIds: ["p-1", "p-2"] }]);
    expect(feed.status).toBe("live");
  });

  it("passes snapshots and updates on, and ignores anything malformed", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    latest().receive({ type: "snapshot", stock: { "p-1": 7 } });
    latest().receive({ type: "stock", productId: "p-1", stock: 6 });
    latest().receive("not json");
    latest().receive({ type: "stock", productId: "p-1", stock: -3 });
    latest().receive({ type: "mystery" });
    expect(snapshots).toEqual([{ "p-1": 7 }]);
    expect(updates).toEqual([["p-1", 6]]);
  });

  it("resubscribes (debounced) when the products on screen change", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    feed.setProductIds(["p-1", "p-2"]);
    feed.setProductIds(["p-3"]);
    vi.advanceTimersByTime(100);
    expect(latest().sent.at(-1)).toEqual({ type: "subscribe", productIds: ["p-3"] });
    expect(latest().sent).toHaveLength(2); // the first subscribe, then one for the final set
  });

  it("looks up WebSocket when connecting, not when created (the mock patches it later)", () => {
    const original = globalThis.WebSocket;
    const feed = createStockFeed({
      url: "ws://test/api/stock",
      onSnapshot: () => undefined,
      onUpdate: () => undefined,
      page,
    });
    globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket; // installed after creation
    try {
      feed.setProductIds(["p-1"]);
      expect(FakeSocket.instances).toHaveLength(1);
    } finally {
      globalThis.WebSocket = original;
      feed.stop();
    }
  });
});

describe("recovers after a disconnect", () => {
  it("reconnects with growing delays, then resubscribes, and the snapshot catches up", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();

    latest().serverClose();
    expect(feed.status).toBe("reconnecting");
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(2); // after 1 s

    latest().serverClose(); // the retry fails too
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.instances).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(3); // after 2 s more

    latest().open();
    expect(feed.status).toBe("live");
    expect(latest().sent).toEqual([{ type: "subscribe", productIds: ["p-1"] }]);
    latest().receive({ type: "snapshot", stock: { "p-1": 2 } }); // changes missed meanwhile
    expect(snapshots).toEqual([{ "p-1": 2 }]);

    latest().serverClose(); // a later drop starts from 1 s again
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(4);
  });

  it("treats 25 s of silence as a dead connection and reconnects", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1000);
    latest().receive({ type: "ping" }); // alive: the countdown restarts
    vi.advanceTimersByTime(HEARTBEAT_TIMEOUT_MS - 1000);
    expect(latest().closedByClient).toBe(false);

    vi.advanceTimersByTime(1000); // 25 s since the ping
    expect(FakeSocket.instances[0]?.closedByClient).toBe(true);
    expect(feed.status).toBe("reconnecting");
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("back online: reconnects at once instead of waiting out the backoff", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    latest().serverClose();
    latest().onclose = null;
    vi.advanceTimersByTime(1000);
    latest().serverClose(); // now waiting 2 s
    page.online();
    expect(FakeSocket.instances).toHaveLength(3);
    expect(feed.status).toBe("reconnecting");
  });
});

describe("stops when the page closes", () => {
  it("nothing on screen any more: disconnects and doesn't reconnect", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    feed.setProductIds([]);
    expect(latest().closedByClient).toBe(true);
    expect(feed.status).toBe("idle");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("tab hidden: disconnects; visible again: reconnects", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    page.hide();
    expect(latest().closedByClient).toBe(true);
    expect(feed.status).toBe("paused");
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1); // no retries while hidden
    page.show();
    expect(FakeSocket.instances).toHaveLength(2);
  });

  it("pagehide (leaving or closing the tab) closes the socket", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    page.pagehide();
    expect(latest().closedByClient).toBe(true);
    expect(feed.status).toBe("paused");
  });

  it("stop(): closed for good, with no timers or listeners left", () => {
    const feed = setup();
    feed.setProductIds(["p-1"]);
    latest().open();
    latest().serverClose(); // a reconnect is pending
    feed.stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(page.listenerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.instances).toHaveLength(1);
    feed.setProductIds(["p-1"]); // ignored after stop
    expect(FakeSocket.instances).toHaveLength(1);
    expect(feed.status).toBe("idle");
  });
});
