// @vitest-environment jsdom
// D2-1 integration tests: the real app, real data layer and real mock
// handlers, driven like a user would (keyboard and screen-reader queries).

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import App from "../../app/App.tsx";
import { createControls, type MockControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { formatPrice } from "../../utils/formatPrice.ts";

const server = setupServer();
let db: MockDb;
let controls: MockControls;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  controls = createControls({ storage });
  server.resetHandlers(...createHandlers({ db, controls }));
});

function renderAt(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
  return { user };
}

/** Product cards are the list items inside the product list. */
async function findCards() {
  const list = await screen.findByRole("list");
  return within(list).getAllByRole("listitem");
}

/** The product (from the mock db) at position `n` (1-based) in catalog order. */
function catalogProduct(n: number) {
  const product = db.getProduct(`p-${String(n).padStart(4, "0")}`);
  if (!product) throw new Error(`no product #${String(n)}`);
  return product;
}

describe("product grid", () => {
  it("shows a page of cards with image, name, price from cents, and stock", async () => {
    renderAt("/");
    const cards = await findCards();
    expect(cards).toHaveLength(24);

    const first = catalogProduct(1);
    const card = within(cards[0] ?? document.body);
    expect(card.getByRole("link", { name: first.name })).toBeInTheDocument();
    expect(card.getByText(formatPrice(first.price))).toBeInTheDocument();
    expect(card.getByText(/in stock|only \d+ left|sold out/i)).toBeInTheDocument();
    expect(cards[0]?.querySelector("img")).toHaveAttribute("src", first.imageUrl);
    expect(screen.getByText("5,000 products")).toBeInTheDocument();
  });

  it("formats a known price exactly (1999 cents → $19.99)", async () => {
    db.setStock("p-0001", 3);
    renderAt("/");
    const cards = await findCards();
    // Price formatting is checked against the source cents, not a re-computed float.
    const { price } = catalogProduct(1);
    expect(within(cards[0] ?? document.body).getByText(formatPrice(price))).toHaveTextContent(
      /^\$\d{1,3}(,\d{3})*\.\d{2}$/,
    );
    expect(within(cards[0] ?? document.body).getByText("Only 3 left")).toBeInTheDocument();
  });

  it("is fully usable by keyboard: Tab reaches each card once, Enter opens details", async () => {
    const { user } = renderAt("/");
    await findCards();
    const first = catalogProduct(1);
    const second = catalogProduct(2);

    // Skip link → site title → each filter control → first card. One Tab stop per card.
    const expectedOrder = [
      screen.getByRole("link", { name: "Skip to content" }),
      screen.getByRole("link", { name: /the bug bazaar/i }),
      screen.getByRole("searchbox", { name: "Search" }),
      screen.getByRole("combobox", { name: "Category" }),
      screen.getByRole("combobox", { name: "Sort by" }),
      screen.getByRole("checkbox", { name: "In stock only" }),
      screen.getByRole("link", { name: first.name }),
    ];
    for (const element of expectedOrder) {
      await user.tab();
      expect(element).toHaveFocus();
    }
    await user.tab();
    expect(screen.getByRole("link", { name: second.name })).toHaveFocus();

    await user.keyboard("{Enter}");
    const heading = await screen.findByRole("heading", { level: 2, name: second.name });
    expect(heading).toHaveFocus(); // focus follows the route change
    expect(screen.getByText(formatPrice(second.price))).toBeInTheDocument();
  });

  it("pages with the keyboard and moves focus back to the top", async () => {
    const { user } = renderAt("/");
    await findCards();

    screen.getByRole("button", { name: "Next" }).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("heading", { name: "Products" })).toHaveFocus();
    expect(await screen.findByRole("link", { name: catalogProduct(25).name })).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 209")).toBeInTheDocument();
  });
});

describe("product details", () => {
  it("shows name, price, stock and image", async () => {
    const product = catalogProduct(42);
    renderAt(`/products/${product.id}`);
    expect(await screen.findByRole("heading", { name: product.name })).toBeInTheDocument();
    expect(screen.getByText(formatPrice(product.price))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to products/i })).toBeInTheDocument();
  });

  it("shows a not-found message for an unknown product", async () => {
    renderAt("/products/p-9999");
    expect(await screen.findByText("Product not found")).toBeInTheDocument();
    // The page header link plus the not-found card's own way out.
    expect(screen.getAllByRole("link", { name: /back to products/i })).toHaveLength(2);
  });
});

describe("errors", () => {
  it("shows a friendly error (never the raw message) and recovers on retry", async () => {
    controls.fail("products:list", 500, { once: true });
    const { user } = renderAt("/");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load products");
    expect(alert).not.toHaveTextContent(/something went wrong on our side/i); // server message

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await findCards()).toHaveLength(24);
  });
});
