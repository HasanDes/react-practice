// @vitest-environment jsdom
// D4-1: usable with a keyboard and a screen reader.
//
// - axe-core finds no violations on any page or state (color contrast is
//   checked by Lighthouse in a real browser: jsdom can't compute colors).
// - Navigating moves focus to the new page's heading.
// - Cart changes are announced, and focus is never dropped to <body>.
// - Form errors are announced: invalid fields are marked and described by
//   their error, focus moves to the first problem, messages use role=alert.

import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { itemAdded } from "../features/cart/cartSlice.ts";
import { createControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";
import { connectApiToStore } from "../store/connectApi.ts";
import { makeStore, type AppStore } from "../store/store.ts";
import TestApp from "../test/TestApp.tsx";

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
});
afterEach(() => {
  disconnect();
});

function storeFor({ signedIn = false, cart = false } = {}): AppStore {
  const session = signedIn ? db.login(DEMO_USER.email, DEMO_USER.password) : null;
  const store = makeStore(session ? { session: { status: "authenticated", ...session } } : {});
  disconnect = connectApiToStore(store);
  if (cart) {
    for (const [id, quantity] of [
      ["p-0001", 2],
      ["p-0002", 1],
    ] as const) {
      const product = db.getProduct(id);
      if (product) store.dispatch(itemAdded({ product, quantity }));
    }
  }
  return store;
}

function renderAt(path: string, store: AppStore = storeFor()) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={store} />
    </MemoryRouter>,
  );
  return { user, store, ...view };
}

async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document.body, {
    rules: { "color-contrast": { enabled: false } }, // Lighthouse checks this in a real browser
  });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} → ${violation.nodes.map((node) => node.html).join(" | ")}`,
  );
}

describe("axe: no violations on any page or state", () => {
  const pages: {
    name: string;
    path: string;
    signedIn?: boolean;
    cart?: boolean;
    ready: () => Promise<unknown>;
    before?: () => void;
  }[] = [
    { name: "home", path: "/", ready: () => screen.findAllByRole("listitem") },
    { name: "product details", path: "/products/p-0001", ready: () => screen.findByText(/^More /) },
    {
      name: "all products view (virtualized)",
      path: "/?view=all",
      ready: () => screen.findByRole("list", { name: /^All [\d,]+ products$/ }),
    },
    { name: "cart (empty)", path: "/cart", ready: () => screen.findByText("Your cart is empty") },
    {
      name: "cart (with items)",
      path: "/cart",
      cart: true,
      ready: () => screen.findByRole("list", { name: "Items in your cart" }),
    },
    {
      name: "checkout",
      path: "/checkout",
      signedIn: true,
      cart: true,
      ready: () => screen.findByRole("button", { name: "Place order" }),
    },
    {
      name: "login",
      path: "/login",
      ready: () => screen.findByRole("heading", { name: "Sign in" }),
    },
    {
      name: "account",
      path: "/account",
      signedIn: true,
      ready: () => screen.findByTestId("account-name"),
    },
    {
      name: "not found",
      path: "/nope",
      ready: () => screen.findByRole("heading", { name: "Page not found" }),
    },
    {
      name: "error state (list 500)",
      path: "/",
      before: () =>
        server.use(http.get("*/api/products", () => new HttpResponse(null, { status: 500 }))),
      ready: () => screen.findByRole("button", { name: "Try again" }),
    },
  ];

  it.each(pages)("$name", async ({ path, signedIn, cart, ready, before }) => {
    before?.();
    renderAt(path, storeFor({ signedIn: signedIn ?? false, cart: cart ?? false }));
    await ready();
    expect(await axeViolations()).toEqual([]);
  });

  it("login with field errors and a form error", async () => {
    const { user } = renderAt("/login");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await screen.findByText("Enter your email address.");
    expect(await axeViolations()).toEqual([]);
  });
});

describe("keyboard: navigating moves focus to the new page", () => {
  it("opening a product, going back, and opening the cart each focus the page heading", async () => {
    const { user } = renderAt("/");
    const [list] = await screen.findAllByRole("list"); // the product grid comes first in <main>
    if (!list) throw new Error("no list");
    const [card] = within(list).getAllByRole("link");
    if (!card) throw new Error("no card");

    card.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveFocus());

    screen.getByRole("link", { name: "← Back to products" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Products" })).toHaveFocus(),
    );

    screen.getByRole("link", { name: "Cart, 0 items" }).focus();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Your cart" })).toHaveFocus(),
    );
  });

  it("typing in search keeps focus in the search box (the path doesn't change)", async () => {
    const { user } = renderAt("/");
    await screen.findAllByRole("listitem");
    const search = screen.getByRole("searchbox", { name: "Search" });
    await user.type(search, "duck");
    // The search has applied: the URL's query changed and the results updated…
    expect(await screen.findByText(/for “duck”/)).toBeInTheDocument();
    // …but the path didn't, so focus is still where the user is typing.
    expect(search).toHaveFocus();
  });
});

describe("screen reader: cart changes are announced, focus is never dropped", () => {
  it("+ announces the new quantity, the limit and the total; focus stays on +", async () => {
    db.setStock("p-0001", 3);
    const { user, store } = renderAt("/cart");
    const product = db.getProduct("p-0001");
    if (!product) throw new Error("missing");
    act(() => {
      store.dispatch(itemAdded({ product, quantity: 2 }));
    });
    const plus = screen.getByRole("button", { name: `Increase quantity of ${product.name}` });
    plus.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("cart-announcement")).toHaveTextContent(
      `${product.name}: quantity 3. That's all 3 available. Cart total`,
    );
    expect(screen.getByTestId("cart-announcement")).toHaveAttribute("role", "status");
    expect(plus).toHaveFocus();
  });

  it("Remove announces what was removed and moves focus to the cart heading", async () => {
    const { user } = renderAt("/cart", storeFor({ cart: true }));
    const name = db.getProduct("p-0001")?.name ?? "";
    screen.getByRole("button", { name: `Remove ${name} from cart` }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByTestId("cart-announcement")).toHaveTextContent(
      `${name} removed from your cart.`,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Your cart" })).toHaveFocus();
  });
});

describe("form errors are announced", () => {
  it("login: each invalid field is marked, described by its error, and the first is focused", async () => {
    const { user } = renderAt("/login");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const email = screen.getByRole("textbox", { name: "Email" });
    expect(email).toBeInvalid();
    expect(email).toHaveAccessibleDescription("Enter your email address.");
    expect(email).toHaveFocus();
    const password = screen.getByLabelText("Password");
    expect(password).toBeInvalid();
    expect(password).toHaveAccessibleDescription("Enter your password.");
  });

  it("login: a form-level error is an alert, and focus moves to it", async () => {
    const { user } = renderAt("/login");
    await user.type(screen.getByRole("textbox", { name: "Email" }), DEMO_USER.email);
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent(/don't match/));
    expect(alert).toHaveFocus();
  });

  it("checkout: a failed order is an alert", async () => {
    server.use(http.post("*/api/orders", () => new HttpResponse(null, { status: 500 })));
    const { user } = renderAt("/checkout", storeFor({ signedIn: true, cart: true }));
    await user.click(await screen.findByRole("button", { name: "Place order" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't place your order/i);
  });
});
