// Contract tests for the mock API (D1-2 "Done when": every endpoint returns
// the documented shapes and status codes, including each listed error).
// They hit the handlers over real fetch through MSW's Node interceptor.

import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CATEGORIES } from "./contract.js";
import { createControls } from "./controls.js";
import { createDb, createMemoryStorage, DEMO_USER } from "./db.js";
import { createHandlers } from "./handlers.js";

const BASE = "http://localhost/api";

let db;
let controls;
let clock;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());

beforeEach(() => {
  clock = { now: 1_000_000 };
  const storage = createMemoryStorage();
  db = createDb({ storage, now: () => clock.now });
  controls = createControls({ storage }); // zero latency
  server.resetHandlers(...createHandlers({ db, controls }));
});
afterEach(() => server.resetHandlers());

// --- helpers --------------------------------------------------------------

async function call(path, { method = "GET", body, token, headers = {} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function login() {
  const { body } = await call("/login", {
    method: "POST",
    body: { email: DEMO_USER.email, password: DEMO_USER.password },
  });
  return body.token;
}

function expectApiError(result, status, code) {
  expect(result.status).toBe(status);
  expect(result.body).toEqual({
    error: expect.objectContaining({ code, message: expect.any(String) }),
  });
  if (result.body.error.details !== undefined) {
    for (const value of Object.values(result.body.error.details)) {
      expect(typeof value).toBe("string");
    }
  }
}

const productShape = {
  id: expect.stringMatching(/^p-\d{4}$/),
  name: expect.any(String),
  price: expect.any(Number),
  category: expect.stringMatching(new RegExp(`^(${CATEGORIES.join("|")})$`)),
  stock: expect.any(Number),
  rating: expect.any(Number),
  imageUrl: expect.stringMatching(/^\/images\/products\/.+\.svg$/),
};

// --- GET /api/products ------------------------------------------------------

describe("GET /api/products", () => {
  it("returns { items, total } with 5,000 seeded products", async () => {
    const result = await call("/products");
    expect(result.status).toBe(200);
    expect(result.body.total).toBe(5000);
    expect(result.body.items).toHaveLength(24);
    expect(result.body.items[0]).toEqual(productShape);
    expect(Object.keys(result.body.items[0]).sort()).toEqual(Object.keys(productShape).sort());
  });

  it("stores prices as integer cents", async () => {
    const { body } = await call("/products?pageSize=100");
    for (const product of body.items) {
      expect(Number.isInteger(product.price)).toBe(true);
      expect(product.price % 100).toBe(99);
    }
  });

  it("filters by search (case-insensitive), category and inStock", async () => {
    const { body } = await call("/products?search=DUCK&category=ducks&inStock=true&pageSize=100");
    expect(body.total).toBeGreaterThan(0);
    for (const product of body.items) {
      expect(product.name.toLowerCase()).toContain("duck");
      expect(product.category).toBe("ducks");
      expect(product.stock).toBeGreaterThan(0);
    }
  });

  it("sorts by price and paginates without overlap", async () => {
    const page1 = (await call("/products?sort=price-asc&page=1&pageSize=50")).body.items;
    const page2 = (await call("/products?sort=price-asc&page=2&pageSize=50")).body.items;
    const prices = [...page1, ...page2].map((product) => product.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const ids = new Set([...page1, ...page2].map((product) => product.id));
    expect(ids.size).toBe(100);
  });

  it("returns an empty page, not an error, when nothing matches", async () => {
    const result = await call("/products?search=zzz-no-such-product");
    expect(result).toEqual({ status: 200, body: { items: [], total: 0 } });
  });

  it("returns 500 when forced (header, query param or controls)", async () => {
    expectApiError(
      await call("/products", { headers: { "x-mock-error": "500" } }),
      500,
      "INTERNAL_ERROR",
    );
    expectApiError(await call("/products?mockError=500"), 500, "INTERNAL_ERROR");

    controls.fail("products:list", 500, { once: true });
    expectApiError(await call("/products"), 500, "INTERNAL_ERROR");
    expect((await call("/products")).status).toBe(200); // one-shot failure consumed
  });
});

// --- GET /api/products/:id --------------------------------------------------

describe("GET /api/products/:id", () => {
  it("returns a single Product", async () => {
    const result = await call("/products/p-0042");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ ...productShape, id: "p-0042" });
  });

  it("returns 404 for an unknown id", async () => {
    expectApiError(await call("/products/p-9999"), 404, "PRODUCT_NOT_FOUND");
  });
});

// --- POST /api/login & GET /api/me -----------------------------------------

describe("POST /api/login", () => {
  it("returns { token, user } for valid credentials", async () => {
    const result = await call("/login", {
      method: "POST",
      body: { email: DEMO_USER.email, password: DEMO_USER.password },
    });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      token: expect.any(String),
      user: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    });
  });

  it("returns 400 with field details for missing or malformed fields", async () => {
    const missing = await call("/login", { method: "POST", body: {} });
    expectApiError(missing, 400, "VALIDATION_ERROR");
    expect(Object.keys(missing.body.error.details).sort()).toEqual(["email", "password"]);

    const badEmail = await call("/login", {
      method: "POST",
      body: { email: "nope", password: "x" },
    });
    expect(badEmail.body.error.details).toEqual({ email: expect.any(String) });

    expectApiError(
      await call("/login", { method: "POST", body: "{not json" }),
      400,
      "VALIDATION_ERROR",
    );
  });

  it("returns 401 for wrong credentials", async () => {
    const result = await call("/login", {
      method: "POST",
      body: { email: DEMO_USER.email, password: "wrong" },
    });
    expectApiError(result, 401, "INVALID_CREDENTIALS");
  });
});

