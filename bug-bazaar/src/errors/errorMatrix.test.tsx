// @vitest-environment jsdom
// D3-4 "Done when": every API error is handled in one consistent way, and raw
// error messages never reach the screen.
//
// For every route and every status the contract documents (ROUTE_ERRORS),
// plus dropped connections, the server answers with a body whose message AND
// details are a sentinel string. Each case checks the expected response
// (field errors for 400, sign-in for 401, Not Found for 404, the item named
// for 409, Try again for 500) and that the sentinel appears nowhere.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse, type HttpHandler } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { itemAdded } from "../features/cart/cartSlice.ts";
import { ROUTE_ERRORS, type MockRoute } from "../mocks/contract.ts";
import { createControls } from "../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../mocks/db.ts";
import { createHandlers } from "../mocks/handlers.ts";
import { connectApiToStore } from "../store/connectApi.ts";
import { makeStore, type AppStore } from "../store/store.ts";
import TestApp from "../test/TestApp.tsx";

const RAW = "RAW-SERVER-TEXT-7f3a";

const server = setupServer();
let db: MockDb;
let store: AppStore;
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

const ROUTES: Record<MockRoute, { method: "get" | "post"; path: string }> = {
  "products:list": { method: "get", path: "*/api/products" },
  "products:get": { method: "get", path: "*/api/products/:id" },
  login: { method: "post", path: "*/api/login" },
  me: { method: "get", path: "*/api/me" },
  "orders:create": { method: "post", path: "*/api/orders" },
  "orders:get": { method: "get", path: "*/api/orders/:id" },
};

/** The route answers `status` with the sentinel everywhere a message could hide. */
function failRoute(route: MockRoute, status: number | "network"): HttpHandler {
  const { method, path } = ROUTES[route];
  return http[method](path, () =>
    status === "network"
      ? HttpResponse.error()
      : HttpResponse.json(
          {
            error: {
              code: RAW,
              message: RAW,
              details: { email: RAW, password: RAW, "p-0001": RAW, items: RAW },
            },
          },
          { status },
        ),
  );
}

type User = ReturnType<typeof userEvent.setup>;

/** Where to start, whether signed in, and what the user does to trigger the request. */
type Scenario = { path: string; signedIn: boolean; act?: (user: User) => Promise<void> };

const SCENARIOS: Record<MockRoute, Scenario> = {
  "products:list": { path: "/", signedIn: false },
  "products:get": { path: "/products/p-0001", signedIn: false },
  login: {
    path: "/login",
    signedIn: false,
    act: async (user) => {
      await user.type(screen.getByLabelText("Email"), DEMO_USER.email);
      await user.type(screen.getByLabelText("Password"), DEMO_USER.password);
      await user.click(screen.getByRole("button", { name: "Sign in" }));
    },
  },
  me: { path: "/account", signedIn: true },
  "orders:create": {
    path: "/checkout",
    signedIn: true,
    act: async (user) => {
      await user.click(screen.getByRole("button", { name: "Place order" }));
    },
  },
  "orders:get": { path: "/orders/o-00001", signedIn: true },
};

/** What the user must see for each failure: the response the spec asks for. */
const EXPECTED: Record<string, () => Promise<void>> = {
  "products:list 500": tryAgain(/our server hit a problem/i),
  "products:list network": tryAgain(/you seem to be offline/i),
  "products:get 404": notFound("Product not found"),
  "products:get 500": tryAgain(/our server hit a problem/i),
  "products:get network": tryAgain(/you seem to be offline/i),
  "login 400": async () => {
    expect(await screen.findByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Password")).toHaveAttribute("aria-invalid", "true");
  },
  "login 401": formAlert(/email and password don't match/i),
  "login 500": formAlert(/couldn't sign you in/i),
  "login network": formAlert(/you seem to be offline/i),
  "me 401": signedOut(),
  "me 500": tryAgain(/our server hit a problem/i),
  "me network": tryAgain(/you seem to be offline/i),
  "orders:create 400": async () => {
    expect(await screen.findByRole("alert")).toHaveTextContent(/isn't available/i);
    expect(screen.getByRole("link", { name: "review your cart" })).toBeInTheDocument();
  },
  "orders:create 401": signedOut(),
  "orders:create 409": async () => {
    const name = db.getProduct("p-0001")?.name ?? "";
    expect(await screen.findByRole("alert")).toHaveTextContent(name);
  },
  "orders:create 500": async () => {
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't place your order/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
  "orders:create network": async () => {
    expect(await screen.findByRole("alert")).toHaveTextContent(/you seem to be offline/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  },
  "orders:get 401": signedOut(),
  "orders:get 404": notFound("Order not found"),
  "orders:get 500": tryAgain(/our server hit a problem/i),
  "orders:get network": tryAgain(/you seem to be offline/i),
};

function tryAgain(title: RegExp) {
  return async () => {
    expect(await screen.findByRole("alert")).toHaveTextContent(title);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  };
}

function notFound(heading: string) {
  return async () => {
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    // 404 isn't retryable: the thing doesn't exist.
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  };
}

function formAlert(text: RegExp) {
  return async () => {
    expect(await screen.findByText(text)).toHaveAttribute("role", "alert");
  };
}

function signedOut() {
  return async () => {
    expect(await screen.findByText(/your session expired/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(store.getState().session.status).toBe("anonymous");
  };
}

const CASES = (Object.keys(ROUTE_ERRORS) as MockRoute[]).flatMap((route) =>
  [...ROUTE_ERRORS[route], "network" as const].map((status) => ({ route, status })),
);

describe("every documented API error gets the right response, and no raw text", () => {
  it("covers every route × status in the contract", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(
      CASES.map(({ route, status }) => `${route} ${String(status)}`).sort(),
    );
  });

  it.each(CASES)("$route $status", async ({ route, status }) => {
    const scenario = SCENARIOS[route];
    const session = scenario.signedIn ? db.login(DEMO_USER.email, DEMO_USER.password) : null;
    store = makeStore(session ? { session: { status: "authenticated", ...session } } : {});
    disconnect = connectApiToStore(store);
    server.use(failRoute(route, status));

    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[scenario.path]}>
        <TestApp store={store} />
      </MemoryRouter>,
    );
    const product = db.getProduct("p-0001");
    if (product) {
      act(() => {
        store.dispatch(itemAdded({ product, quantity: 1 }));
      });
    }
    await scenario.act?.(user);

    const expected = EXPECTED[`${route} ${String(status)}`];
    if (!expected) throw new Error("missing expectation");
    await expected();
    expect(document.body.textContent).not.toContain(RAW);
  });
});
