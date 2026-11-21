// Live stock over a WebSocket (D4-4): connection management only, no React.
//
//   const feed = createStockFeed({ url, onSnapshot, onUpdate, onStatus });
//   feed.setProductIds(["p-0001", "p-0002"]); // connects, subscribes
//   feed.setProductIds([]);                   // nothing to watch: disconnects
//   feed.stop();                              // for good: no reconnects, no timers
//
// What "recovers after a disconnect" means here:
// - Reconnect with exponential backoff and jitter (1 s, 2 s, 4 s … max 30 s),
//   so a server restart isn't hit by every client at the same instant.
// - After reconnecting, subscribe again. The server answers with a snapshot,
//   which fills in every change missed while disconnected.
// - Heartbeat: the server pings every 10 s. No message for 25 s means the
//   connection is dead even if the socket never said so (sleeping laptop,
//   dropped Wi-Fi), so close it and reconnect.
// - Back online (the browser's "online" event): reconnect at once instead of
//   waiting out the backoff.
//
// What "stops when the page closes" means here:
// - Nothing to watch (no product on screen) → disconnect.
// - Tab hidden → disconnect; visible again → reconnect (snapshot catches up).
// - pagehide (navigating away, closing the tab) → disconnect. An open socket
//   would also keep the page out of the browser's back/forward cache.
// - stop() → closed for good, every timer and listener removed.

import type { StockFeedClientMessage } from "../types/api.ts";
import { stockFeedMessageSchema } from "./schemas.ts";

export type StockFeedStatus =
  /** Nothing to watch, or stopped. */
  | "idle"
  /** First connection attempt in progress. */
  | "connecting"
  /** Connected and subscribed: updates arrive live. */
  | "live"
  /** Lost the connection; retrying with backoff. */
  | "reconnecting"
  /** Tab hidden: disconnected on purpose until it's visible again. */
  | "paused";

type Timers = {
  setTimeout: (callback: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/** The few page events the feed reacts to (window and document in the browser). */
type PageEvents = {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  isHidden: () => boolean;
};

export type StockFeedOptions = {
  url: string;
  onSnapshot: (stock: Record<string, number>) => void;
  onUpdate: (productId: string, stock: number) => void;
  onStatus?: (status: StockFeedStatus) => void;
  /** For tests: a fake WebSocket class, timers, page events and randomness. */
  WebSocketImpl?: typeof WebSocket;
  timers?: Timers;
  page?: PageEvents;
  random?: () => number;
};

export const HEARTBEAT_TIMEOUT_MS = 25_000;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const SUBSCRIBE_DEBOUNCE_MS = 50;

/** Delay before reconnect attempt `attempt` (0-based): exponential, capped, with jitter. */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt);
  return Math.round(ceiling * (0.5 + random() * 0.5)); // 50–100% of the ceiling
}

function browserPage(): PageEvents {
  return {
    addEventListener: (type, listener) => {
      if (type === "visibilitychange") document.addEventListener(type, listener);
      else window.addEventListener(type, listener);
    },
    removeEventListener: (type, listener) => {
      if (type === "visibilitychange") document.removeEventListener(type, listener);
      else window.removeEventListener(type, listener);
    },
    isHidden: () => document.visibilityState === "hidden",
  };
}

