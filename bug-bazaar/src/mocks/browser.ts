// Starts the mock backend in the browser via a Service Worker, and exposes
// `window.bazaarMock` so anyone can trigger loading/error states from DevTools.

import { setupWorker } from "msw/browser";
import type { Product } from "../types/api.ts";
import { ROUTE_ERRORS } from "./contract.ts";
import { createControls, isMockRoute, type MockControls } from "./controls.ts";
import { createDb, DEMO_USER, type MockDb } from "./db.ts";
import { createHandlers } from "./handlers.ts";
import { createStockFeedServer, type StockFeedServer } from "./stockFeed.ts";

type ControlsSnapshot = ReturnType<MockControls["snapshot"]>;

export type BazaarMockConsole = {
  fail: (
    route: string,
    status: number | "network",
    options?: { once?: boolean },
  ) => ControlsSnapshot;
  clear: (route?: string) => ControlsSnapshot;
  latency: (ms: number, jitter?: number) => ControlsSnapshot;
  race: (stepMs?: number) => ControlsSnapshot;
  setStock: (productId: string, stock: number) => Product | undefined;
  reset: () => string;
  expireSessions: () => string;
  /** Live stock feed (D4-4). */
  liveStock: {
    drop: () => string;
    outage: (ms?: number) => string;
    rate: (ms: number) => string;
    status: () => { connections: number; rateMs: number };
  };
  status: () => ControlsSnapshot;
  help: () => void;
};

declare global {
  interface Window {
    /** Dev/QA console controls for the mock API. Present only while mocking is on. */
    bazaarMock?: BazaarMockConsole;
  }
}

/** How often a watched product sells (or is restocked) in the demo. */
const LIVE_STOCK_RATE_MS = 4000;

export async function startMockApi(): Promise<void> {
  const latencyMs = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 300);
  const storage = window.localStorage;

  const db = createDb({ storage });
  const controls = createControls({ storage, latencyMs, jitterMs: latencyMs });
  // Live stock: a random sale among watched products every few seconds.
  const stockFeed = createStockFeedServer({ db, rateMs: LIVE_STOCK_RATE_MS });
  const worker = setupWorker(...createHandlers({ db, controls }), stockFeed.handler);

  window.bazaarMock = createConsoleApi(db, controls, stockFeed);

  await worker.start({
    // Let Vite's own requests (modules, HMR, images) go straight to the network.
    onUnhandledFrame: "bypass",
    quiet: !import.meta.env.DEV,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });

  console.info(
    "%c[mock] Bug Bazaar mock API running.%c Type bazaarMock.help() for error/latency controls.",
    "font-weight:bold",
    "",
  );
}

function createConsoleApi(
  db: MockDb,
  controls: MockControls,
  stockFeed: StockFeedServer,
): BazaarMockConsole {
  return {
    liveStock: {
      /** Disconnect every client, as if the server restarted. They reconnect with backoff. */
      drop: () => {
        stockFeed.drop();
        return "Live stock connections dropped. Clients will reconnect.";
      },
      /** Refuse connections for a while (default 15 s): watch the backoff, then recovery. */
      outage: (ms = 15_000) => {
        stockFeed.outage(ms);
        return `Live stock refusing connections for ${String(ms / 1000)} s.`;
      },
      /** Random sales every ms (0 stops them). */
      rate: (ms) => {
        stockFeed.setRate(ms);
        return ms > 0 ? `A random sale every ${String(ms)} ms.` : "Random sales stopped.";
      },
      status: () => ({ connections: stockFeed.connections, rateMs: stockFeed.rateMs }),
    },
    /** bazaarMock.fail("products:list", 500) or bazaarMock.fail("orders:create", 409, { once: true }) */
    fail: (route, status, options) => {
      controls.fail(route, status, options);
      return controls.snapshot();
    },
    /** bazaarMock.clear() clears all forced errors; bazaarMock.clear("login") clears one. */
    clear: (route) => {
      if (route !== undefined && !isMockRoute(route)) {
        throw new Error(`Unknown route "${route}".`);
      }
      controls.clear(route);
      return controls.snapshot();
    },
    /** bazaarMock.latency(2000) = 2–4s responses; bazaarMock.latency(0, 0) = instant. */
    latency: (ms, jitter) => {
      controls.setLatency(ms, jitter);
      return controls.snapshot();
    },
    /** bazaarMock.race() → older (shorter) searches answer slower; race(0) → off. */
    race: (stepMs = 400) => {
      controls.setRace(stepMs);
      return controls.snapshot();
    },
    /** bazaarMock.setStock("p-0001", 0) to test sold-out and 409 flows. */
    setStock: (productId, stock) => {
      db.setStock(productId, stock);
      return db.getProduct(productId);
    },
    /** Forget orders, sessions and stock changes (the seed products remain). */
    reset: () => {
      db.reset();
      controls.clear();
      return "Mock database reset. Reload the page.";
    },
    /** Every token stops working: the next signed-in request gets a 401. */
    expireSessions: () => {
      db.expireSessions();
      return "All sessions expired. The next signed-in request gets a 401.";
    },
    status: () => controls.snapshot(),
    help: () => {
      console.table(
        Object.entries(ROUTE_ERRORS).map(([route, statuses]) => ({
          route,
          statuses: statuses.join(", "),
        })),
      );
      console.info(
        [
          `Demo login: ${DEMO_USER.email} / ${DEMO_USER.password}`,
          'bazaarMock.fail(route, status, { once })  force an error (status or "network")',
          "bazaarMock.clear(route?)                   stop forcing errors",
          "bazaarMock.latency(ms, jitter?)            slow responses (jitter reorders them)",
          "bazaarMock.race(stepMs?) / race(0)         out-of-order search responses (D2-6)",
          "bazaarMock.setStock(productId, n)          change stock",
          "bazaarMock.expireSessions()                every token stops working (401)",
          "bazaarMock.liveStock.drop()                drop live stock connections (they reconnect)",
          "bazaarMock.liveStock.outage(ms?)           refuse live stock connections for a while",
          "bazaarMock.liveStock.rate(ms) / rate(0)    random sales every ms / stop them",
          "bazaarMock.reset()                         wipe orders/sessions/stock changes",
          "bazaarMock.status()                        show current controls",
        ].join("\n"),
      );
    },
  };
}
