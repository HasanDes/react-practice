// A small in-memory cache for server data (D3-5: "avoid refetching data the
// app already has"). useRequest reads and writes it when a call opts in with
// a staleTime. See docs/decisions.md (D3-5) for when stale data is acceptable.
//
// - Keys are strings owned by the caller, like useRequest keys:
//   "products:<query>", "product:<id>", "related:<category>:<id>". One key,
//   one data shape: the same contract as TanStack Query / SWR keys.
// - Least recently used entries are dropped past `maxEntries`, so browsing
//   thousands of products can't grow memory without bound.
// - Memory only: a reload starts empty. The catalog is public data and
//   cheap to fetch again; persisting it would mean persisting stale stock.

export type CacheEntry<T> = { data: T; updatedAt: number };

export type QueryCache = ReturnType<typeof createQueryCache>;

export function createQueryCache({
  now = () => Date.now(),
  maxEntries = 100,
}: { now?: () => number; maxEntries?: number } = {}) {
  // A Map keeps insertion order: re-inserting on read/write keeps the most
  // recently used entries at the end, so the first key is the one to evict.
  const entries = new Map<string, CacheEntry<unknown>>();

  return {
    /** The entry for `key`, if any. The caller decides if it's fresh enough. */
    get<T>(key: string): CacheEntry<T> | undefined {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      entries.set(key, entry);
      return entry as CacheEntry<T>;
    },

    set(key: string, data: unknown): void {
      entries.delete(key);
      entries.set(key, { data, updatedAt: now() });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },

    /** Fresh = younger than `staleTime` ms. A stale entry is still shown, then refetched. */
    isFresh(entry: CacheEntry<unknown>, staleTime: number): boolean {
      return now() - entry.updatedAt < staleTime;
    },

    /**
     * Drop every entry the predicate matches, e.g. everything that shows a
     * product whose stock just changed. The next visit fetches it again.
     * Returns how many were removed.
     */
    removeWhere(predicate: (key: string, data: unknown) => boolean): number {
      let removed = 0;
      for (const [key, entry] of entries) {
        if (predicate(key, entry.data)) {
          entries.delete(key);
          removed++;
        }
      }
      return removed;
    },

    clear(): void {
      entries.clear();
    },

    get size(): number {
      return entries.size;
    },
  };
}

/** The app's cache. Tests clear it after each test (src/test/setup.ts). */
export const queryCache = createQueryCache();
