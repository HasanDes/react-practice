// Public entry point of the data layer. UI code imports from here only.

export { apiWebSocketUrl, configureApiClient, type ApiClientConfig } from "./client.ts";
export { ApiRequestError, isAbortError, isApiRequestError, type ApiErrorKind } from "./errors.ts";
export { getProduct, getProducts } from "./products.ts";
export { getMe, login } from "./auth.ts";
export { createOrder, getOrder } from "./orders.ts";
export {
  backoffDelay,
  createStockFeed,
  HEARTBEAT_TIMEOUT_MS,
  type StockFeed,
  type StockFeedOptions,
  type StockFeedStatus,
} from "./stockFeed.ts";
