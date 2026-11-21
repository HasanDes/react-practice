// Shared API contract constants used by the mock backend.
// The JSDoc typedefs mirror docs/api-contract.md. D1-3 turns them into
// TypeScript types in src/types/.

/**
 * @typedef {"keyboards" | "ducks" | "coffee" | "stickers"} Category
 *
 * @typedef {object} Product
 * @property {string} id
 * @property {string} name
 * @property {number} price   Integer cents, e.g. 1999 = $19.99
 * @property {Category} category
 * @property {number} stock
 * @property {number} rating  0–5, one decimal
 * @property {string} imageUrl
 *
 * @typedef {object} User
 * @property {string} id
 * @property {string} name
 * @property {string} email
 *
 * @typedef {"queued" | "processing" | "completed"} OrderStatus
 *
 * @typedef {object} ApiError
 * @property {{ code: string, message: string, details?: Record<string, string> }} error
 */

/** @type {readonly Category[]} */
export const CATEGORIES = ["keyboards", "ducks", "coffee", "stickers"];

export const SORTS = ["relevance", "price-asc", "price-desc", "rating-desc", "name-asc"];

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;
export const MAX_ORDER_QUANTITY = 99;

/**
 * Status codes each route can return on purpose (natural or forced).
 * The contract lists 500 only for the product list, but any real endpoint
 * can fail with 500, so the mock allows forcing it everywhere. That lets the
 * UI's retry path (D2-3, D3-4) be tested on every page.
 */
export const ROUTE_ERRORS = {
  "products:list": [500],
  "products:get": [404, 500],
  login: [400, 401, 500],
  me: [401, 500],
  "orders:create": [400, 401, 409, 500],
  "orders:get": [401, 404, 500],
};

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHORIZED: "UNAUTHORIZED",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};
