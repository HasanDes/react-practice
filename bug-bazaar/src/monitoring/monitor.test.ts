// D4-7: the monitor turns any thrown value into one report, hands it to the
// transport, and never becomes a second failure itself.

import { describe, expect, it, vi } from "vitest";
import { createMonitor, type ErrorReport, type MonitorOptions } from "./monitor.ts";

function setup(options: MonitorOptions = {}) {
  const sent: ErrorReport[] = [];
  let next = 0;
  const monitor = createMonitor({
    transport: (report) => sent.push(report),
    makeId: () => `id-${String(++next)}`,
    now: () => new Date("2026-11-22T10:00:00.000Z"),
    getRoute: () => "/products/p-0001",
    mode: "test",
    ...options,
  });
  return { monitor, sent };
}

describe("monitor", () => {
  it("builds a report with what, where and when, and sends it", () => {
    const { monitor, sent } = setup();
    const error = new TypeError("price is undefined");

    const report = monitor.capture(error, {
      source: "render",
      componentStack: "\n  at ProductCard",
    });

    expect(report).toEqual({
      id: "id-1",
      source: "render",
      name: "TypeError",
      message: "price is undefined",
      stack: error.stack,
      componentStack: "\n  at ProductCard",
      route: "/products/p-0001",
      time: "2026-11-22T10:00:00.000Z",
      mode: "test",
    });
    expect(sent).toEqual([report]);
    expect(monitor.reports()).toEqual([report]);
  });

  it("reports the same error object once, however many places see it", () => {
    const { monitor, sent } = setup();
    const error = new Error("boom");

    const first = monitor.capture(error, { source: "uncaught" });
    const second = monitor.capture(error, { source: "render" });

    expect(second).toBe(first);
    expect(sent).toHaveLength(1);
    expect(monitor.hasCaptured(error)).toBe(true);
    expect(monitor.hasCaptured(new Error("boom"))).toBe(false);
  });

  it("copes with things that aren't Errors being thrown", () => {
    const { monitor } = setup();

    expect(monitor.capture("just a string", { source: "uncaught" })).toMatchObject({
      name: "NonError",
      message: "just a string",
    });
    expect(monitor.capture({ code: 42 }, { source: "unhandled-rejection" })).toMatchObject({
      name: "NonError",
      message: '{"code":42}',
    });
    expect(monitor.capture(undefined, { source: "unhandled-rejection" }).message).toBe("undefined");
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(monitor.capture(circular, { source: "uncaught" }).message).toBe("[object Object]");
  });

  it("keeps only the most recent reports", () => {
    const { monitor } = setup({ maxReports: 3 });
    for (let i = 1; i <= 5; i++)
      monitor.capture(new Error(`e${String(i)}`), { source: "uncaught" });

    expect(monitor.reports().map((report) => report.message)).toEqual(["e3", "e4", "e5"]);
    monitor.clear();
    expect(monitor.reports()).toEqual([]);
  });

  it("a broken transport doesn't turn one error into two", () => {
    const transport = vi.fn(() => {
      throw new Error("logging service is down");
    });
    const { monitor } = setup({ transport });

    expect(() => monitor.capture(new Error("boom"), { source: "uncaught" })).not.toThrow();
    expect(transport).toHaveBeenCalledOnce();
    expect(monitor.reports()).toHaveLength(1);
  });
});
