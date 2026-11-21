// Runtime controls for the mock backend: latency and forced errors.
// Exposed in the browser as `window.bazaarMock` (see browser.js) so QA can
// trigger every UI state on purpose without editing code.

import { ROUTE_ERRORS } from "./contract.js";

const STORAGE_KEY = "bazaar:mock-controls:v1";

/**
 * @param {{ storage: Pick<Storage, "getItem" | "setItem">, latencyMs?: number, jitterMs?: number, random?: () => number }} options
 */
export function createControls({ storage, latencyMs = 0, jitterMs = 0, random = Math.random }) {
  const defaults = { latencyMs, jitterMs, failures: {} };
  let state = load();

  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: controls still work for this page load.
    }
  }

  return {
    /**
     * Base latency plus random jitter. Jitter makes responses finish out of
     * order, which is what D2-6 (race conditions) needs to demonstrate.
     */
    nextDelay() {
      return state.latencyMs + Math.round(random() * state.jitterMs);
    },

    setLatency(ms, jitter = ms) {
      state.latencyMs = Math.max(0, ms);
      state.jitterMs = Math.max(0, jitter);
      save();
    },

    /**
     * Force a route to fail with a status from its documented list.
     * @param {keyof typeof ROUTE_ERRORS} route
     * @param {number} status
     * @param {{ once?: boolean }} [options] once: fail only the next request
     */
    fail(route, status, { once = false } = {}) {
      if (!isAllowed(route, status)) {
        throw new Error(
          `"${route}" can't return ${status}. Allowed: ${JSON.stringify(ROUTE_ERRORS[route] ?? "unknown route")}`,
        );
      }
      state.failures[route] = { status, once };
      save();
    },

    /** Clear one route's forced failure, or all of them. */
    clear(route) {
      if (route) delete state.failures[route];
      else state.failures = {};
      save();
    },

    /** Return (and consume, if one-shot) the forced status for a route. */
    takeFailure(route) {
      const failure = state.failures[route];
      if (!failure) return null;
      if (failure.once) {
        delete state.failures[route];
        save();
      }
      return failure.status;
    },

    snapshot() {
      return structuredClone(state);
    },
  };
}

export function isAllowed(route, status) {
  return Boolean(ROUTE_ERRORS[route]?.includes(status));
}
