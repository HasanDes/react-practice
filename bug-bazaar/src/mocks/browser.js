// Starts the mock backend in the browser via a Service Worker, and exposes
// `window.bazaarMock` so anyone can trigger loading/error states from DevTools.

import { setupWorker } from "msw/browser";
import { ROUTE_ERRORS } from "./contract.js";
import { createControls } from "./controls.js";
import { createDb, DEMO_USER } from "./db.js";
import { createHandlers } from "./handlers.js";

export async function startMockApi() {
  const latencyMs = Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 300);
  const storage = window.localStorage;

  const db = createDb({ storage });
  const controls = createControls({ storage, latencyMs, jitterMs: latencyMs });
  const worker = setupWorker(...createHandlers({ db, controls }));

  window.bazaarMock = createConsoleApi({ db, controls });

  await worker.start({
    // Let Vite's own requests (modules, HMR, images) go straight to the network.
    onUnhandledRequest: "bypass",
    quiet: !import.meta.env.DEV,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });

  console.info(
    "%c[mock] Bug Bazaar mock API running.%c Type bazaarMock.help() for error/latency controls.",
    "font-weight:bold",
    "",
  );
}

function createConsoleApi({ db, controls }) {
  return {
    /** bazaarMock.fail("products:list", 500) or bazaarMock.fail("orders:create", 409, { once: true }) */
    fail: (route, status, options) => {
      controls.fail(route, status, options);
      return controls.snapshot();
    },
    /** bazaarMock.clear() clears all forced errors; bazaarMock.clear("login") clears one. */
    clear: (route) => {
      controls.clear(route);
      return controls.snapshot();
    },
    /** bazaarMock.latency(2000) = 2–4s responses; bazaarMock.latency(0, 0) = instant. */
    latency: (ms, jitter) => {
      controls.setLatency(ms, jitter);
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
          "bazaarMock.fail(route, status, { once })  force an error",
          "bazaarMock.clear(route?)                   stop forcing errors",
          "bazaarMock.latency(ms, jitter?)            slow responses (jitter reorders them)",
          "bazaarMock.setStock(productId, n)          change stock",
          "bazaarMock.reset()                         wipe orders/sessions/stock changes",
          "bazaarMock.status()                        show current controls",
        ].join("\n"),
      );
    },
  };
}
