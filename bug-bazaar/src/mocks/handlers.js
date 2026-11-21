// MSW request handlers implementing docs/api-contract.md.
//
// createHandlers() takes its dependencies (db, controls) as arguments, so the
// same handlers run in the browser (service worker) and in Node tests with
// different storage and zero latency.

import { delay, http, HttpResponse } from "msw";
import { ERROR_CODES as CODES, MAX_ORDER_QUANTITY } from "./contract.js";
import { isAllowed } from "./controls.js";
import { parseProductQuery, queryProducts } from "./queryProducts.js";

// "*/api/..." matches any origin, so it works for relative URLs in the
// browser and absolute URLs in Node tests alike.
const API = "*/api";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Build a response with the contract's ApiError body. */
export function apiError(status, code, message, details) {
  return HttpResponse.json(
    { error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/** Canned bodies for errors forced via controls, header or query param. */
function forcedError(route, status, context = {}) {
  switch (status) {
    case 400:
      return route === "login"
        ? apiError(400, CODES.VALIDATION_ERROR, "Please fix the highlighted fields.", {
            email: "Enter a valid email address.",
          })
        : apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", {
            items: "Your cart is empty.",
          });
    case 401:
      return route === "login"
        ? apiError(401, CODES.INVALID_CREDENTIALS, "Email or password is incorrect.")
        : apiError(401, CODES.UNAUTHORIZED, "Your session has expired. Please log in again.");
    case 404:
      return route === "orders:get"
        ? apiError(404, CODES.ORDER_NOT_FOUND, "Order not found.")
        : apiError(404, CODES.PRODUCT_NOT_FOUND, "Product not found.");
    case 409: {
      const { productId = "p-0001", productName = "An item" } = context;
      return outOfStock([{ id: productId, name: productName, stock: 0 }]);
    }
    default:
      return apiError(
        500,
        CODES.INTERNAL_ERROR,
        "Something went wrong on our side. Please try again.",
      );
  }
}

/** 409 body that names every item that ran out (D3-2: "a 409 names the item"). */
function outOfStock(products) {
  const [first] = products;
  const message =
    products.length === 1
      ? `"${first.name}" only has ${first.stock} left.`
      : `${products.length} items in your cart don't have enough stock.`;
  const details = Object.fromEntries(
    products.map((product) => [product.id, `${product.name}: only ${product.stock} left`]),
  );
  return apiError(409, CODES.OUT_OF_STOCK, message, details);
}

/**
 * Per-request override for scripts, curl and tests:
 * `x-mock-error: 500` header or `?mockError=500` query param.
 */
function requestedError(request) {
  const raw =
    request.headers.get("x-mock-error") ?? new URL(request.url).searchParams.get("mockError");
  return raw ? Number(raw) : null;
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function bearerToken(request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

/**
 * @param {{ db: ReturnType<typeof import("./db.js").createDb>, controls: ReturnType<typeof import("./controls.js").createControls> }} deps
 */
export function createHandlers({ db, controls }) {
  /**
   * Runs before every handler: simulate latency, then apply any forced error.
   * Returns a Response to short-circuit, or null to continue.
   */
  async function simulate(route, request, context) {
    const ms = controls.nextDelay();
    if (ms > 0) await delay(ms);

    const status = requestedError(request) ?? controls.takeFailure(route);
    if (status === null) return null;
    if (!isAllowed(route, status)) {
      console.warn(`[mock] Ignoring forced ${status} on "${route}": not in its contract.`);
      return null;
    }
    return forcedError(route, status, context);
  }

  function requireUser(request) {
    return db.userForToken(bearerToken(request));
  }

  const unauthorized = () => forcedError("me", 401);

  return [
    http.get(`${API}/products`, async ({ request }) => {
      const forced = await simulate("products:list", request);
      if (forced) return forced;

      const query = parseProductQuery(new URL(request.url).searchParams);
      return HttpResponse.json(queryProducts(db.listProducts(), query));
    }),

    http.get(`${API}/products/:id`, async ({ request, params }) => {
      const forced = await simulate("products:get", request);
      if (forced) return forced;

      const product = db.getProduct(String(params.id));
      if (!product) {
        return apiError(404, CODES.PRODUCT_NOT_FOUND, "Product not found.");
      }
      return HttpResponse.json(product);
    }),

    http.post(`${API}/login`, async ({ request }) => {
      const forced = await simulate("login", request);
      if (forced) return forced;

      const body = await readJson(request);
      const email = typeof body?.email === "string" ? body.email.trim() : "";
      const password = typeof body?.password === "string" ? body.password : "";

      const details = {};
      if (!email) details.email = "Email is required.";
      else if (!EMAIL_PATTERN.test(email)) details.email = "Enter a valid email address.";
      if (!password) details.password = "Password is required.";
      if (Object.keys(details).length > 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "Please fix the highlighted fields.", details);
      }

      const session = db.login(email, password);
      if (!session) {
        return apiError(401, CODES.INVALID_CREDENTIALS, "Email or password is incorrect.");
      }
      return HttpResponse.json(session);
    }),

    http.get(`${API}/me`, async ({ request }) => {
      const forced = await simulate("me", request);
      if (forced) return forced;

      const user = requireUser(request);
      return user ? HttpResponse.json(user) : unauthorized();
    }),

    http.post(`${API}/orders`, async ({ request }) => {
      // Read the body first (from a clone) so a forced 409 can name a real cart item.
      const body = await readJson(request.clone());
      const firstProduct = db.getProduct(String(body?.items?.[0]?.productId ?? ""));
      const forced = await simulate("orders:create", request, {
        productId: firstProduct?.id,
        productName: firstProduct?.name,
      });
      if (forced) return forced;

      const user = requireUser(request);
      if (!user) return unauthorized();

      const items = Array.isArray(body?.items) ? body.items : null;
      if (!items || items.length === 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", {
          items: "Your cart is empty.",
        });
      }

      const details = {};
      items.forEach((item, index) => {
        if (!db.getProduct(String(item?.productId))) {
          details[`items.${index}.productId`] = "This product doesn't exist.";
        }
        if (
          !Number.isInteger(item?.quantity) ||
          item.quantity < 1 ||
          item.quantity > MAX_ORDER_QUANTITY
        ) {
          details[`items.${index}.quantity`] =
            `Quantity must be a whole number from 1 to ${MAX_ORDER_QUANTITY}.`;
        }
      });
      if (Object.keys(details).length > 0) {
        return apiError(400, CODES.VALIDATION_ERROR, "The order is invalid.", details);
      }

      const result = db.placeOrder({
        userId: user.id,
        items: items.map(({ productId, quantity }) => ({ productId: String(productId), quantity })),
        idempotencyKey: request.headers.get("idempotency-key"),
      });
      if (!result.ok) return outOfStock(result.shortages);

      return HttpResponse.json(result.order, { status: 201 });
    }),

    http.get(`${API}/orders/:id`, async ({ request, params }) => {
      const forced = await simulate("orders:get", request);
      if (forced) return forced;

      const user = requireUser(request);
      if (!user) return unauthorized();

      const order = db.getOrder(String(params.id), user.id);
      return order
        ? HttpResponse.json(order)
        : apiError(404, CODES.ORDER_NOT_FOUND, "Order not found.");
    }),
  ];
}
