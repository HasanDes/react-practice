// @vitest-environment jsdom
// D4-5: the most important behavior, end to end, the way a shopper does it.
// Every step is tested on its own elsewhere; this checks they work together:
// search → open a product → add to cart → change the quantity → check out →
// sign in when asked → back to checkout → place the order → confirmation.
// Only roles, labels and visible text: no test ids, no store access.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { createControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";
import { connectApiToStore } from "../store/connectApi.ts";
import { makeStore } from "../store/store.ts";
import TestApp from "../test/TestApp.tsx";
import { cartCount } from "../test/queries.ts";
import { formatPrice } from "../utils/formatPrice.ts";

const server = setupServer();
let db: MockDb;
let disconnect: () => void = () => undefined;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  window.sessionStorage.clear();
  window.scrollTo = () => undefined;
});
afterEach(() => {
  disconnect();
});

it("a shopper finds a product, buys two, signs in when asked, and gets an order", async () => {
  const product = db.listProducts().find((candidate) => candidate.name.startsWith("Decaf Pods"));
  if (!product) throw new Error("seed changed: no Decaf Pods");
  db.setStock(product.id, 10);
  const store = makeStore();
  disconnect = connectApiToStore(store);
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/"]}>
      <TestApp store={store} />
    </MemoryRouter>,
  );

  // 1. Search for it and open it from the results.
  await user.type(
    await screen.findByRole("searchbox", { name: "Search" }),
    `${product.name}{Enter}`,
  );
  await user.click(await screen.findByRole("link", { name: product.name }));
  expect(await screen.findByRole("heading", { level: 1, name: product.name })).toBeInTheDocument();
  expect(screen.getByText(formatPrice(product.price))).toBeInTheDocument();

  // 2. Add it to the cart, then raise the quantity to 2 in the cart.
  await user.click(screen.getByRole("button", { name: "Add to cart" }));
  expect(cartCount()).toBe(1);
  await user.click(screen.getByRole("link", { name: /^Cart, 1 item$/ }));
  await user.click(
    await screen.findByRole("button", { name: `Increase quantity of ${product.name}` }),
  );
  expect(cartCount()).toBe(2);
  const total = formatPrice(product.price * 2);
  expect(screen.getByText(total, { selector: "dd" })).toBeInTheDocument();

  // 3. Check out: not signed in yet, so the store asks for it…
  await user.click(screen.getByRole("link", { name: "Go to checkout" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Email"), DEMO_USER.email);
  await user.type(screen.getByLabelText("Password"), DEMO_USER.password);
  await user.click(screen.getByRole("button", { name: "Sign in" }));

  // …and brings the shopper straight back to checkout, cart intact.
  expect(await screen.findByRole("heading", { level: 1, name: "Checkout" })).toBeInTheDocument();
  expect(screen.getByText(/^Total \(2 items\)/)).toHaveTextContent(total);
  expect(cartCount()).toBe(2);

  // 4. Place the order: a confirmation with the order number, and an empty cart.
  await user.click(screen.getByRole("button", { name: "Place order" }));
  expect(
    await screen.findByRole("heading", { name: /thank you! your order is placed/i }),
  ).toBeInTheDocument();
  const facts = screen.getByText("Order number").closest("dl");
  if (!facts) throw new Error("no order facts");
  expect(within(facts).getByText(/^o-\d{5}$/)).toBeInTheDocument();
  expect(within(facts).getByText(total)).toBeInTheDocument();
  expect(cartCount()).toBe(0);

  // The order really happened: the stock went down by two.
  await waitFor(() => expect(db.getProduct(product.id)?.stock).toBe(8));
});
