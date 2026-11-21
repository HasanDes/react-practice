// @vitest-environment jsdom
// D2-6 "Done when": typing fast never shows results for an old query.
// The mock's race mode makes shorter (older) searches answer *slower*, so
// responses arrive in reverse order: the worst case for search.

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import TestApp from "../../test/TestApp.tsx";
import { createControls, raceDelay, type MockControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { parseProductQuery, queryProducts } from "../../mocks/queryProducts.ts";
import { SEARCH_DEBOUNCE_MS } from "./components/ProductFilters.tsx";

const RACE_STEP_MS = 100; // "d" answers in 500 ms, "duck" in 200 ms

const server = setupServer();
let db: MockDb;
let controls: MockControls;
/** Every product-list request with a search, in the order they were sent. */
let searchRequests: { search: string; signal: AbortSignal }[];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", ({ request }) => {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");
    if (url.pathname === "/api/products" && search)
      searchRequests.push({ search, signal: request.signal });
  });
});
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  controls = createControls({ storage });
  controls.setRace(RACE_STEP_MS);
  searchRequests = [];
  server.resetHandlers(...createHandlers({ db, controls }));
});

function renderStore(options?: Parameters<typeof userEvent.setup>[0]) {
  const user = userEvent.setup(options);
  render(
    <MemoryRouter initialEntries={["/"]}>
      <TestApp />
    </MemoryRouter>,
  );
  return { user };
}

const searchBox = () => screen.getByRole("searchbox", { name: "Search" });
const summary = () => document.querySelector(".result-count")?.textContent ?? "";

/** The true total for a search, straight from the mock's data. */
function expectedTotal(search: string) {
  return queryProducts(db.listProducts(), parseProductQuery(new URLSearchParams({ search }))).total;
}

/** Record every result summary shown, e.g. `1,228 products for “du”`. */
function recordSummaries() {
  const shown: string[] = [];
  const observer = new MutationObserver(() => {
    const text = summary();
    if (text && text !== shown.at(-1)) shown.push(text);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { shown, stop: () => observer.disconnect() };
}

describe("race mode (the simulation)", () => {
  it("makes older, shorter searches slower, so responses arrive in reverse order", () => {
    expect(["d", "du", "duc", "duck"].map((q) => raceDelay(q, 100))).toEqual([500, 400, 300, 200]);
    expect(controls.nextDelay({ route: "products:list", search: "d" })).toBe(500);
    expect(controls.nextDelay({ route: "products:get", search: "" })).toBe(0); // list only
  });
});

describe("search always shows results for the latest query", () => {
  it("with slow, out-of-order responses, no older query's results ever appear", async () => {
    // Pauses longer than the debounce, so every prefix is sent: d, du, duc, duck.
    const { user } = renderStore({ delay: SEARCH_DEBOUNCE_MS + 50 });
    await screen.findByText("5,000 products");
    const record = recordSummaries();

    await user.type(searchBox(), "duck");
    await screen.findByText(
      `${expectedTotal("duck").toLocaleString("en-US")} products for “duck”`,
      undefined,
      {
        timeout: 3000,
      },
    );
    // Wait out every slower, older response ("d" takes 500 ms).
    await new Promise((resolve) => setTimeout(resolve, raceDelay("d", RACE_STEP_MS) + 200));
    record.stop();

    // 1. Every result set that appeared matches the query it's labeled with:
    //    an old response never shows up under a newer query's name.
    const typed = ["d", "du", "duc", "duck"];
    const shownQueries: string[] = [];
    for (const text of record.shown) {
      const match = /^([\d,]+) products? for “(.+)”$/.exec(text);
      if (!match) continue; // "Searching…" while typing
      const [, count = "", query = ""] = match;
      expect(Number(count.replace(/,/g, ""))).toBe(expectedTotal(query));
      shownQueries.push(query);
    }
    // 2. Results only ever move forward to newer queries, never back.
    const order = shownQueries.map((query) => typed.indexOf(query));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // 3. It ends on the latest query, and stays there.
    expect(shownQueries.at(-1)).toBe("duck");
    expect(summary()).toBe(`${expectedTotal("duck").toLocaleString("en-US")} products for “duck”`);

    // The older requests really were cancelled, not just ignored.
    expect(searchRequests.map((request) => request.search)).toEqual(typed);
    const older = searchRequests.filter((request) => request.search !== "duck");
    expect(older.filter((request) => request.signal.aborted).length).toBeGreaterThanOrEqual(2);
    // Real timers on purpose (real debounce, real out-of-order delays): about
    // 2.5 s of deliberate waiting. Alone it takes ~3 s, but under the full
    // parallel suite it once crossed Vitest's 5 s default (D4-3). A generous
    // limit keeps it from being flaky in CI, where a failure blocks merging.
  }, 15_000);

  it("typing fast sends one request, for the final query only", async () => {
    const { user } = renderStore(); // no pauses between keystrokes
    await screen.findByText("5,000 products");

    await user.type(searchBox(), "keyboard");
    await screen.findByText(/products for “keyboard”/, undefined, { timeout: 3000 });
    expect(searchRequests.map((request) => request.search)).toEqual(["keyboard"]);
  });

  it("while a typed search waits to apply, the old results are marked outdated", async () => {
    const { user } = renderStore();
    await screen.findByText("5,000 products");

    await user.type(searchBox(), "du");
    expect(summary()).toBe("Searching…");
    // Marked busy for assistive tech (and dimmed by CSS) while the new search is pending.
    const results = document.querySelector(".results");
    expect(results).toHaveAttribute("aria-busy", "true");

    await screen.findByText(/products for “du”/, undefined, { timeout: 3000 });
    expect(results).toHaveAttribute("aria-busy", "false");
  });

  it("Enter searches immediately, without waiting for the pause", async () => {
    controls.setRace(0);
    const { user } = renderStore();
    await screen.findByText("5,000 products");

    await user.type(searchBox(), "coffee{Enter}");
    await waitFor(() =>
      expect(searchRequests.map((request) => request.search)).toEqual(["coffee"]),
    );
    expect(await screen.findByText(/products for “coffee”/)).toBeInTheDocument();
  });

  it("typing and then undoing back to the current search doesn't refetch", async () => {
    controls.setRace(0);
    const { user } = renderStore();
    await screen.findByText("5,000 products");

    await user.type(searchBox(), "x{Backspace}");
    await new Promise((resolve) => setTimeout(resolve, SEARCH_DEBOUNCE_MS + 100));
    expect(searchRequests).toEqual([]);
    expect(summary()).toBe("5,000 products");
  });
});
