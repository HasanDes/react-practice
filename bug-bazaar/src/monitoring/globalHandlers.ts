import type { Monitor } from "./monitor.ts";

/** How close in time an "uncaught" copy of a boundary's error can be. */
const DUPLICATE_WINDOW_MS = 1000;

/**
 * Logs errors that no error boundary can catch: ones thrown in event handlers,
 * timers and callbacks ("uncaught"), and promises nobody handled. These don't
 * break rendering, so the page stays as it is; they're only logged.
 *
 * Development-only duplicates: React 18's development build also sends
 * errors that a boundary *did* catch to window.onerror, once per render
 * attempt (it retries a failed render), and each attempt throws a new error
 * object. So the "error" handler waits one task, by which time the boundary
 * has reported the error, and then drops it if it's the same error object,
 * or one with the same name and message the boundary reported within the
 * last second. Production React doesn't send caught errors there at all.
 *
 * Returns a function that removes the handlers.
 */
export function installGlobalErrorHandlers(
  monitor: Monitor,
  target: Window = window,
  defer: (run: () => void) => void = (run) => setTimeout(run, 0),
): () => void {
  const onError = (event: ErrorEvent) => {
    // A thrown non-Error (e.g. `throw "x"`) arrives as error = the value;
    // cross-origin scripts arrive with error = null and only a message.
    const error: unknown = event.error ?? event.message;
    defer(() => {
      if (!caughtByBoundary(monitor, error)) monitor.capture(error, { source: "uncaught" });
    });
  };
  const onRejection = (event: PromiseRejectionEvent) => {
    monitor.capture(event.reason, { source: "unhandled-rejection" });
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

function caughtByBoundary(monitor: Monitor, error: unknown): boolean {
  if (monitor.hasCaptured(error)) return true;
  if (!(error instanceof Error)) return false;
  const now = Date.now();
  return monitor
    .reports()
    .some(
      (report) =>
        report.source === "render" &&
        report.name === error.name &&
        report.message === error.message &&
        now - Date.parse(report.time) < DUPLICATE_WINDOW_MS,
    );
}
