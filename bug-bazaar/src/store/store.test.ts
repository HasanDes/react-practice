// D3-1 "Done when": the header badge uses a derived value, and state only
// changes through defined updates. These are the store-level tests.

import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { configureApiClient, getMe, login } from "../api/index.ts";
import {
  selectIsAuthenticated,
  selectSession,
  selectToken,
  sessionEnded,
  sessionStarted,
} from "../features/auth/sessionSlice.ts";
import {
  cartCleared,
  itemAdded,
  itemRemoved,
  quantityChanged,
  selectCartCount,
  selectCartTotal,
  selectQuantityInCart,
} from "../features/cart/cartSlice.ts";
import { createControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";
import type { Product } from "../types/api.ts";
import { connectApiToStore } from "./connectApi.ts";
import { makeStore } from "./store.ts";

const product = (id: string, price: number, stock: number): Product => ({
  id,
  name: `Product ${id}`,
  price,
  category: "ducks",
  stock,
  rating: 4,
  imageUrl: "/images/products/ducks.svg",
});

const duck = product("p-1", 1999, 5); // $19.99, 5 in stock
const keyboard = product("p-2", 12_999, 2); // $129.99, 2 in stock

describe("cart: defined updates", () => {
  it("itemAdded adds a line, and adding again merges into it", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: duck }));
    store.dispatch(itemAdded({ product: duck, quantity: 2 }));
    expect(store.getState().cart.items).toEqual([
      expect.objectContaining({ productId: "p-1", quantity: 3, price: 1999 }),
    ]);
  });

  it("never lets a quantity exceed stock (adding or setting)", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: keyboard, quantity: 5 }));
    expect(selectQuantityInCart(store.getState(), "p-2")).toBe(2);
    store.dispatch(quantityChanged({ productId: "p-2", quantity: 99 }));
    expect(selectQuantityInCart(store.getState(), "p-2")).toBe(2);
  });

  it("ignores sold-out products", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: product("p-3", 500, 0) }));
    expect(store.getState().cart.items).toEqual([]);
  });

  it("quantityChanged to 0 removes the line; itemRemoved and cartCleared remove items", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: duck }));
    store.dispatch(itemAdded({ product: keyboard }));
    store.dispatch(quantityChanged({ productId: "p-1", quantity: 0 }));
    expect(store.getState().cart.items.map((item) => item.productId)).toEqual(["p-2"]);
    store.dispatch(itemRemoved({ productId: "p-2" }));
    expect(store.getState().cart.items).toEqual([]);
    store.dispatch(itemAdded({ product: duck }));
    store.dispatch(cartCleared());
    expect(store.getState().cart.items).toEqual([]);
  });

  it("state is frozen: anything outside a reducer that tries to mutate it throws", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: duck }));
    const { items } = store.getState().cart;
    const [line] = items;
    if (!line) throw new Error("expected a cart line");
    expect(Object.isFrozen(items)).toBe(true);
    expect(() => {
      items.push({ ...line, productId: "sneaky" });
    }).toThrow(TypeError);
    expect(() => {
      line.quantity = 999;
    }).toThrow(TypeError);
    expect(selectCartCount(store.getState())).toBe(1); // unchanged
  });
});

describe("cart: derived values", () => {
  it("count sums quantities and total sums price × quantity, in cents", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: duck, quantity: 3 }));
    store.dispatch(itemAdded({ product: keyboard, quantity: 1 }));
    expect(selectCartCount(store.getState())).toBe(4);
    expect(selectCartTotal(store.getState())).toBe(3 * 1999 + 12_999); // 18,996 cents
  });

  it("selectors are memoized: they recompute only when the items change", () => {
    const store = makeStore();
    store.dispatch(itemAdded({ product: duck }));
    selectCartCount.resetRecomputations();

    selectCartCount(store.getState());
    store.dispatch(sessionStarted({ token: "t", user: DEMO_USER })); // unrelated update
    selectCartCount(store.getState());
    expect(selectCartCount.recomputations()).toBe(1);

    store.dispatch(itemAdded({ product: duck }));
    expect(selectCartCount(store.getState())).toBe(2);
    expect(selectCartCount.recomputations()).toBe(2);
  });
});

describe("session", () => {
  it("is either anonymous or authenticated with a token and user", () => {
    const store = makeStore();
    expect(selectSession(store.getState())).toEqual({ status: "anonymous", endedBecause: null });

    store.dispatch(sessionStarted({ token: "abc", user: DEMO_USER }));
    expect(selectIsAuthenticated(store.getState())).toBe(true);
    expect(selectToken(store.getState())).toBe("abc");

    store.dispatch(sessionEnded({ reason: "logout" }));
    expect(selectSession(store.getState())).toEqual({
      status: "anonymous",
      endedBecause: "logout",
    });
    expect(selectToken(store.getState())).toBeNull();
  });
});

describe("store ↔ data layer wiring", () => {
  const server = setupServer();
  let disconnect: () => void = () => undefined;
  let restoreBase: () => void = () => undefined;

  beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
  afterAll(() => server.close());
  afterEach(() => {
    disconnect();
    restoreBase();
  });

  function setup() {
    const storage = createMemoryStorage();
    server.resetHandlers(
      ...createHandlers({ db: createDb({ storage }), controls: createControls({ storage }) }),
    );
    const store = makeStore();
    disconnect = connectApiToStore(store);
    restoreBase = configureApiClient({ baseUrl: "http://localhost/api" });
    return store;
  }

  it("authenticated calls send the session's token", async () => {
    const store = setup();
    const session = await login({ email: DEMO_USER.email, password: DEMO_USER.password });
    store.dispatch(sessionStarted(session));
    await expect(getMe()).resolves.toMatchObject({ email: DEMO_USER.email });
  });

  it("a 401 on an authenticated call ends the session as 'expired'", async () => {
    const store = setup();
    store.dispatch(sessionStarted({ token: "revoked-token", user: DEMO_USER }));
    server.use(http.get("*/api/me", () => new HttpResponse(null, { status: 401 })));

    await expect(getMe()).rejects.toMatchObject({ status: 401 });
    expect(selectSession(store.getState())).toEqual({
      status: "anonymous",
      endedBecause: "expired",
    });
  });
});
