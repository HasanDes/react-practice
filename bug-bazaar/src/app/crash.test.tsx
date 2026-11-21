// @vitest-environment jsdom
// D4-7 "Done when": a thrown error shows a fallback screen and is logged,
// instead of crashing the app (a blank page).

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "../components/ErrorBoundary.tsx";
import { crashTest } from "../dev/crashTest.ts";
import { installGlobalErrorHandlers } from "../monitoring/globalHandlers.ts";
import { createMonitor, monitor } from "../monitoring/monitor.ts";
import TestApp from "../test/TestApp.tsx";
import AppCrashed from "./AppCrashed.tsx";
import PageCrashed from "./PageCrashed.tsx";

let uninstall: () => void = () => undefined;
beforeEach(() => {
  // React (and jsdom) print caught errors; the monitor's console transport
  // too. Expected here, so keep the output clean.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  window.scrollTo = () => undefined;
});
afterEach(() => {
  uninstall();
  crashTest.disarm();
  monitor.clear();
  vi.restoreAllMocks();
});

/** Throws a *new* error on every render, like a real bug does. */
function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new TypeError("Cannot read properties of undefined (reading 'price')");
  return <p>All good</p>;
}

describe("a page that throws while rendering", () => {
  it("shows a fallback in place of the page, keeps the header, and logs it once", async () => {
    // As in main.tsx: the global handlers run too, and must not double-log.
    uninstall = installGlobalErrorHandlers(monitor);
    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <TestApp />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { level: 1, name: /cart/i })).toBeInTheDocument();

    act(() => crashTest.arm());

    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Something went wrong on this page",
    });
    expect(heading).toHaveFocus();
    // The header still works: the rest of the app didn't crash.
    expect(screen.getByRole("link", { name: /cart/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The Bug Bazaar" })).toBeInTheDocument();
    // The raw error text never reaches the screen (D3-4).
    expect(screen.queryByText(/thrown on purpose/)).not.toBeInTheDocument();

    // Logged once (after the global handler's deferred check), with where it broke.
    await new Promise((resolve) => setTimeout(resolve, 10));
    const reports = monitor.reports();
    expect(reports).toHaveLength(1);
    const [report] = reports;
    expect(report).toMatchObject({ source: "render", name: "CrashTestError" });
    expect(report?.componentStack).toContain("CrashOnDemand");
    // The user sees the same reference as the log, to quote to support.
    expect(screen.getByText(report?.id ?? "missing")).toBeInTheDocument();
    expect(document.title).toMatch(/^Something went wrong/);
  });

  it("recovers with Try again once the cause is gone", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/cart"]}>
        <TestApp />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: /cart/i });
    act(() => crashTest.arm());

    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByRole("heading", { level: 1, name: /cart/i })).toBeInTheDocument();
  });

  it("recovers when the user navigates away with the header", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <TestApp />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1, name: /sign in/i });
    act(() => crashTest.arm());
    screen.getByRole("heading", { level: 1, name: "Something went wrong on this page" });

    await user.click(screen.getByRole("link", { name: /cart/i }));

    expect(await screen.findByRole("heading", { level: 1, name: /cart/i })).toBeInTheDocument();
  });
});

describe("ErrorBoundary", () => {
  it("logs a real-world error (a new one each render) once, and shows it again if retrying fails", async () => {
    const local = createMonitor({ transport: () => undefined, getRoute: () => "/x" });
    uninstall = installGlobalErrorHandlers(local);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ErrorBoundary monitor={local} fallback={(props) => <PageCrashed {...props} />}>
          <Bomb explode />
        </ErrorBoundary>
      </MemoryRouter>,
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(local.reports()).toMatchObject([{ source: "render", name: "TypeError" }]);

    // Still broken: Try again shows the fallback again, with a new reference.
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(
      screen.getByRole("heading", { name: "Something went wrong on this page" }),
    ).toBeInTheDocument();
    const reports = local.reports();
    expect(reports.map((report) => report.source)).toEqual(["render", "render"]);
    expect(screen.getByText(reports[1]?.id ?? "missing")).toBeInTheDocument();
  });

  it("resets when its resetKey changes", () => {
    const local = createMonitor({ transport: () => undefined });
    function Harness() {
      const [key, setKey] = useState(1);
      return (
        <>
          <button type="button" onClick={() => setKey((value) => value + 1)}>
            Navigate
          </button>
          <ErrorBoundary monitor={local} resetKey={key} fallback={() => <p>Fallback</p>}>
            <Bomb explode={key === 1} />
          </ErrorBoundary>
        </>
      );
    }
    render(<Harness />);
    expect(screen.getByText("Fallback")).toBeInTheDocument();

    act(() => screen.getByRole("button", { name: "Navigate" }).click());

    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("the last-resort fallback offers a reload when the whole app crashes", async () => {
    const local = createMonitor({ transport: () => undefined });
    render(
      <ErrorBoundary monitor={local} fallback={(props) => <AppCrashed {...props} />}>
        <Bomb explode />
      </ErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "The Bug Bazaar hit a problem" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
    await waitFor(() => expect(local.reports()).toHaveLength(1));
    expect(screen.getByText(local.reports()[0]?.id ?? "missing")).toBeInTheDocument();
  });
});
