// @vitest-environment jsdom
// D2-2 "Done when": filters survive a refresh, a copied link reproduces the
// same view, and the Back button works. Driven through the real app, router,
// data layer and mock API.

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import App from "../../app/App.tsx";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { parseProductQuery, queryProducts } from "../../mocks/queryProducts.ts";
import { PAGE_SIZE } from "./pages/ProductsPage.tsx";

const server = setupServer();
let db: MockDb;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
});

/** Test-only helpers: shows the current URL query and offers the browser's Back. */
function BrowserChrome() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{location.search}</output>
      <button type="button" onClick={() => navigate(-1)}>
        Browser back
      </button>
    </>
  );
}

function renderAt(url: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[url]}>
      <App />
      <BrowserChrome />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const currentUrl = () => screen.getByTestId("url").textContent;
const searchBox = () => screen.getByRole<HTMLInputElement>("searchbox", { name: "Search" });
const categorySelect = () => screen.getByRole<HTMLSelectElement>("combobox", { name: "Category" });
const sortSelect = () => screen.getByRole<HTMLSelectElement>("combobox", { name: "Sort by" });
const inStockBox = () => screen.getByRole<HTMLInputElement>("checkbox", { name: "In stock only" });
const back = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: "Browser back" }));

/** What the mock API returns for a query string: the expected results. */
function expected(query: string) {
  return queryProducts(
    db.listProducts(),
    parseProductQuery(new URLSearchParams(`${query}&pageSize=${String(PAGE_SIZE)}`)),
  );
}

async function firstCardName() {
  const list = await screen.findByRole("list");
  return within(list).getAllByRole("link")[0]?.textContent;
}

describe("a copied link reproduces the same view", () => {
  it("restores every control and the exact results from the URL", async () => {
    const query = "search=duck&category=ducks&inStock=true&sort=price-asc";
    renderAt(`/?${query}`);
    const { items, total } = expected(query);

    expect(
      await screen.findByText(`${total.toLocaleString("en-US")} products match your filters`),
    ).toBeInTheDocument();
    expect(searchBox().value).toBe("duck");
    expect(categorySelect().value).toBe("ducks");
    expect(sortSelect().value).toBe("price-asc");
    expect(inStockBox().checked).toBe(true);
    expect(await firstCardName()).toBe(items[0]?.name);
  });

  it("ignores invalid params instead of breaking", async () => {
    renderAt("/?category=bogus&sort=cheapest&page=-3");
    expect(await screen.findByText("5,000 products")).toBeInTheDocument();
    expect(categorySelect().value).toBe("");
    expect(sortSelect().value).toBe("relevance");
  });
});

describe("filters write to the URL", () => {
  it("each control updates the URL, and changing a filter resets to page 1", async () => {
    const { user } = renderAt("/?page=3");
    await screen.findByText("5,000 products");

    await user.selectOptions(categorySelect(), "coffee");
    expect(currentUrl()).toBe("?category=coffee"); // page=3 dropped

    await user.click(inStockBox());
    expect(currentUrl()).toBe("?category=coffee&inStock=true");

    await user.selectOptions(sortSelect(), "rating-desc");
    expect(currentUrl()).toBe("?category=coffee&inStock=true&sort=rating-desc");

    const { total } = expected("category=coffee&inStock=true&sort=rating-desc");
    expect(
      await screen.findByText(`${total.toLocaleString("en-US")} products match your filters`),
    ).toBeInTheDocument();
  });

  it("search updates the URL after a pause, as one history entry", async () => {
    const { user } = renderAt("/?category=coffee");
    await screen.findByText(/match your filters/);

    await user.type(searchBox(), "beans");
    expect(currentUrl()).toBe("?category=coffee"); // not yet: still within the pause
    await waitFor(() => expect(currentUrl()).toBe("?search=beans&category=coffee"));

    // One Back undoes the whole search, not one letter at a time.
    await back(user);
    expect(currentUrl()).toBe("?category=coffee");
    expect(searchBox().value).toBe("");
  });
});

describe("the Back button works", () => {
  it("steps back through previous filter states, updating controls and results", async () => {
    const { user } = renderAt("/");
    await screen.findByText("5,000 products");

    await user.selectOptions(categorySelect(), "ducks");
    await user.selectOptions(sortSelect(), "price-desc");
    expect(await firstCardName()).toBe(expected("category=ducks&sort=price-desc").items[0]?.name);

    await back(user);
    expect(currentUrl()).toBe("?category=ducks");
    expect(sortSelect().value).toBe("relevance");
    expect(await firstCardName()).toBe(expected("category=ducks").items[0]?.name);

    await back(user);
    expect(currentUrl()).toBe("");
    expect(categorySelect().value).toBe("");
    expect(await screen.findByText("5,000 products")).toBeInTheDocument();
  });

  it("'Back to products' returns to the filtered list the product was opened from", async () => {
    const { user } = renderAt("/?category=stickers&sort=name-asc");
    const name = await firstCardName();
    await user.click(screen.getByRole("link", { name: name ?? "" }));
    await screen.findByRole("heading", { name: name ?? "" });

    await user.click(screen.getByRole("link", { name: /back to products/i }));
    expect(currentUrl()).toBe("?category=stickers&sort=name-asc");
    expect(categorySelect().value).toBe("stickers");
  });
});

describe("filters survive a refresh", () => {
  it("re-opening the same URL from scratch shows the same view", async () => {
    const first = renderAt("/");
    await screen.findByText("5,000 products");
    await first.user.selectOptions(categorySelect(), "keyboards");
    await first.user.click(inStockBox());
    const url = currentUrl();
    const before = await firstCardName();
    first.unmount(); // the "refresh": all React state is gone, only the URL remains

    renderAt(`/${url}`);
    expect(categorySelect().value).toBe("keyboards");
    expect(inStockBox().checked).toBe(true);
    expect(await firstCardName()).toBe(before);
  });
});

describe("clearing filters", () => {
  it("resets the URL, every control and the result count", async () => {
    const { user } = renderAt("/?search=duck&inStock=true&sort=name-asc");
    await screen.findByText(/match your filters/);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(currentUrl()).toBe("");
    expect(searchBox().value).toBe("");
    expect(inStockBox().checked).toBe(false);
    expect(sortSelect().value).toBe("relevance");
    expect(await screen.findByText("5,000 products")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("an empty result offers a way out", async () => {
    const { user } = renderAt("/?search=zzz-nothing");
    const emptyTitle = await screen.findByText("No products match your filters");
    const emptyState = emptyTitle.closest<HTMLElement>(".state");
    await user.click(
      within(emptyState ?? document.body).getByRole("button", { name: "Clear filters" }),
    );
    expect(await screen.findByText("5,000 products")).toBeInTheDocument();
  });
});
