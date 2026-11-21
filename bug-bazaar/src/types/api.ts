// Shared API contract types. This is the single source of truth for both the app
// and the mock backend. Mirrors docs/api-contract.md.

export const CATEGORIES = ["keyboards", "ducks", "coffee", "stickers"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SORTS = ["relevance", "price-asc", "price-desc", "rating-desc", "name-asc"] as const;
export type SortOption = (typeof SORTS)[number];

/**
 * Integer number of cents (1999 = $19.99). A plain alias, not a branded type,
 * so contract JSON can be used directly. The name alone signals the unit.
 */
export type Cents = number;

export type Product = {
  id: string;
  name: string;
  price: Cents;
  category: Category;
  stock: number;
  rating: number;
  imageUrl: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
};

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string>;
  };
};

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "PRODUCT_NOT_FOUND"
  | "ORDER_NOT_FOUND"
  | "OUT_OF_STOCK"
  | "INTERNAL_ERROR";

// --- GET /api/products ----------------------------------------------------

export type ProductQuery = {
  search?: string;
  category?: Category;
  sort?: SortOption;
  page?: number;
  /** Contract extension: only items with stock > 0. */
  inStock?: boolean;
  /** Contract extension: 1–100, default 24. */
  pageSize?: number;
};

export type ProductListResponse = {
  items: Product[];
  total: number;
};

// --- POST /api/login ------------------------------------------------------

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = {
  token: string;
  user: User;
};

// --- Orders ----------------------------------------------------------------

export type OrderStatus = "queued" | "processing" | "completed";

export type OrderItem = {
  productId: string;
  quantity: number;
};

export type CreateOrderRequest = {
  items: OrderItem[];
};

export type CreateOrderResponse = {
  id: string;
  status: "queued";
};

export type Order = {
  id: string;
  status: OrderStatus;
};

// --- Live stock feed (D4-4) ---------------------------------------------------
// WebSocket at /api/stock. JSON text frames. See docs/api-contract.md.

/** Client → server: replace the set of products this client wants updates for. */
export type StockFeedClientMessage = { type: "subscribe"; productIds: string[] };

/** Server → client. */
export type StockFeedServerMessage =
  /** Current stock for every subscribed product: sent after each subscribe. */
  | { type: "snapshot"; stock: Record<string, number> }
  /** One product's stock changed. */
  | { type: "stock"; productId: string; stock: number }
  /** Heartbeat, every 10 s, so a silently dead connection can be detected. */
  | { type: "ping" };

// --- Type guards ---------------------------------------------------------------
// Narrow untrusted strings (URL params, JSON) to contract unions without casts.

export function isCategory(value: unknown): value is Category {
  return typeof value === "string" && (CATEGORIES as readonly string[]).includes(value);
}

export function isSortOption(value: unknown): value is SortOption {
  return typeof value === "string" && (SORTS as readonly string[]).includes(value);
}
