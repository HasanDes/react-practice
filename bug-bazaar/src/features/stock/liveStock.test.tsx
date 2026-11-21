// @vitest-environment jsdom
// D4-4 "Done when", end to end: the real app, store and feed, talking to the
// mock stock server over a (mocked) WebSocket. Stock updates live, the feed
// recovers after a disconnect, and it stops when the page closes.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createStockFeed } from "../../api/index.ts";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { createStockFeedServer, type StockFeedServer } from "../../mocks/stockFeed.ts";
import { makeStore, type AppStore } from "../../store/store.ts";
import TestApp from "../../test/TestApp.tsx";
import { itemAdded } from "../cart/cartSlice.ts";
import { startLiveStock } from "./liveStock.tsx";

const server = setupServer();
let db: MockDb;
let feedServer: StockFeedServer;
let store: AppStore;
let liveStock: ReturnType<typeof startLiveStock>;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  feedServer = createStockFeedServer({ db }); // no random sales: the test makes every change
  server.resetHandlers(
    ...createHandlers({ db, controls: createControls({ storage }) }),
    feedServer.handler,
  );
  store = makeStore();
  liveStock = startLiveStock(store, {
    url: "ws://localhost/api/stock",
    // No jitter, so the first retry comes after a predictable 500 ms.
    createFeed: (options) => createStockFeed({ ...options, random: () => 0 }),
  });
});
afterEach(() => {
  liveStock.stop();
  feedServer.dispose();
});

function renderAt(path: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={store} liveStock={liveStock.registry} />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const connected = () => waitFor(() => expect(feedServer.connections).toBe(1));

describe("stock updates live", () => {
  it("the details page shows a new stock number without a refresh, and announces it", async () => {
    db.setStock("p-0001", 9);
    renderAt("/products/p-0001");
    expect(await screen.findByText("In stock (9)")).toBeInTheDocument();
    await connected();

    act(() => {
      db.setStock("p-0001", 3); // another shopper buys 6
    });
    const line = await screen.findByText("Only 3 left");
    expect(line.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
    // Add to cart's limit follows the live number too.
    expect(store.getState().liveStock.stock["p-0001"]).toBe(3);
  });

  it("product cards in the list update too", async () => {
    renderAt("/");
    await screen.findAllByRole("listitem");
    await connected();
    act(() => {
      db.setStock("p-0001", 0);
    });
    const name = db.getProduct("p-0001")?.name ?? "";
    const card = (await screen.findByRole("link", { name })).closest("li");
    await waitFor(() => expect(card).toHaveTextContent("Sold out"));
  });

  it("a cart line whose stock drops below its quantity is lowered, with a notice", async () => {
    db.setStock("p-0001", 5);
    const product = db.getProduct("p-0001");
    if (!product) throw new Error("missing");
    store.dispatch(itemAdded({ product, quantity: 3 }));
    renderAt("/cart");
    await connected();

    act(() => {
      db.setStock("p-0001", 1);
    });
    expect(
      await screen.findByText(/only has 1 left now, so we lowered the quantity/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("cart-badge")).toHaveTextContent("1");
  });
});

describe("recovers after a disconnect", () => {
  it("reconnects by itself and catches up on a change it missed while disconnected", async () => {
    db.setStock("p-0001", 9);
    renderAt("/products/p-0001");
    await screen.findByText("In stock (9)");
    await connected();

    act(() => {
      feedServer.drop(); // the server restarts
      db.setStock("p-0001", 2); // …and stock changes while nobody is connected
    });
    expect(await screen.findByText("Live stock paused, reconnecting…")).toBeInTheDocument();
    expect(screen.getByText("In stock (9)")).toBeInTheDocument(); // not heard yet

    // After the backoff the client reconnects; the snapshot brings the missed change.
    expect(
      await screen.findByText("Only 2 left", undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Live stock paused, reconnecting…")).not.toBeInTheDocument();
    expect(feedServer.connections).toBe(1);
  });
});

describe("stops when the page closes", () => {
  it("leaving product pages closes the connection, and nothing reconnects", async () => {
    const { user } = renderAt("/products/p-0001");
    await screen.findByText(/In stock|Only|Sold out/);
    await connected();

    await user.click(screen.getByRole("link", { name: "Sign in" })); // a page with no products
    await waitFor(() => expect(feedServer.connections).toBe(0));
    expect(store.getState().liveStock.status).toBe("idle");
    await new Promise((resolve) => setTimeout(resolve, 1200)); // longer than a first retry
    expect(feedServer.connections).toBe(0);
  });

  it("unmounting the app (closing the page) leaves no connection", async () => {
    const { unmount } = renderAt("/products/p-0001");
    await connected();
    unmount();
    await waitFor(() => expect(feedServer.connections).toBe(0));
  });
});
