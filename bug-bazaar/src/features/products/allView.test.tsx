// @vitest-environment jsdom
// D4-3: the "all products" view. One scrolling list of every matching
// product, virtualized: only rows near the viewport are in the DOM.
// (Scrolling smoothness and scroll restore are measured in a real browser:
// scripts/perf-scroll.mjs. jsdom has no layout.)

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import TestApp from "../../test/TestApp.tsx";
import { parseFilters, toSearchParams } from "./filters.ts";

const server = setupServer();
let db: MockDb;
/** page numbers requested with pageSize=100 (the all view's pages) */
let allPages: number[];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/products" && url.searchParams.get("pageSize") === "100") {
      allPages.push(Number(url.searchParams.get("page") ?? "1"));
    }
  });
});
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  allPages = [];
  window.scrollTo = () => undefined; // jsdom doesn't implement it
});

function LocationProbe() {
  const { search } = useLocation();
  return <output data-testid="search">{search}</output>;
}

function renderAt(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp />
      <LocationProbe />
    </MemoryRouter>,
  );
  return user;
}

const allList = () => screen.findByRole("list", { name: /^All [\d,]+ products$/ });

describe("filters: the view is part of the URL", () => {
  it("view=all round-trips, and a page number means nothing in it", () => {
    const filters = parseFilters(new URLSearchParams("view=all&page=3&category=coffee"));
    expect(filters).toMatchObject({ view: "all", page: 1, category: "coffee" });
    expect(toSearchParams(filters).toString()).toBe("category=coffee&view=all");
    expect(parseFilters(new URLSearchParams("view=bogus")).view).toBe("pages");
  });
});

describe("the all view", () => {
  it("the toggle switches to one list of all 5,000, with only a few in the DOM", async () => {
    const user = renderAt("/");
    await screen.findAllByRole("listitem");
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(screen.getByTestId("search")).toHaveTextContent("?view=all");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    const list = await allList();
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThan(500); // virtualized: nowhere near 5,000
    // Each card knows its place in the whole set.
    expect(items[0]).toHaveAttribute("aria-posinset", "1");
    expect(items[0]).toHaveAttribute("aria-setsize", "5000");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).not.toBeInTheDocument();
  });

  it("filters apply to the whole list, and Clear filters keeps the view", async () => {
    const user = renderAt("/?view=all&category=coffee");
    const coffee = db.listProducts().filter((product) => product.category === "coffee").length;
    const list = await allList();
    const [first] = within(list).getAllByRole("listitem");
    expect(first).toHaveAttribute("aria-setsize", String(coffee));

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?view=all"));
    expect(screen.getByTestId("search")).not.toHaveTextContent("category");
  });

  it("loads further pages of 100 as more rows come into view", async () => {
    renderAt("/?view=all");
    await allList();
    // (jsdom has no layout: rows measure 0 px, so the first "viewport" spans a
    // few pages. What matters is that scrolling requests pages further on.)
    await waitFor(() => expect(allPages.length).toBeGreaterThan(0));
    const initiallyLoaded = Math.max(...allPages);
    expect(initiallyLoaded).toBeLessThan(50);

    // Scroll far down: the rows there need page 3 or later.
    Object.defineProperty(window, "scrollY", { value: 30_000, configurable: true });
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    await waitFor(() => expect(Math.max(...allPages)).toBeGreaterThan(initiallyLoaded));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("24 per page goes back to pages", async () => {
    const user = renderAt("/?view=all");
    await allList();
    await user.click(screen.getByRole("button", { name: "24 per page" }));
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent(/^$/));
    expect(await screen.findByRole("navigation", { name: "Pagination" })).toBeInTheDocument();
  });
});
