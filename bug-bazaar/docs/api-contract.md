# API Contract

The shared contract every Bug Bazaar task builds against. The app runs against a **mock backend** (MSW, see [Mock backend](#mock-backend)) that implements exactly this document. Contract tests in `src/mocks/handlers.test.js` check every endpoint and every listed error.

- **Base URL:** `/api` (configurable with `VITE_API_BASE_URL` from D1-4)
- **Format:** JSON request and response bodies (`Content-Type: application/json`)
- **Money:** all prices are **integer cents** (`1999` = $19.99). Format only at display time.
- **Auth:** `Authorization: Bearer <token>` using the token from `POST /api/login`

---

## Types

```ts
type Category = "keyboards" | "ducks" | "coffee" | "stickers";

type Product = {
  id: string; // "p-0001" … "p-5000"
  name: string;
  price: number; // integer cents
  category: Category;
  stock: number; // 0 = sold out
  rating: number; // 0–5, one decimal
  imageUrl: string; // "/images/products/<category>.svg"
};

type User = {
  id: string;
  name: string;
  email: string;
};

type OrderStatus = "queued" | "processing" | "completed";

type ApiError = {
  error: {
    code: string; // machine-readable, see Error codes
    message: string; // safe, human-readable fallback
    details?: Record<string, string>; // field → message (400) or productId → message (409)
  };
};
```

## Endpoints

| Method | Endpoint                                      | Success                                   | Errors        |
| ------ | --------------------------------------------- | ----------------------------------------- | ------------- |
| GET    | `/api/products?search=&category=&sort=&page=` | `200 { items: Product[], total: number }` | 500           |
| GET    | `/api/products/:id`                           | `200 Product`                             | 404           |
| POST   | `/api/login`                                  | `200 { token, user: User }`               | 400, 401      |
| GET    | `/api/me`                                     | `200 User`                                | 401           |
| POST   | `/api/orders`                                 | `201 { id, status: "queued" }`            | 400, 401, 409 |
| GET    | `/api/orders/:id`                             | `200 { id, status: OrderStatus }`         | 401, 404      |

> **500 everywhere:** the contract lists 500 only for the product list, but any real endpoint can fail. The mock lets you force 500 on **every** route so the retry UI (D2-3, D3-4) can be tested on every page.

### GET `/api/products`

Search, filter, sort and paginate the catalog (5,000 seeded products).

| Param      | Values                                                                    | Default     | Notes                                                                |
| ---------- | ------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------- |
| `search`   | any text                                                                  | (none)      | Case-insensitive match on `name`, trimmed                            |
| `category` | `keyboards` \| `ducks` \| `coffee` \| `stickers`                          | (all)       | Unknown values are ignored                                           |
| `sort`     | `relevance` \| `price-asc` \| `price-desc` \| `rating-desc` \| `name-asc` | `relevance` | `relevance` = catalog order. Ties break on `id`, so pages are stable |
| `page`     | integer ≥ 1                                                               | `1`         | Invalid values become `1`                                            |
| `inStock`  | `true`                                                                    | (off)       | **Extension:** only `stock > 0` (needed by D2-2)                     |
| `pageSize` | 1–100                                                                     | `24`        | **Extension:** clamped to the range                                  |

`total` is the number of matches **across all pages**. No matches → `200 { items: [], total: 0 }` (an empty state, not an error).

```http
GET /api/products?search=duck&category=ducks&sort=price-asc&page=1
→ 200 { "items": [ { "id": "p-0002", "name": "Glow-in-the-Dark Duck XL #2", "price": 1199, … } ], "total": 1228 }
```

| Status | When           | Body `error.code` |
| ------ | -------------- | ----------------- |
| 500    | Server failure | `INTERNAL_ERROR`  |

### GET `/api/products/:id`

```http
GET /api/products/p-0042   → 200 Product
GET /api/products/p-9999   → 404 { "error": { "code": "PRODUCT_NOT_FOUND", "message": "Product not found." } }
```

| Status | When               | Body `error.code`   |
| ------ | ------------------ | ------------------- |
| 404    | No product with id | `PRODUCT_NOT_FOUND` |

### POST `/api/login`

```http
POST /api/login
{ "email": "dev@bugbazaar.test", "password": "rubberduck" }

→ 200 { "token": "mock-…", "user": { "id": "u-1", "name": "Dev Duck", "email": "dev@bugbazaar.test" } }
```

| Status | When                                                        | Body                                                                             |
| ------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 400    | Missing email/password, malformed email, or body isn't JSON | `VALIDATION_ERROR`, `details: { email?, password? }` (one message per bad field) |
| 401    | Email/password don't match                                  | `INVALID_CREDENTIALS`                                                            |

**Demo account:** `dev@bugbazaar.test` / `rubberduck`

### GET `/api/me`

Requires `Authorization: Bearer <token>`. Returns the current `User`.

| Status | When                                                                        | Body `error.code` |
| ------ | --------------------------------------------------------------------------- | ----------------- |
| 401    | Missing or unknown token (the mock has no expiry; force it to simulate one) | `UNAUTHORIZED`    |

### POST `/api/orders`

Requires auth. Places an order **atomically**: either every line has enough stock and all of it is reserved, or nothing changes.

```http
POST /api/orders
Authorization: Bearer <token>
Idempotency-Key: 3f1c…   (recommended: one key per checkout attempt)
{ "items": [ { "productId": "p-0001", "quantity": 2 } ] }

→ 201 { "id": "o-00001", "status": "queued" }
```

| Status | When                                                                          | Body                                                                                                                                                         |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `items` missing or empty; unknown `productId`; `quantity` not an integer 1–99 | `VALIDATION_ERROR`, `details` keyed `items` or `items.<index>.productId` / `items.<index>.quantity`                                                          |
| 401    | Not logged in                                                                 | `UNAUTHORIZED`                                                                                                                                               |
| 409    | Any line wants more than the current stock                                    | `OUT_OF_STOCK`. `message` names the item (one item) or gives a count (several). `details: { "<productId>": "<name>: only N left" }` for **every** short item |

**Idempotency (supports D3-2):** if the same user sends the same `Idempotency-Key` again, for example a retry after a timeout, the server returns the **original** order (`201`, same `id`) and does **not** reserve stock again. Requests without the header are not deduplicated.

### GET `/api/orders/:id`

Requires auth. Status moves on with time: `queued` (0–5 s) → `processing` (5–15 s) → `completed`.

```http
GET /api/orders/o-00001 → 200 { "id": "o-00001", "status": "processing" }
```

| Status | When                                                                   | Body `error.code` |
| ------ | ---------------------------------------------------------------------- | ----------------- |
| 401    | Not logged in                                                          | `UNAUTHORIZED`    |
| 404    | No such order, **or it belongs to another user** (ids can't be probed) | `ORDER_NOT_FOUND` |

## Error codes

| Code                  | Status | Meaning                                                                |
| --------------------- | ------ | ---------------------------------------------------------------------- |
| `VALIDATION_ERROR`    | 400    | Request body is invalid. See `details` for each field                  |
| `INVALID_CREDENTIALS` | 401    | Login failed                                                           |
| `UNAUTHORIZED`        | 401    | Token missing, invalid or expired. The client should clear the session |
| `PRODUCT_NOT_FOUND`   | 404    | Unknown product id                                                     |
| `ORDER_NOT_FOUND`     | 404    | Unknown order id (or not yours)                                        |
| `OUT_OF_STOCK`        | 409    | Not enough stock. `details` keyed by productId                         |
| `INTERNAL_ERROR`      | 500    | Unexpected server failure. Safe to retry                               |

Clients should branch on `status` and `error.code`, never on `message` text. `message` is a safe fallback, but the UI shows its own copy (D3-4: raw error messages never reach the screen).

---

## Mock backend

Implemented with [MSW](https://mswjs.io/) in `src/mocks/`. It starts automatically before the app renders (`src/main.jsx`). Turn it off with `VITE_USE_MOCK_API=false`.

| File               | Role                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| `contract.js`      | Constants (categories, sorts, page sizes) and the allowed errors for each route            |
| `data/seed.js`     | Deterministic generator: the same 5,000 products every time (seeded PRNG)                  |
| `queryProducts.js` | Pure search/filter/sort/paginate logic                                                     |
| `db.js`            | Mock state: stock changes, sessions, orders, idempotency keys, persisted to `localStorage` |
| `controls.js`      | Latency and forced-error switches                                                          |
| `handlers.js`      | The HTTP endpoints above                                                                   |
| `browser.js`       | Starts the Service Worker and exposes `window.bazaarMock`                                  |
| `handlers.test.js` | Contract tests (`npm test`)                                                                |

**Persistence:** stock changes, sessions and orders survive a page reload, like a real server. Clear them with `bazaarMock.reset()`.

### Triggering each error on purpose

**1. Natural triggers (real inputs)**

| Status | Endpoint                | How                                                                      |
| ------ | ----------------------- | ------------------------------------------------------------------------ |
| 400    | `POST /api/login`       | Submit an empty or malformed email, or no password                       |
| 401    | `POST /api/login`       | Wrong password                                                           |
| 401    | `GET /api/me`, orders   | Call without a token, or after `bazaarMock.reset()` (sessions are wiped) |
| 404    | `GET /api/products/:id` | Visit a product id that doesn't exist, e.g. `p-9999`                     |
| 404    | `GET /api/orders/:id`   | Unknown order id, e.g. `o-99999`                                         |
| 400    | `POST /api/orders`      | Empty `items`, quantity `0`, or unknown product                          |
| 409    | `POST /api/orders`      | Order more than the stock. Use `bazaarMock.setStock("p-0001", 0)` first  |

**2. Browser console (`window.bazaarMock`).** Persists across reloads until cleared.

```js
bazaarMock.help(); // list routes, statuses and commands
bazaarMock.fail("products:list", 500); // every product-list request fails
bazaarMock.fail("orders:create", 409, { once: true }); // only the next checkout fails
bazaarMock.clear(); // stop all forced errors (or clear("login"))
bazaarMock.latency(2000); // 2–4 s responses (jitter reorders them, D2-6)
bazaarMock.latency(0, 0); // instant
bazaarMock.setStock("p-0001", 0); // sold out
bazaarMock.reset(); // wipe orders, sessions, stock changes
```

Route names: `products:list`, `products:get`, `login`, `me`, `orders:create`, `orders:get`. Forcing a status outside a route's list (for example 409 on `products:get`) throws an error. The contract is enforced.

**3. Per request (scripts, curl, tests):** add the header `x-mock-error: <status>` or the query param `?mockError=<status>`.

### Latency

The base latency is `VITE_MOCK_LATENCY_MS` (default 300 ms), plus random jitter of the same size. So responses take 300–600 ms and can **arrive out of order**, which is exactly what D2-6 needs. Change it at runtime with `bazaarMock.latency(ms, jitter)`.
