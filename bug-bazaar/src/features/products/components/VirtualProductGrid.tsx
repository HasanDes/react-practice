// The "all products" view (D4-3): every matching product in one scrolling
// list, without putting thousands of cards in the DOM.
//
// - Virtualized by rows with the page as the scroller (useWindowVirtualizer):
//   only the rows near the viewport, plus a few above and below (overscan),
//   are rendered. Padding above and below stands in for the rest, so the
//   scrollbar has the full length from the start.
// - Still a real <ul> of <li> cards in a CSS grid: screen readers get a list,
//   and each card says its place in the whole set ("3 of 5,000").
// - Columns follow the container width, matching the CSS grid's
//   minmax(220px, 1fr), so rows are the same as in the normal grid.
// - Data arrives in pages of 100 (the API's maximum page size) as rows come
//   into view. Not-yet-loaded positions show skeleton cards. Pages go
//   through the query cache (D3-5), and leaving aborts what's in flight.
// - Scroll position is saved per history entry, so Back from a product
//   returns to the same place instead of the top of 5,000 items.

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getProducts, isAbortError } from "../../../api/index.ts";
import { queryCache } from "../../../cache/queryCache.ts";
import type { Product, ProductListResponse, ProductQuery } from "../../../types/api.ts";
import { ALL_VIEW_PAGE_SIZE, CATALOG_STALE_MS, listKey, seedProducts } from "../catalogCache.ts";
import ProductCard from "./ProductCard.tsx";

const MIN_CARD_WIDTH = 220; // keep in sync with .product-grid in global.css
const GAP = 16; // 1rem
const ESTIMATED_ROW_HEIGHT = 380; // replaced by the measured height once a row renders
const OVERSCAN_ROWS = 2;

type VirtualProductGridProps = {
  /** Filters and sort for every page; `page` and `pageSize` are set here. */
  query: Omit<ProductQuery, "page" | "pageSize">;
  /** The canonical query string: the cache key prefix and the scroll-restore key. */
  queryKey: string;
  total: number;
  firstPage: readonly Product[];
  listSearch: string;
};

function columnsFor(width: number): number {
  return Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
}

const pageKey = (queryKey: string, page: number) => listKey(`${queryKey}#all:${String(page)}`);