export function createStockFeed({
  url,
  onSnapshot,
  onUpdate,
  onStatus = () => undefined,
  WebSocketImpl,
  timers = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (h) => clearTimeout(h as number),
  },
  page = browserPage(),
  random = Math.random,
}: StockFeedOptions) {
  let productIds: string[] = [];
  let socket: WebSocket | null = null;
  let status: StockFeedStatus = "idle";
  let attempt = 0;
  let reconnectTimer: unknown = null;
  let heartbeatTimer: unknown = null;
  let subscribeTimer: unknown = null;
  let stopped = false;

  /**
   * The WebSocket class, looked up when connecting, not when the feed is
   * created. main.tsx creates the feed before the mock backend starts, and
   * the mock replaces the global WebSocket when it starts: a reference taken
   * at creation kept the original and never reached the mock (found in the
   * D4-4 browser check). Looking it up late also respects anything else that
   * wraps WebSocket after startup.
   */
  const SocketClass = (): typeof WebSocket => WebSocketImpl ?? globalThis.WebSocket;
  // readyState values are fixed by the WebSocket standard.
  const CONNECTING = 0;
  const OPEN = 1;

  function setStatus(next: StockFeedStatus) {
    if (next === status) return;
    status = next;
    onStatus(next);
  }

  function clear(timer: unknown) {
    if (timer !== null) timers.clearTimeout(timer);
  }

  function send(message: StockFeedClientMessage) {
    if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
  }

  function armHeartbeat() {
    clear(heartbeatTimer);
    heartbeatTimer = timers.setTimeout(() => {
      // Silence: assume the connection is dead. Closing triggers a reconnect.
      heartbeatTimer = null;
      dropSocket();
      scheduleReconnect();
    }, HEARTBEAT_TIMEOUT_MS);
  }

  /** Close the current socket without triggering its own reconnect logic. */
  function dropSocket() {
    const current = socket;
    socket = null;
    clear(heartbeatTimer);
    heartbeatTimer = null;
    if (current) {
      current.onopen = null;
      current.onmessage = null;
      current.onclose = null;
      current.onerror = null;
      if (current.readyState === CONNECTING || current.readyState === OPEN) {
        current.close(1000, "client closing");
      }
    }
  }

  /**
   * @param kind what to report while connecting: "reconnecting" after a lost
   * connection (the header shows it), "connecting" for a first or deliberate
   * connect (returning to the tab), which stays quiet.
   */
  function connect(
    kind: "connecting" | "reconnecting" = attempt === 0 ? "connecting" : "reconnecting",
  ) {
    if (stopped || socket || productIds.length === 0 || page.isHidden()) return;
    clear(reconnectTimer);
    reconnectTimer = null;
    setStatus(kind);

    const ws = new (SocketClass())(url);
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      setStatus("live");
      send({ type: "subscribe", productIds });
      armHeartbeat();
    };
    ws.onmessage = (event: MessageEvent) => {
      armHeartbeat(); // any message proves the connection is alive
      let data: unknown;
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return; // not JSON: ignore
      }
      const parsed = stockFeedMessageSchema.safeParse(data);
      if (!parsed.success) return; // not a message we know: ignore
      const message = parsed.data;
      if (message.type === "snapshot") onSnapshot(message.stock);
      else if (message.type === "stock") onUpdate(message.productId, message.stock);
    };
    ws.onclose = () => {
      // The server (or the network) closed it: try again.
      socket = null;
      clear(heartbeatTimer);
      heartbeatTimer = null;
      scheduleReconnect();
    };
    // An error is always followed by close, which does the work.
    ws.onerror = () => undefined;
  }

  function scheduleReconnect() {
    if (stopped || productIds.length === 0) return;
    if (page.isHidden()) {
      setStatus("paused");
      return;
    }
    setStatus("reconnecting");
    clear(reconnectTimer);
    const delay = backoffDelay(attempt, random);
    attempt++;
    reconnectTimer = timers.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  const onVisibility = () => {
    if (page.isHidden()) {
      clear(reconnectTimer);
      reconnectTimer = null;
      dropSocket();
      if (productIds.length > 0) setStatus("paused");
    } else {
      attempt = 0;
      connect();
    }
  };
  const onOnline = () => {
    if (socket || productIds.length === 0) return;
    attempt = 0;
    connect("reconnecting"); // still recovering from the lost connection
  };
  const onPageHide = () => {
    clear(reconnectTimer);
    reconnectTimer = null;
    dropSocket();
    if (productIds.length > 0) setStatus("paused");
  };
  const onPageShow = () => {
    // Back from the back/forward cache: connect again.
    attempt = 0;
    connect();
  };
  page.addEventListener("visibilitychange", onVisibility);
  page.addEventListener("online", onOnline);
  page.addEventListener("pagehide", onPageHide);
  page.addEventListener("pageshow", onPageShow);

  return {
    /** The products currently on screen. Empty disconnects; changes resubscribe. */
    setProductIds(ids: Iterable<string>) {
      if (stopped) return;
      productIds = [...new Set(ids)].sort();
      if (productIds.length === 0) {
        clear(reconnectTimer);
        reconnectTimer = null;
        clear(subscribeTimer);
        subscribeTimer = null;
        dropSocket();
        attempt = 0;
        setStatus("idle");
        return;
      }
      if (!socket) {
        connect();
        return;
      }
      // Already connected: resubscribe (debounced: scrolling changes the set often).
      clear(subscribeTimer);
      subscribeTimer = timers.setTimeout(() => {
        subscribeTimer = null;
        send({ type: "subscribe", productIds });
      }, SUBSCRIBE_DEBOUNCE_MS);
    },

    get status(): StockFeedStatus {
      return status;
    },

    /** Closed for good: no socket, no timers, no listeners. */
    stop() {
      stopped = true;
      clear(reconnectTimer);
      clear(subscribeTimer);
      reconnectTimer = null;
      subscribeTimer = null;
      dropSocket();
      page.removeEventListener("visibilitychange", onVisibility);
      page.removeEventListener("online", onOnline);
      page.removeEventListener("pagehide", onPageHide);
      page.removeEventListener("pageshow", onPageShow);
      setStatus("idle");
    },
  };
}

export type StockFeed = ReturnType<typeof createStockFeed>;
