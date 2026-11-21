// @vitest-environment jsdom
// D3-2 "Done when": quantities can't exceed stock, the cart survives a
// reload, a 409 names the item that ran out, and a retried checkout doesn't
// create a duplicate order.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { connectApiToStore } from "../../store/connectApi.ts";
import { makeStore, type AppStore, type RootState } from "../../store/store.ts";
import TestApp from "../../test/TestApp.tsx";
import { cartCount } from "../../test/queries.ts";
import type { OrderItem, Product } from "../../types/api.ts";
import { formatPrice } from "../../utils/formatPrice.ts";
import { itemAdded } from "../cart/cartSlice.ts";
import { loadCart, persistCart } from "../cart/cartStorage.ts";
import { POLL_INTERVAL_MS } from "./pages/OrderConfirmationPage.tsx";

const server = setupServer();
let db: MockDb;
let clock: { now: number };
let store: AppStore;
let disconnect: () => void;
/** Every POST /api/orders sent by the app. */
let orderPosts: Request[];

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/api/orders") {
      orderPosts.push(request);
    }
  });
});
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  clock = { now: 1_000_000 };
  db = createDb({ storage, now: () => clock.now });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  orderPosts = [];
  window.sessionStorage.clear();
});
afterEach(() => disconnect());

function product(id: string): Product {
  const found = db.getProduct(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
}

/** A store with a real session from the mock API, wired to the data layer like main.tsx. */
function signedInStore(extra?: Partial<RootState>) {
  const session = db.login(DEMO_USER.email, DEMO_USER.password);
  if (!session) throw new Error("login failed");
  const created = makeStore({ session: { status: "authenticated", ...session }, ...extra });
  disconnect = connectApiToStore(created);
  return created;
}

function renderAt(path: string, withStore: AppStore) {
  store = withStore;
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={withStore} />
    </MemoryRouter>,
  );
  return { user, ...view };
}

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Email"), DEMO_USER.email);
  await user.type(screen.getByLabelText("Password"), DEMO_USER.password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

const addToCart = (id: string, quantity: number): void =>
  act(() => {
    store.dispatch(itemAdded({ product: product(id), quantity }));
  });
/** The cart count as the header announces it ("Cart, 3 items"). */
const badge = () => String(cartCount());

describe("cart editing: quantities can't exceed stock", () => {
  it("+ and − change the quantity, and + stops at stock", async () => {
    db.setStock("p-0001", 3);
    const { user } = renderAt("/cart", signedInStore());
    addToCart("p-0001", 2);
    const name = product("p-0001").name;

    const plus = screen.getByRole("button", { name: `Increase quantity of ${name}` });
    await user.click(plus);
    expect(badge()).toBe("3");
    // At the limit: marked disabled for assistive tech, but still focusable
    // (a `disabled` button would drop keyboard focus to <body>, D4-1).
    expect(plus).toHaveAttribute("aria-disabled", "true");
    expect(plus).toHaveFocus();
    await user.click(plus); // ignored
    expect(badge()).toBe("3");
    expect(screen.getByText(/Only 3 available/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: `Decrease quantity of ${name}` }));
    expect(badge()).toBe("2");
  });

  it("typing a number above stock is clamped to stock", async () => {
    db.setStock("p-0001", 4);
    const { user } = renderAt("/cart", signedInStore());
    addToCart("p-0001", 1);

    const input = screen.getByRole("spinbutton", {
      name: `Quantity for ${product("p-0001").name}`,
    });
    await user.clear(input);
    await user.type(input, "99{Enter}");
    expect(badge()).toBe("4");
    expect(input).toHaveValue(4);
  });

  it("Remove deletes the line and the total updates", async () => {
    const { user } = renderAt("/cart", signedInStore());
    addToCart("p-0001", 1);
    addToCart("p-0002", 1);

    await user.click(
      screen.getByRole("button", { name: `Remove ${product("p-0001").name} from cart` }),
    );
    expect(
      within(screen.getByRole("list", { name: "Items in your cart" })).getAllByRole("listitem"),
    ).toHaveLength(1);
    expect(screen.getByTestId("cart-total")).toHaveTextContent(
      formatPrice(product("p-0002").price),
    );
  });
});