export default function VirtualProductGrid({
  query,
  queryKey,
  total,
  firstPage,
  listSearch,
}: VirtualProductGridProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [columns, setColumns] = useState(4);
  const [scrollMargin, setScrollMargin] = useState(0);
  const [pages, setPages] = useState<ReadonlyMap<number, readonly Product[]>>(
    () => new Map([[1, firstPage]]),
  );
  const [failedPages, setFailedPages] = useState<ReadonlySet<number>>(() => new Set());
  const inFlight = useRef(new Map<number, AbortController>());

  /** A page's products: loaded here, or still fresh in the cache from an earlier visit. */
  function pageItems(page: number): readonly Product[] | undefined {
    const loaded = pages.get(page);
    if (loaded) return loaded;
    const cached = queryCache.get<ProductListResponse>(pageKey(queryKey, page));
    return cached && queryCache.isFresh(cached, CATALOG_STALE_MS) ? cached.data.items : undefined;
  }

  // Columns and the list's distance from the top of the page, kept up to
  // date as the window (or anything above the list) changes size.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      setColumns(columnsFor(list.clientWidth));
      setScrollMargin(list.getBoundingClientRect().top + window.scrollY);
    });
    observer.observe(list);
    observer.observe(document.body);
    return () => observer.disconnect();
  }, []);

  // Scroll position per history entry (see the save below). The virtualizer
  // scrolls the window to its initialOffset when it attaches, so that's where
  // the restore happens: a scrollTo of our own would be overwritten by it.
  const { key: historyKey } = useLocation();
  const scrollStorageKey = `bazaar:scroll:${historyKey}`;

  const rowCount = Math.ceil(total / columns);
  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
    gap: GAP,
    scrollMargin,
    initialOffset: () => Number(sessionStorage.getItem(scrollStorageKey)) || window.scrollY,
  });
  const rows = virtualizer.getVirtualItems();
  const firstIndex = (rows[0]?.index ?? 0) * columns;
  const lastIndex = Math.min(total, ((rows.at(-1)?.index ?? 0) + 1) * columns) - 1;
  const firstPageNeeded = Math.floor(firstIndex / ALL_VIEW_PAGE_SIZE) + 1;
  const lastPageNeeded = Math.floor(Math.max(lastIndex, 0) / ALL_VIEW_PAGE_SIZE) + 1;

  // Load the pages that cover the visible rows.
  useEffect(() => {
    for (let page = firstPageNeeded; page <= lastPageNeeded; page++) {
      if (pages.has(page) || inFlight.current.has(page) || failedPages.has(page)) continue;
      const cached = queryCache.get<ProductListResponse>(pageKey(queryKey, page));
      if (cached && queryCache.isFresh(cached, CATALOG_STALE_MS)) continue; // rendered from the cache
      const controller = new AbortController();
      inFlight.current.set(page, controller);
      getProducts({ ...query, page, pageSize: ALL_VIEW_PAGE_SIZE }, { signal: controller.signal })
        .then((response) => {
          queryCache.set(pageKey(queryKey, page), response);
          seedProducts(response.items);
          setPages((current) => new Map(current).set(page, response.items));
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || isAbortError(error)) return;
          setFailedPages((current) => new Set(current).add(page));
        })
        .finally(() => {
          if (inFlight.current.get(page) === controller) inFlight.current.delete(page);
        });
    }
  }, [firstPageNeeded, lastPageNeeded, pages, failedPages, query, queryKey]);

  // Leaving (or a new query, which remounts this component) cancels every page request.
  useEffect(() => {
    const requests = inFlight.current;
    return () => {
      for (const controller of requests.values()) controller.abort();
      requests.clear();
    };
  }, []);

  // Save the scroll position when leaving, so Back returns to the same place.
  // A layout effect on purpose: its cleanup runs while React commits the next
  // page, before this list's DOM is removed, so window.scrollY is still the
  // list's position. A normal effect's cleanup runs after the swap, when the
  // shorter product page has already clamped scrollY to ~0.
  useLayoutEffect(
    () => () => {
      sessionStorage.setItem(scrollStorageKey, String(Math.round(window.scrollY)));
    },
    [scrollStorageKey],
  );

  const first = rows[0];
  const last = rows.at(-1);
  const paddingTop = first ? first.start - scrollMargin : 0;
  const paddingBottom = last ? virtualizer.getTotalSize() - (last.end - scrollMargin) : 0;

  const cards = rows.flatMap((row) => {
    const start = row.index * columns;
    const end = Math.min(total, start + columns);
    const rowCards = [];
    for (let index = start; index < end; index++) {
      const page = Math.floor(index / ALL_VIEW_PAGE_SIZE) + 1;
      const product = pageItems(page)?.[index % ALL_VIEW_PAGE_SIZE];
      // The first card of each row is measured: in a grid row every card has the row's height.
      const measure =
        index === start ? { measureRef: virtualizer.measureElement, rowIndex: row.index } : {};
      rowCards.push(
        product ? (
          <ProductCard
            key={product.id}
            product={product}
            listSearch={listSearch}
            positionIndex={index}
            setSize={total}
            {...measure}
          />
        ) : (
          <li
            key={`placeholder-${String(index)}`}
            className="product-card skeleton-card"
            ref={index === start ? virtualizer.measureElement : undefined}
            data-index={index === start ? row.index : undefined}
            aria-posinset={index + 1}
            aria-setsize={total}
          >
            <div className="skeleton skeleton--image" />
            <div className="product-card__body">
              <span className="visually-hidden">Loading product {index + 1}</span>
              <div className="skeleton skeleton--line" />
              <div className="skeleton skeleton--line skeleton--short" />
            </div>
          </li>
        ),
      );
    }
    return rowCards;
  });

  return (
    <>
      <ul
        ref={listRef}
        className="product-grid product-grid--virtual"
        aria-label={`All ${String(total)} products`}
        style={{
          gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))`,
          paddingTop,
          paddingBottom,
        }}
      >
        {cards}
      </ul>
      {failedPages.size > 0 && (
        <div className="state state--error" role="alert">
          <p className="state__title">Some products couldn&apos;t be loaded</p>
          <div className="state__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setFailedPages(new Set())}
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
