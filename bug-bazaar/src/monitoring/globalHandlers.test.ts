// @vitest-environment jsdom
// D4-7: errors React can't catch (event handlers, timers, promises) are still logged.

import { afterEach, describe, expect, it } from "vitest";
import { installGlobalErrorHandlers } from "./globalHandlers.ts";
import { createMonitor } from "./monitor.ts";

const now = (run: () => void) => run();
let uninstall: () => void = () => undefined;
afterEach(() => uninstall());

function unhandledRejection(reason: unknown): Event {
  // jsdom has no PromiseRejectionEvent; the handler only reads `reason`.
  return Object.assign(new Event("unhandledrejection"), { reason });
}

describe("global error handlers", () => {
  it("log an error thrown outside rendering as uncaught", () => {
    const monitor = createMonitor({ transport: () => undefined });
    uninstall = installGlobalErrorHandlers(monitor, window, now);
    const error = new Error("thrown in a click handler");

    window.dispatchEvent(new ErrorEvent("error", { error, message: error.message }));

    expect(monitor.reports()).toMatchObject([
      { source: "uncaught", message: "thrown in a click handler" },
    ]);
  });

  it("log an unhandled promise rejection", () => {
    const monitor = createMonitor({ transport: () => undefined });
    uninstall = installGlobalErrorHandlers(monitor, window, now);

    window.dispatchEvent(unhandledRejection(new Error("nobody caught me")));

    expect(monitor.reports()).toMatchObject([
      { source: "unhandled-rejection", message: "nobody caught me" },
    ]);
  });

  it("don't log an error twice when an error boundary already reported it", () => {
    const monitor = createMonitor({ transport: () => undefined });
    const queued: (() => void)[] = [];
    uninstall = installGlobalErrorHandlers(monitor, window, (run) => queued.push(run));
    const error = new Error("render error");

    // Development React: window.onerror sees it first, then the boundary reports it.
    window.dispatchEvent(new ErrorEvent("error", { error }));
    monitor.capture(error, { source: "render" });
    for (const run of queued) run();

    expect(monitor.reports()).toMatchObject([{ source: "render" }]);
  });

  it("drop React's development retries of a render error, but not a different error", () => {
    const monitor = createMonitor({ transport: () => undefined });
    const queued: (() => void)[] = [];
    uninstall = installGlobalErrorHandlers(monitor, window, (run) => queued.push(run));

    // Each render attempt throws a new error object with the same message.
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined") }));
    window.dispatchEvent(new ErrorEvent("error", { error: new TypeError("x is undefined") }));
    window.dispatchEvent(new ErrorEvent("error", { error: new Error("a different bug") }));
    monitor.capture(new TypeError("x is undefined"), { source: "render" });
    for (const run of queued) run();

    expect(monitor.reports().map((report) => [report.source, report.message])).toEqual([
      ["render", "x is undefined"],
      ["uncaught", "a different bug"],
    ]);
  });

  it("can be removed", () => {
    const monitor = createMonitor({ transport: () => undefined });
    installGlobalErrorHandlers(monitor, window, now)();
    // Nothing handles it now, so stop it reaching Vitest as an uncaught error.
    const swallow = (event: Event) => event.preventDefault();
    window.addEventListener("error", swallow);

    window.dispatchEvent(
      new ErrorEvent("error", { error: new Error("ignored"), cancelable: true }),
    );
    window.removeEventListener("error", swallow);
    window.dispatchEvent(unhandledRejection("ignored"));

    expect(monitor.reports()).toEqual([]);
  });
});
