// Runtime controls for the mock backend: latency and forced errors.
// Exposed in the browser as `window.bazaarMock` (see browser.ts) so QA can
// trigger every UI state on purpose without editing code.

import { ROUTE_ERRORS, type MockErrorStatus, type MockRoute } from "./contract.ts";
import type { StorageLike } from "./db.ts";

const STORAGE_KEY = "bazaar:mock-controls:v1";

type Failure = { status: MockErrorStatus; once: boolean };

type ControlsState = {
  latencyMs: number;
  jitterMs: number;
  failures: Partial<Record<MockRoute, Failure>>;
};

export type ControlsOptions = {
  storage: Pick<StorageLike, "getItem" | "setItem">;
  latencyMs?: number;
  jitterMs?: number;
  random?: () => number;
};

export function isMockRoute(value: unknown): value is MockRoute {
  return typeof value === "string" && Object.hasOwn(ROUTE_ERRORS, value);
}

/** Is `status` one of the documented errors for `route`? Narrows `status` if so. */
export function isAllowed(route: MockRoute, status: number): status is MockErrorStatus {
  return (ROUTE_ERRORS[route] as readonly number[]).includes(status);
}

export function createControls({
  storage,
  latencyMs = 0,
  jitterMs = 0,
  random = Math.random,
}: ControlsOptions) {
  const defaults: ControlsState = { latencyMs, jitterMs, failures: {} };
  const state = load();

  function load(): ControlsState {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      return typeof parsed === "object" && parsed !== null
        ? { ...defaults, ...(parsed as Partial<ControlsState>) }
        : { ...defaults };
    } catch {
      return { ...defaults };
    }
  }

  function save(): void {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage unavailable: controls still work for this page load.
    }
  }

  function clear(route?: MockRoute): void {
    if (route) {
      const { [route]: _removed, ...rest } = state.failures;
      state.failures = rest;
    } else {
      state.failures = {};
    }
    save();
  }

  return {
    /**
     * Base latency plus random jitter. Jitter makes responses finish out of
     * order, which is what D2-6 (race conditions) needs to demonstrate.
     */
    nextDelay(): number {
      return state.latencyMs + Math.round(random() * state.jitterMs);
    },

    setLatency(ms: number, jitter: number = ms): void {
      state.latencyMs = Math.max(0, ms);
      state.jitterMs = Math.max(0, jitter);
      save();
    },

    /**
     * Force a route to fail with a status from its documented list.
     * Takes plain strings/numbers because it's called from the browser console.
     * `once: true` fails only the next request.
     */
    fail(route: string, status: number, { once = false }: { once?: boolean } = {}): void {
      if (!isMockRoute(route)) {
        throw new Error(
          `Unknown route "${route}". Routes: ${Object.keys(ROUTE_ERRORS).join(", ")}`,
        );
      }
      if (!isAllowed(route, status)) {
        throw new Error(
          `"${route}" can't return ${status}. Allowed: ${ROUTE_ERRORS[route].join(", ")}`,
        );
      }
      state.failures = { ...state.failures, [route]: { status, once } };
      save();
    },

    /** Clear one route's forced failure, or all of them. */
    clear,

    /** Return (and consume, if one-shot) the forced status for a route. */
    takeFailure(route: MockRoute): MockErrorStatus | null {
      const failure = state.failures[route];
      if (!failure) return null;
      if (failure.once) clear(route);
      return failure.status;
    },

    snapshot(): ControlsState {
      return structuredClone(state);
    },
  };
}

export type MockControls = ReturnType<typeof createControls>;
