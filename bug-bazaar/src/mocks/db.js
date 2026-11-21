// In-memory "database" for the mock backend.
//
// Products come from the deterministic seed. Only what changes is persisted
// (stock changes after orders, sessions, orders, idempotency keys), so a page
// reload behaves like a real server that remembers state. Without this, every
// reload would invalidate the client's token and undo purchases.

import { generateProducts } from "./data/seed.js";

const STORAGE_KEY = "bazaar:mock-db:v1";

/** Order status advances with time so GET /api/orders/:id has something to show. */
const STATUS_TIMELINE_MS = { processing: 5_000, completed: 15_000 };

export const DEMO_USER = {
  id: "u-1",
  name: "Dev Duck",
  email: "dev@bugbazaar.test",
  password: "rubberduck",
};

/** Storage with the localStorage interface, for Node/tests. */
export function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function emptyState() {
  return { stock: {}, sessions: {}, orders: {}, idempotency: {}, nextOrderId: 1 };
}

/**
 * @param {{ storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">, productCount?: number, now?: () => number }} [options]
 */
export function createDb({
  storage = createMemoryStorage(),
  productCount = 5000,
  now = Date.now,
} = {}) {
  const seedProducts = generateProducts(productCount);
  const seedById = new Map(seedProducts.map((product) => [product.id, product]));
  const users = [DEMO_USER];

  let state = load();

  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      return raw ? { ...emptyState(), ...JSON.parse(raw) } : emptyState();
    } catch {
      // Corrupt JSON or blocked storage: start fresh rather than crash the app.
      return emptyState();
    }
  }

  function save() {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or private mode: keep working in memory only.
    }
  }

  /** Apply the current stock on top of the immutable seed record. */
  function withCurrentStock(product) {
    return product.id in state.stock ? { ...product, stock: state.stock[product.id] } : product;
  }

  function getProduct(id) {
    const product = seedById.get(id);
    return product ? withCurrentStock(product) : undefined;
  }

  const publicUser = ({ id, name, email }) => ({ id, name, email });

  function statusFor(order) {
    const age = now() - order.createdAt;
    if (age >= STATUS_TIMELINE_MS.completed) return "completed";
    if (age >= STATUS_TIMELINE_MS.processing) return "processing";
    return "queued";
  }

  return {
    listProducts() {
      return seedProducts.map(withCurrentStock);
    },

    getProduct,

    setStock(id, stock) {
      state.stock[id] = Math.max(0, stock);
      save();
    },

    login(email, password) {
      const user = users.find(
        (candidate) =>
          candidate.email.toLowerCase() === email.toLowerCase() && candidate.password === password,
      );
      if (!user) return null;

      const token = `mock-${crypto.randomUUID()}`;
      state.sessions[token] = { userId: user.id, createdAt: now() };
      save();
      return { token, user: publicUser(user) };
    },

    userForToken(token) {
      const session = token ? state.sessions[token] : undefined;
      const user = session && users.find((candidate) => candidate.id === session.userId);
      return user ? publicUser(user) : null;
    },

    /**
     * Place an order atomically: either every line has stock and all stock is
     * reserved, or nothing changes. Replaying the same idempotency key returns
     * the original order instead of charging twice (see D3-2 and docs/orders.md).
     *
     * @param {{ userId: string, items: { productId: string, quantity: number }[], idempotencyKey?: string | null }} input
     */
    placeOrder({ userId, items, idempotencyKey }) {
      const replayKey = idempotencyKey ? `${userId}:${idempotencyKey}` : null;
      if (replayKey && state.idempotency[replayKey]) {
        const original = state.orders[state.idempotency[replayKey]];
        return {
          ok: true,
          replayed: true,
          order: { id: original.id, status: statusFor(original) },
        };
      }

      const shortages = items
        .map(({ productId, quantity }) => ({ product: getProduct(productId), quantity }))
        .filter(({ product, quantity }) => product.stock < quantity)
        .map(({ product }) => product);
      if (shortages.length > 0) return { ok: false, shortages };

      for (const { productId, quantity } of items) {
        state.stock[productId] = getProduct(productId).stock - quantity;
      }

      const id = `o-${String(state.nextOrderId).padStart(5, "0")}`;
      state.nextOrderId += 1;
      state.orders[id] = { id, userId, items, createdAt: now() };
      if (replayKey) state.idempotency[replayKey] = id;
      save();

      return { ok: true, replayed: false, order: { id, status: "queued" } };
    },

    getOrder(id, userId) {
      const order = state.orders[id];
      // Another user's order is reported as "not found" so ids can't be probed.
      if (!order || order.userId !== userId) return null;
      return { id: order.id, status: statusFor(order) };
    },

    reset() {
      state = emptyState();
      storage.removeItem(STORAGE_KEY);
    },
  };
}
