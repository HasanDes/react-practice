// Mock live stock server (D4-4): WebSocket at /api/stock, mocked with MSW.
// Protocol: docs/api-contract.md ("Live stock").
//
// - A client sends { type: "subscribe", productIds } with what it shows; the
//   server answers with a snapshot of their stock.
// - Every real stock change (placed orders, bazaarMock.setStock) is pushed
//   to the clients subscribed to that product.
// - "Other shoppers": every `rateMs`, one random subscribed product sells a
//   unit or two (now and then it's restocked), so stock visibly moves.
// - A ping every 10 s (the client's heartbeat).
// - QA: drop() disconnects everyone; outage(ms) refuses connections for a
//   while (the client backs off and retries); setRate() tunes or stops the
//   random sales. Timers run only while someone is connected.

import { ws, type WebSocketHandlerConnection } from "msw";
import type { StockFeedServerMessage } from "../types/api.ts";
import type { MockDb } from "./db.ts";

export const PING_INTERVAL_MS = 10_000;

type Client = WebSocketHandlerConnection["client"];

export type StockFeedServerOptions = {
  db: MockDb;
  /** Random sales every N ms; 0 turns them off (tests use 0 and drive changes themselves). */
  rateMs?: number;
  random?: () => number;
  now?: () => number;
};

export function createStockFeedServer({
  db,
  rateMs: initialRate = 0,
  random = Math.random,
  now = Date.now,
}: StockFeedServerOptions) {
  const link = ws.link("*/api/stock");
  const subscriptions = new Map<Client, Set<string>>();
  let rateMs = initialRate;
  let outageUntil = 0;
  let salesTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let unsubscribeDb: (() => void) | null = null;

  const message = (data: StockFeedServerMessage) => JSON.stringify(data);

  function stockOf(productId: string): number | undefined {
    return db.getProduct(productId)?.stock;
  }

  /** One random subscribed product changes: mostly a sale, sometimes a restock. */
  function randomSale() {
    const watched = [...new Set([...subscriptions.values()].flatMap((ids) => [...ids]))];
    if (watched.length === 0) return;
    const productId = watched[Math.floor(random() * watched.length)];
    const stock = productId === undefined ? undefined : stockOf(productId);
    if (productId === undefined || stock === undefined) return;
    const restock = stock === 0 ? random() < 0.5 : random() < 0.1;
    const next = restock
      ? stock + 5 + Math.floor(random() * 20)
      : Math.max(0, stock - 1 - Math.floor(random() * 2));
    db.setStock(productId, next); // pushed to subscribers by the db listener below
  }

  function startTimers() {
    unsubscribeDb ??= db.onStockChange((productId, stock) => {
      for (const [client, ids] of subscriptions) {
        if (ids.has(productId)) client.send(message({ type: "stock", productId, stock }));
      }
    });
    pingTimer ??= setInterval(() => {
      for (const client of subscriptions.keys()) client.send(message({ type: "ping" }));
    }, PING_INTERVAL_MS);
    if (rateMs > 0) salesTimer ??= setInterval(randomSale, rateMs);
  }

  function stopTimers() {
    unsubscribeDb?.();
    unsubscribeDb = null;
    if (pingTimer) clearInterval(pingTimer);
    if (salesTimer) clearInterval(salesTimer);
    pingTimer = null;
    salesTimer = null;
  }

  // addEventListener returns the request handler MSW needs (setupWorker / setupServer).
  const handler = link.addEventListener("connection", ({ client }) => {
    const handle: Client = client;
    if (now() < outageUntil) {
      // Simulated outage: refuse. 1013 = "try again later".
      handle.close(1013, "Service unavailable (simulated outage)");
      return;
    }
    subscriptions.set(handle, new Set());
    startTimers();

    handle.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return; // the protocol is JSON text frames
      let data: unknown;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("type" in data) ||
        data.type !== "subscribe" ||
        !("productIds" in data) ||
        !Array.isArray(data.productIds)
      ) {
        return;
      }
      const ids = new Set(data.productIds.filter((id): id is string => typeof id === "string"));
      subscriptions.set(handle, ids);
      const stock: Record<string, number> = {};
      for (const id of ids) {
        const value = stockOf(id);
        if (value !== undefined) stock[id] = value;
      }
      handle.send(message({ type: "snapshot", stock }));
    });

    handle.addEventListener("close", () => {
      subscriptions.delete(handle);
      if (subscriptions.size === 0) stopTimers();
    });
  });

  return {
    handler,
    /** Connected clients (for tests and the QA panel). */
    get connections(): number {
      return subscriptions.size;
    },
    /** Disconnect everyone, as if the server restarted. 1012 = "service restart". */
    drop() {
      for (const client of [...subscriptions.keys()]) client.close(1012, "Server restarting");
    },
    /** Refuse connections for `ms` (and drop current ones). */
    outage(ms: number) {
      outageUntil = now() + ms;
      for (const client of [...subscriptions.keys()]) client.close(1013, "Service unavailable");
    },
    /** Random sales every `ms`; 0 stops them. */
    setRate(ms: number) {
      rateMs = Math.max(0, ms);
      if (salesTimer) clearInterval(salesTimer);
      salesTimer = null;
      if (rateMs > 0 && subscriptions.size > 0) salesTimer = setInterval(randomSale, rateMs);
    },
    get rateMs(): number {
      return rateMs;
    },
    /** Stop every timer (tests). */
    dispose() {
      stopTimers();
      subscriptions.clear();
    },
  };
}

export type StockFeedServer = ReturnType<typeof createStockFeedServer>;