describe("GET /api/me", () => {
  it("returns the user for a valid token", async () => {
    const result = await call("/me", { token: await login() });
    expect(result).toEqual({
      status: 200,
      body: { id: DEMO_USER.id, name: DEMO_USER.name, email: DEMO_USER.email },
    });
  });

  it("returns 401 without a token, with a bad token, or when forced", async () => {
    expectApiError(await call("/me"), 401, "UNAUTHORIZED");
    expectApiError(await call("/me", { token: "forged" }), 401, "UNAUTHORIZED");
    const token = await login();
    expectApiError(
      await call("/me", { token, headers: { "x-mock-error": "401" } }),
      401,
      "UNAUTHORIZED",
    );
  });
});

// --- POST /api/orders & GET /api/orders/:id ---------------------------------

describe("POST /api/orders", () => {
  const order = (productId, quantity) => ({ items: [{ productId, quantity }] });

  it("returns 201 { id, status: 'queued' } and decrements stock", async () => {
    const token = await login();
    db.setStock("p-0001", 10);

    const result = await call("/orders", { method: "POST", token, body: order("p-0001", 3) });
    expect(result).toEqual({
      status: 201,
      body: { id: expect.stringMatching(/^o-\d+$/), status: "queued" },
    });
    expect((await call("/products/p-0001")).body.stock).toBe(7);
  });

  it("returns 401 without a session", async () => {
    expectApiError(
      await call("/orders", { method: "POST", body: order("p-0001", 1) }),
      401,
      "UNAUTHORIZED",
    );
  });

  it("returns 400 for an empty cart, unknown product or bad quantity", async () => {
    const token = await login();
    expectApiError(
      await call("/orders", { method: "POST", token, body: { items: [] } }),
      400,
      "VALIDATION_ERROR",
    );

    const bad = await call("/orders", {
      method: "POST",
      token,
      body: { items: [{ productId: "p-9999", quantity: 0 }] },
    });
    expectApiError(bad, 400, "VALIDATION_ERROR");
    expect(Object.keys(bad.body.error.details).sort()).toEqual([
      "items.0.productId",
      "items.0.quantity",
    ]);
  });

  it("returns 409 naming the item when stock runs out, and changes nothing", async () => {
    const token = await login();
    db.setStock("p-0001", 5);
    db.setStock("p-0002", 1);
    const name = (await call("/products/p-0002")).body.name;

    const result = await call("/orders", {
      method: "POST",
      token,
      body: {
        items: [
          { productId: "p-0001", quantity: 2 },
          { productId: "p-0002", quantity: 3 },
        ],
      },
    });
    expectApiError(result, 409, "OUT_OF_STOCK");
    expect(result.body.error.message).toContain(name);
    expect(result.body.error.details).toEqual({ "p-0002": expect.stringContaining(name) });
    expect((await call("/products/p-0001")).body.stock).toBe(5); // all-or-nothing
  });

  it("forced 409 names the first cart item", async () => {
    const token = await login();
    const name = (await call("/products/p-0003")).body.name;
    controls.fail("orders:create", 409, { once: true });
    const result = await call("/orders", { method: "POST", token, body: order("p-0003", 1) });
    expectApiError(result, 409, "OUT_OF_STOCK");
    expect(result.body.error.details).toHaveProperty("p-0003");
    expect(result.body.error.message).toContain(name);
  });

  it("replaying the same Idempotency-Key returns the same order without double-charging stock", async () => {
    const token = await login();
    db.setStock("p-0001", 10);
    const send = () =>
      call("/orders", {
        method: "POST",
        token,
        body: order("p-0001", 4),
        headers: { "idempotency-key": "checkout-abc" },
      });

    const first = await send();
    const retry = await send();
    expect(retry.status).toBe(201);
    expect(retry.body.id).toBe(first.body.id);
    expect((await call("/products/p-0001")).body.stock).toBe(6);
  });
});