describe("the cart survives a reload", () => {
  it("a new app instance starts with the saved cart", () => {
    const storage = createMemoryStorage();
    const first = signedInStore();
    persistCart(first, storage);
    const { unmount } = renderAt("/cart", first);
    addToCart("p-0003", 2);
    unmount(); // "reload": all in-memory state is gone

    const saved = loadCart(storage);
    expect(saved?.items).toHaveLength(1);
    renderAt("/cart", makeStore(saved ? { cart: saved } : undefined));
    expect(screen.getByRole("link", { name: product("p-0003").name })).toBeInTheDocument();
    expect(badge()).toBe("2");
  });
});

describe("checkout", () => {
  it("signed out: sends the user to sign in, then back to checkout with the cart", async () => {
    const anonymousStore = makeStore();
    disconnect = connectApiToStore(anonymousStore);
    const { user } = renderAt("/checkout", anonymousStore);
    addToCart("p-0001", 1);

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Place order" })).not.toBeInTheDocument();
    await signIn(user);

    expect(await screen.findByRole("button", { name: "Place order" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Checkout" })).toBeInTheDocument();
    expect(badge()).toBe("1");
  });

  it("places the order, clears the cart and shows a confirmation", async () => {
    db.setStock("p-0001", 10);
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 2);
    const total = formatPrice(product("p-0001").price * 2);
    expect(screen.getByTestId("checkout-total")).toHaveTextContent(total);

    await user.click(screen.getByRole("button", { name: "Place order" }));

    expect(
      await screen.findByRole("heading", { name: /your order is placed/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("order-id")).toHaveTextContent("o-00001");
    expect(screen.getByTestId("order-status")).toHaveTextContent("Order received");
    expect(screen.getByText(total)).toBeInTheDocument();
    expect(badge()).toBe("0");
    expect(product("p-0001").stock).toBe(8);
  });

  it("can't be double-submitted: two quick clicks send one request", async () => {
    // Keep the first request in flight, so the second click lands while it's
    // pending (with an instant response the page would be gone already).
    server.use(
      http.post("*/api/orders", async () => {
        await delay(200);
        return undefined; // then fall through to the real handler
      }),
    );
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 1);
    const button = screen.getByRole("button", { name: "Place order" });

    await user.dblClick(button);
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Placing your order…");
    await screen.findByRole("heading", { name: /your order is placed/i });
    expect(orderPosts).toHaveLength(1);
  });

  it("can't be double-submitted even when both clicks land before React re-renders", async () => {
    // Inside one act() React doesn't re-render between the clicks, so the
    // button isn't disabled yet: only the ref guard can stop the second one.
    // (The D3-2 guard read component state and let this through.)
    server.use(
      http.post("*/api/orders", async () => {
        await delay(200);
        return undefined;
      }),
    );
    renderAt("/checkout", signedInStore());
    addToCart("p-0001", 1);
    const button = screen.getByRole("button", { name: "Place order" });

    act(() => {
      button.click();
      button.click();
    });
    await screen.findByRole("heading", { name: /your order is placed/i });
    expect(orderPosts).toHaveLength(1);
  });

  it("409: names each item that ran out and fixes the cart", async () => {
    db.setStock("p-0001", 5);
    db.setStock("p-0002", 5);
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 3);
    addToCart("p-0002", 2);
    // Meanwhile, other shoppers buy them up.
    db.setStock("p-0001", 1);
    db.setStock("p-0002", 0);

    await user.click(screen.getByRole("button", { name: "Place order" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(`${product("p-0001").name} only has 1 left`);
    expect(alert).toHaveTextContent(`${product("p-0002").name} just sold out`);

    // The cart now matches what's actually available: 1 × p-0001, p-0002 gone.
    expect(badge()).toBe("1");
    expect(screen.getByTestId("checkout-total")).toHaveTextContent(
      formatPrice(product("p-0001").price),
    );

    // Placing it again now succeeds.
    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByTestId("order-id")).toHaveTextContent("o-00001");
  });

  it("409, but the stock is back by the time we check: says so, and leaves the cart alone", async () => {
    // Found rehearsing the D5-9 walkthrough: the page said "only has 10 left,
    // so we lowered the quantity" while the cart still held 2. Between the
    // server's 409 and our refetch, stock can come back (a restock, or
    // another shopper's failed order releasing its reservation).
    db.setStock("p-0001", 10);
    server.use(
      http.post(
        "*/api/orders",
        () =>
          HttpResponse.json(
            {
              error: {
                code: "OUT_OF_STOCK",
                message: "Not enough stock.",
                details: { "p-0001": "only 0 left" },
              },
            },
            { status: 409 },
          ),
        { once: true },
      ),
    );
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 2);

    await user.click(screen.getByRole("button", { name: "Place order" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Stock changed while you were checking out");
    expect(alert).toHaveTextContent(`${product("p-0001").name} is available again`);
    expect(alert).not.toHaveTextContent("lowered");
    expect(badge()).toBe("2");

    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByTestId("order-id")).toHaveTextContent("o-00001");
  });

  it("a retry after a lost response returns the original order, never a second one", async () => {
    db.setStock("p-0001", 10);
    // The server commits the order, but the response never reaches the browser.
    let loseNextResponse = true;
    server.use(
      http.post("*/api/orders", async ({ request }) => {
        if (!loseNextResponse) return undefined; // fall through to the real handler
        loseNextResponse = false;
        const body = (await request.clone().json()) as { items: OrderItem[] };
        db.placeOrder({
          userId: DEMO_USER.id,
          items: body.items,
          idempotencyKey: request.headers.get("idempotency-key"),
        });
        return HttpResponse.error();
      }),
    );
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 2);

    await user.click(screen.getByRole("button", { name: "Place order" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You seem to be offline");
    expect(alert).toHaveTextContent("you won't be charged twice");
    expect(badge()).toBe("2"); // cart kept for the retry

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("order-id")).toHaveTextContent("o-00001");

    // Same key both times; the server made exactly one order and took stock once.
    expect(orderPosts).toHaveLength(2);
    const keys = orderPosts.map((request) => request.headers.get("idempotency-key"));
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
    expect(product("p-0001").stock).toBe(8);
    expect(db.getOrder("o-00002", DEMO_USER.id)).toBeNull();
  });

  it("a 401 at checkout ends the session, keeps the cart, and returns here after sign-in", async () => {
    const { user } = renderAt("/checkout", signedInStore());
    addToCart("p-0001", 1);
    db.expireSessions(); // the token stops working on the server

    await user.click(screen.getByRole("button", { name: "Place order" }));
    expect(await screen.findByText(/your session expired/i)).toHaveAttribute("role", "status");
    expect(store.getState().session).toEqual({ status: "anonymous", endedBecause: "expired" });
    expect(badge()).toBe("1");

    await signIn(user);
    expect(await screen.findByRole("button", { name: "Place order" })).toBeInTheDocument();
    expect(badge()).toBe("1");
  });
});

describe("order confirmation", () => {
  it("polls the status until it completes, and stops when the page closes", async () => {
    const signed = signedInStore();
    db.setStock("p-0001", 5);
    const placed = db.placeOrder({
      userId: DEMO_USER.id,
      items: [{ productId: "p-0001", quantity: 1 }],
      idempotencyKey: null,
    });
    if (!placed.ok) throw new Error("order failed");
    let polls = 0;
    server.events.on("request:start", ({ request }) => {
      if (new URL(request.url).pathname === `/api/orders/${placed.order.id}`) polls += 1;
    });

    const { unmount } = renderAt(`/orders/${placed.order.id}`, signed);
    expect(await screen.findByTestId("order-status")).toHaveTextContent("Order received");

    clock.now += 6_000; // the mock moves the order to "processing"
    await waitFor(
      () => expect(screen.getByTestId("order-status")).toHaveTextContent("Preparing your order"),
      {
        timeout: POLL_INTERVAL_MS + 1500,
      },
    );

    unmount();
    const pollsAtClose = polls;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS + 200));
    expect(polls).toBe(pollsAtClose); // nothing keeps polling after the page closes
  }, 15_000);
});
