// Mock-backend constants. Contract types live in src/types/api.ts.

import type { ApiErrorCode } from "../types/api.ts";

export { CATEGORIES, SORTS } from "../types/api.ts";

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
} as const satisfies Record<string, readonly number[]>;

export type MockRoute = keyof typeof ROUTE_ERRORS;
export type MockErrorStatus = (typeof ROUTE_ERRORS)[MockRoute][number];

/** A forced failure: a documented HTTP status, or "network" (connection dropped, no response). */
export type MockFailure = MockErrorStatus | "network";

export const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  UNAUTHORIZED: "UNAUTHORIZED",
  PRODUCT_NOT_FOUND: "PRODUCT_NOT_FOUND",
  ORDER_NOT_FOUND: "ORDER_NOT_FOUND",
  OUT_OF_STOCK: "OUT_OF_STOCK",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const satisfies Record<ApiErrorCode, ApiErrorCode>;
