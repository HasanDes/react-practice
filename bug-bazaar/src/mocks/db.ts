// In-memory "database" for the mock backend.
//
// Products come from the deterministic seed. Only what changes is persisted
// (stock changes after orders, sessions, orders, idempotency keys), so a page
// reload behaves like a real server that remembers state. Without this, every
// reload would invalidate the client's token and undo purchases.

import type {
  CreateOrderResponse,
  Order,
  OrderItem,
  OrderStatus,
  Product,
  User,
} from "../types/api.ts";
import { generateProducts } from "./data/seed.ts";

const STORAGE_KEY = "bazaar:mock-db:v1";

/** Order status advances with time so GET /api/orders/:id has something to show. */
const STATUS_TIMELINE_MS = { processing: 5_000, completed: 15_000 } as const;

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type StoredUser = User & { password: string };

type StoredOrder = {
  id: string;
  userId: string;
  items: OrderItem[];
  createdAt: number;
};

type DbState = {
  /** productId → current stock, only for products whose stock changed. */
  stock: Record<string, number>;
  /** token → session */
  sessions: Record<string, { userId: string; createdAt: number }>;
  orders: Record<string, StoredOrder>;
  /** "userId:idempotencyKey" → orderId */
  idempotency: Record<string, string>;
  nextOrderId: number;
};

export type PlaceOrderResult =
  { ok: true; replayed: boolean; order: CreateOrderResponse } | { ok: false; shortages: Product[] };

export const DEMO_USER: StoredUser = {
  id: "u-1",
  name: "Dev Duck",
  email: "dev@bugbazaar.test",
  password: "rubberduck",
};

/** Storage with the localStorage interface, for Node/tests. */
export function createMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function emptyState(): DbState {
  return { stock: {}, sessions: {}, orders: {}, idempotency: {}, nextOrderId: 1 };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type DbOptions = {
  storage?: StorageLike;
  productCount?: number;
  now?: () => number;
};

export function createDb({
  storage = createMemoryStorage(),
  productCount = 5000,
  now = Date.now,
}: DbOptions = {}) {
  const seedProducts = generateProducts(productCount);
  const seedById = new Map(seedProducts.map((product) => [product.id, product]));
  const users: StoredUser[] = [DEMO_USER];

  let state = load();

  function load(): DbState {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      // Data we wrote ourselves. A shallow shape check guards against old or corrupt entries.
      return isObject(parsed) ? { ...emptyState(), ...(parsed as Partial<DbState>) } : emptyState();
    } catch {
      // Corrupt JSON or blocked storage: start fresh rather than crash the app.
      return emptyState();
    }
  }

  function save(): void {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Quota exceeded or private mode: keep working in memory only.
    }
  }

  /** Apply the current stock on top of the immutable seed record. */
  function withCurrentStock(product: Product): Product {
    const stock = state.stock[product.id];
    return stock === undefined ? product : { ...product, stock };
  }

  function getProduct(id: string): Product | undefined {
    const product = seedById.get(id);
    return product ? withCurrentStock(product) : undefined;
  }

  const publicUser = ({ id, name, email }: User): User => ({ id, name, email });

  function statusFor(order: StoredOrder): OrderStatus {
    const age = now() - order.createdAt;
    if (age >= STATUS_TIMELINE_MS.completed) return "completed";
    if (age >= STATUS_TIMELINE_MS.processing) return "processing";
    return "queued";
  }

  return {
    listProducts(): Product[] {
      return seedProducts.map(withCurrentStock);
    },

    getProduct,

    setStock(id: string, stock: number): void {
      state.stock[id] = Math.max(0, stock);
      save();
    },

    login(email: string, password: string): { token: string; user: User } | null {
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

    userForToken(token: string | null): User | null {
      const session = token ? state.sessions[token] : undefined;
      const user = session && users.find((candidate) => candidate.id === session.userId);
      return user ? publicUser(user) : null;
    },

    /**
     * Place an order atomically: either every line has stock and all stock is
     * reserved, or nothing changes. Replaying the same idempotency key returns
     * the original response instead of charging twice (see D3-2 and docs/orders.md).
     * Items must already be validated (known product ids, positive quantities).
     */
    placeOrder({
      userId,
      items,
      idempotencyKey,
    }: {
      userId: string;
      items: OrderItem[];
      idempotencyKey: string | null;
    }): PlaceOrderResult {
      const replayKey = idempotencyKey ? `${userId}:${idempotencyKey}` : null;
      const replayedId = replayKey ? state.idempotency[replayKey] : undefined;
      if (replayedId) {
        return { ok: true, replayed: true, order: { id: replayedId, status: "queued" } };
      }

      const lines = items.map(({ productId, quantity }) => {
        const product = getProduct(productId);
        if (!product) throw new Error(`placeOrder: unknown product "${productId}"`);
        return { product, quantity };
      });

      const shortages = lines
        .filter(({ product, quantity }) => product.stock < quantity)
        .map(({ product }) => product);
      if (shortages.length > 0) return { ok: false, shortages };

      for (const { product, quantity } of lines) {
        state.stock[product.id] = product.stock - quantity;
      }

      const id = `o-${String(state.nextOrderId).padStart(5, "0")}`;
      state.nextOrderId += 1;
      state.orders[id] = { id, userId, items, createdAt: now() };
      if (replayKey) state.idempotency[replayKey] = id;
      save();

      return { ok: true, replayed: false, order: { id, status: "queued" } };
    },

    getOrder(id: string, userId: string): Order | null {
      const order = state.orders[id];
      // Another user's order is reported as "not found" so ids can't be probed.
      if (!order || order.userId !== userId) return null;
      return { id: order.id, status: statusFor(order) };
    },

    reset(): void {
      state = emptyState();
      storage.removeItem(STORAGE_KEY);
    },
  };
}

export type MockDb = ReturnType<typeof createDb>;