describe("GET /api/orders/:id", () => {
  it("returns { id, status } and advances status over time", async () => {
    const token = await login();
    db.setStock("p-0010", 50);
    const { body: created } = await call("/orders", {
      method: "POST",
      token,
      body: { items: [{ productId: "p-0010", quantity: 1 }] },
    });

    expect((await call(`/orders/${created.id}`, { token })).body).toEqual({
      id: created.id,
      status: "queued",
    });
    clock.now += 6_000;
    expect((await call(`/orders/${created.id}`, { token })).body.status).toBe("processing");
    clock.now += 10_000;
    expect((await call(`/orders/${created.id}`, { token })).body.status).toBe("completed");
  });

  it("returns 401 without a session and 404 for an unknown order", async () => {
    expectApiError(await call("/orders/o-00001"), 401, "UNAUTHORIZED");
    expectApiError(await call("/orders/o-99999", { token: await login() }), 404, "ORDER_NOT_FOUND");
  });
});

// --- Controls & persistence -------------------------------------------------

describe("mock controls and persistence", () => {
  it("rejects forcing a status that isn't in the route's contract", () => {
    expect(() => controls.fail("products:get", 409)).toThrow(/can't return 409/);
  });

  it("can force 500 on every route so retry UIs can be tested everywhere", async () => {
    for (const [path, init] of [
      ["/products/p-0001", {}],
      ["/login", { method: "POST", body: {} }],
      ["/me", {}],
      ["/orders", { method: "POST", body: {} }],
      ["/orders/o-1", {}],
    ]) {
      expectApiError(
        await call(path, { ...init, headers: { "x-mock-error": "500" } }),
        500,
        "INTERNAL_ERROR",
      );
    }
  });

  it("keeps sessions and stock across a reload (same storage, new db)", async () => {
    const storage = createMemoryStorage();
    const first = createDb({ storage });
    const { token } = first.login(DEMO_USER.email, DEMO_USER.password);
    first.setStock("p-0001", 3);

    const reloaded = createDb({ storage });
    expect(reloaded.userForToken(token)).toEqual(expect.objectContaining({ id: DEMO_USER.id }));
    expect(reloaded.getProduct("p-0001").stock).toBe(3);
  });

  it("generates the same catalog every time (deterministic seed)", () => {
    const a = createDb().listProducts();
    const b = createDb().listProducts();
    expect(a).toEqual(b);
    expect(new Set(a.map((product) => product.id)).size).toBe(5000);
  });
});
