// @vitest-environment jsdom
// D3-1 UI: the header badge shows the *derived* item count, wherever the
// change comes from.

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { makeStore, type AppStore } from "../../store/store.ts";
import TestApp from "../../test/TestApp.tsx";
import { cartCount } from "../../test/queries.ts";
import { formatPrice } from "../../utils/formatPrice.ts";
import { itemAdded, quantityChanged } from "./cartSlice.ts";

const server = setupServer();
let db: MockDb;
let store: AppStore;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  store = makeStore();
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
});

function renderAt(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={store} />
    </MemoryRouter>,
  );
  return { user };
}

/** The cart count as the header announces it ("Cart, 3 items"). */
const badge = () => cartCount();

describe("header badge", () => {
  it("starts at 0 and counts units added from the details page", async () => {
    db.setStock("p-0042", 3);
    const { user } = renderAt("/products/p-0042");
    expect(screen.getByRole("link", { name: "Cart, 0 items" })).toBeInTheDocument();

    const add = await screen.findByRole("button", { name: "Add to cart" });
    await user.click(add);
    expect(badge()).toBe(1);
    expect(screen.getByRole("link", { name: "Cart, 1 item" })).toBeInTheDocument();
    expect(screen.getByText(/Added to cart\. You have 1 in your cart\./)).toBeInTheDocument();

    await user.click(add);
    expect(badge()).toBe(2);
  });

  it("stops at stock: the button disables once all stock is in the cart", async () => {
    db.setStock("p-0042", 2);
    const { user } = renderAt("/products/p-0042");
    await user.click(await screen.findByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("button", { name: "Add to cart" }));

    expect(badge()).toBe(2);
    expect(
      screen.getByRole("button", { name: /all available stock is in your cart/i }),
    ).toBeDisabled();
  });

  it("is derived from the store: a change made anywhere updates it", async () => {
    db.setStock("p-0042", 10);
    const { user } = renderAt("/products/p-0042");
    await user.click(await screen.findByRole("button", { name: "Add to cart" }));

    act(() => {
      store.dispatch(quantityChanged({ productId: "p-0042", quantity: 7 }));
    });
    expect(badge()).toBe(7);
  });

  it("sold-out products can't be added", async () => {
    db.setStock("p-0042", 0);
    renderAt("/products/p-0042");
    expect(await screen.findByRole("button", { name: "Sold out" })).toBeDisabled();
  });
});

describe("cart page", () => {
  it("lists lines and shows the derived count and total, formatted from cents", async () => {
    db.setStock("p-0001", 5);
    db.setStock("p-0002", 5);
    const first = db.getProduct("p-0001");
    const second = db.getProduct("p-0002");
    if (!first || !second) throw new Error("seed products missing");

    const { user } = renderAt("/products/p-0001");
    await user.click(await screen.findByRole("button", { name: "Add to cart" }));
    await user.click(screen.getByRole("button", { name: "Add to cart" }));
    act(() => {
      store.dispatch(itemAdded({ product: second, quantity: 1 }));
    });

    await user.click(screen.getByRole("link", { name: "Cart, 3 items" }));
    const list = await screen.findByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("cart-count")).toHaveTextContent("3");
    expect(screen.getByTestId("cart-total")).toHaveTextContent(
      formatPrice(first.price * 2 + second.price),
    );
  });

  it("an empty cart offers a way back to the products", () => {
    renderAt("/cart");
    expect(screen.getByText("Your cart is empty")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse products" })).toBeInTheDocument();
  });
});
