// @vitest-environment jsdom
// D2-3 "Done when": each state can be triggered on purpose and looks
// consistent across pages. Every state is forced through the mock's controls,
// on both the list and the details page.

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import TestApp from "../test/TestApp.tsx";
import { createControls, type MockControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";

const server = setupServer();
let controls: MockControls;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  controls = createControls({ storage });
  server.resetHandlers(...createHandlers({ db: createDb({ storage }), controls }));
});

function renderAt(path: string) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp />
    </MemoryRouter>,
  );
  return { user };
}

const LIST = { path: "/", route: "products:list", subject: "We couldn't load products." } as const;
const DETAIL = {
  path: "/products/p-0042",
  route: "products:get",
  subject: "We couldn't load this product.",
} as const;

describe.each([
  ["list page", LIST],
  ["details page", DETAIL],
])("%s", (_name, page) => {
  it("loading: skeletons plus an announced status, region marked busy", () => {
    controls.setLatency(150, 0);
    renderAt(page.path);
    expect(screen.getByText(/^Loading product/)).toHaveAttribute("role", "status");
    expect(document.querySelector(".load-region")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".skeleton")?.closest("[aria-hidden='true']")).not.toBeNull();
  });

  it("server error: friendly copy, never the raw message, and Try again recovers", async () => {
    controls.fail(page.route, 500, { once: true });
    const { user } = renderAt(page.path);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Our server hit a problem");
    expect(alert).toHaveTextContent(page.subject);
    expect(alert).not.toHaveTextContent("Something went wrong on our side"); // raw server text

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    // Focus stays in the content region instead of dropping to <body>
    // (on the details page it then moves on to the loaded product's heading).
    const region = document.querySelector(".load-region");
    expect(region?.contains(document.activeElement)).toBe(true);
    expect((await screen.findAllByText(/In stock|Only \d+ left|Sold out/)).length).toBeGreaterThan(
      0,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("offline: a dropped connection gets offline-specific copy", async () => {
    controls.fail(page.route, "network", { once: true });
    renderAt(page.path);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("You seem to be offline");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

describe("empty and not-found states", () => {
  it("list: no matches shows an empty state with a way out", async () => {
    renderAt("/?search=no-such-product");
    const title = await screen.findByText("No products match your filters");
    const card = title.closest(".state");
    // Not an error: nothing is announced as an alert.
    expect(card).not.toHaveAttribute("role", "alert");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(
      within(card as HTMLElement).getByRole("button", { name: "Clear filters" }),
    ).toBeInTheDocument();
  });

  it("details: an unknown id is 'not found' (no pointless retry), with a way back", async () => {
    renderAt("/products/p-9999");
    const title = await screen.findByText("Product not found");
    const card = title.closest(".state") as HTMLElement;
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // not an error
    expect(
      within(card).getByRole("heading", { level: 1, name: "Product not found" }),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(within(card).getByRole("link", { name: /back to products/i })).toBeInTheDocument();
  });
});

describe("consistency across pages", () => {
  it("list and details render errors with the same structure", async () => {
    const structure = async (page: typeof LIST | typeof DETAIL) => {
      controls.fail(page.route, 500, { once: true });
      const view = render(
        <MemoryRouter initialEntries={[page.path]}>
          <TestApp />
        </MemoryRouter>,
      );
      const alert = await screen.findByRole("alert");
      const shape = {
        classes: alert.className,
        icon: alert.querySelector(".state__icon")?.textContent,
        title: alert.querySelector(".state__title")?.textContent,
        actions: within(alert)
          .getAllByRole("button")
          .map((button) => button.textContent),
      };
      view.unmount();
      return shape;
    };

    expect(await structure(LIST)).toEqual(await structure(DETAIL));
  });
});
