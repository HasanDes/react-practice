// @vitest-environment jsdom
// D3-5 "Done when": revisiting a page reuses existing data, and stock is
// refreshed after an order is placed. Real App, store and API client against
// the mock backend; "revisit" = leave the page and come back in the same
// browser session (the cache lives in memory, like the SPA).

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { connectApiToStore } from "../../store/connectApi.ts";
import { makeStore, type AppStore } from "../../store/store.ts";
import TestApp from "../../test/TestApp.tsx";
import { CATALOG_STALE_MS } from "./catalogCache.ts";

const server = setupServer();
let db: MockDb;
let disconnect: () => void = () => undefined;
/** GET requests as path + query, e.g. "/api/products?page=1…" or "/api/products/p-0001". */
let gets: string[];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", ({ request }) => {
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    gets.push(url.pathname + url.search);
  });
});
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  gets = [];
  window.sessionStorage.clear();
});
afterEach(() => {
  disconnect();
  vi.useRealTimers();
});

/** The product list page's own request (related products also call /api/products, sorted by rating). */
const listRequests = () =>
  gets.filter((url) => url.startsWith("/api/products?") && !url.includes("sort=rating-desc"))
    .length;
const detailRequests = (id: string) => gets.filter((path) => path === `/api/products/${id}`).length;

function signedInStore(): AppStore {
  const session = db.login(DEMO_USER.email, DEMO_USER.password);
  if (!session) throw new Error("login failed");
  const store = makeStore({ session: { status: "authenticated", ...session } });
  disconnect = connectApiToStore(store);
  return store;
}

/** Open `path` in the app. Calling it again after unmount() = a revisit, same session. */
function visit(path: string, store: AppStore = makeStore()) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={store} />
    </MemoryRouter>,
  );
  return { user, ...view };
}

/** The product card links in the grid. */
async function cards(): Promise<HTMLElement[]> {
  const grid = await screen
    .findByRole("list", { name: /products/i })
    .catch(() => screen.findByRole("list"));
  return within(grid).getAllByRole("link");
}

describe("revisiting reuses data the app already has", () => {
  it("going back to the list shows it at once, without asking the server again", async () => {
    const { user } = visit("/");
    const [first] = await cards();
    if (!first) throw new Error("no cards");
    expect(listRequests()).toBe(1);

    await user.click(first);
    await user.click(await screen.findByRole("link", { name: "← Back to products" }));

    // No loading state, no new list request.
    expect(screen.queryByText("Loading products…")).not.toBeInTheDocument();
    expect(await cards()).not.toHaveLength(0);
    expect(listRequests()).toBe(1);
  });

  it("opening a product from the list shows it without a details request", async () => {
    const { user } = visit("/");
    const [first] = await cards();
    if (!first) throw new Error("no cards");
    const name = first.textContent;
    expect(name).not.toBe("");

    await user.click(first);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(name);
    expect(gets.filter((path) => path.startsWith("/api/products/"))).toHaveLength(0);
  });

  it("revisiting a product page reuses it; after 30 s it shows at once and refreshes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    db.setStock("p-0001", 8);
    const first = visit("/products/p-0001");
    expect(await screen.findByText("In stock (8)")).toBeInTheDocument();
    first.unmount();

    db.setStock("p-0001", 7); // someone else bought one meanwhile
    const second = visit("/products/p-0001");
    expect(screen.getByText("In stock (8)")).toBeInTheDocument(); // reused: fine for 30 s
    second.unmount();
    expect(detailRequests("p-0001")).toBe(1);

    vi.setSystemTime(Date.now() + CATALOG_STALE_MS);
    visit("/products/p-0001");
    expect(screen.getByText("In stock (8)")).toBeInTheDocument(); // stale, but shown at once…
    expect(await screen.findByText("In stock (7)")).toBeInTheDocument(); // …then refreshed
    expect(detailRequests("p-0001")).toBe(2);
  });
});

describe("stock is refreshed after an order is placed", () => {
  it("pages showing what was bought are fetched again; others are still reused", async () => {
    db.setStock("p-0001", 5);
    const store = signedInStore();

    // Browse two products (both cached), buy one of them.
    const other = visit("/products/p-0002", store);
    await screen.findByRole("button", { name: "Add to cart" });
    other.unmount();
    const { user, unmount } = visit("/products/p-0001", store);
    expect(await screen.findByText("Only 5 left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("link", { name: /^Cart, 2 items/ }));
    await user.click(await screen.findByRole("link", { name: "Go to checkout" }));
    await user.click(await screen.findByRole("button", { name: "Place order" }));
    await screen.findByRole("heading", { name: /your order is placed/i });
    unmount();
    expect(detailRequests("p-0001")).toBe(1);

    // Back to the product bought: real stock, not the pre-order "5 left".
    const bought = visit("/products/p-0001", store);
    expect(screen.queryByText("Only 5 left")).not.toBeInTheDocument();
    const detail = await screen.findByText("Only 3 left");
    expect(within(detail.parentElement ?? document.body).queryByText("Only 5 left")).toBeNull();
    expect(detailRequests("p-0001")).toBe(2);
    bought.unmount();

    // The product not bought is still served from the cache.
    visit("/products/p-0002", store);
    await screen.findByRole("button", { name: "Add to cart" });
    await waitFor(() => expect(detailRequests("p-0002")).toBe(1));
  });
});
