import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getProducts } from "../../../api/index.ts";
import BackToTop from "../../../components/BackToTop.tsx";
import LoadGate from "../../../components/LoadGate.tsx";
import { EmptyState, LoadingState } from "../../../components/states.tsx";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useRequest } from "../../../hooks/useRequest.ts";
import { CATALOG_STALE_MS, listKey, seedProducts } from "../catalogCache.ts";
import Pagination from "../components/Pagination.tsx";
import ProductFilters from "../components/ProductFilters.tsx";
import ProductGrid from "../components/ProductGrid.tsx";
import {
  hasActiveFilters,
  parseFilters,
  resultSummary,
  toProductQuery,
  toSearchParams,
  type ProductFilters as Filters,
} from "../filters.ts";

export const PAGE_SIZE = 24;

/** Container: owns URL filters and loading. Filters/grid/pagination only render. */
export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);
  // Canonical string for "which results are we showing". It changes exactly when the query does.
  const queryKey = toSearchParams(filters).toString();

  // The key changes exactly when the query does: the previous request is
  // aborted and loading (or this query's cached results) shows at once, so
  // the previous query's results never flash. Cached for revisits (D3-5),
  // and each listed product is cached for its details page too.
  const { state: products, retry } = useRequest(
    listKey(queryKey),
    async (signal) => {
      const page = await getProducts(toProductQuery(filters, PAGE_SIZE), { signal });
      seedProducts(page.items);
      return page;
    },
    { staleTime: CATALOG_STALE_MS },
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  // A typed search is waiting to apply: what's on screen is for an older query.
  const [searchPending, setSearchPending] = useState(false);

  /** Push a new URL. Changing any filter starts again at page 1. */
  function updateFilters(changes: Partial<Filters>) {
    const next = toSearchParams({ ...filters, page: 1, ...changes });
    // e.g. typing "duck" then deleting back to the current search: no change,
    // so no duplicate history entry and no refetch.
    if (next.toString() === queryKey) return;
    setSearchParams(next);
  }

  function clearFilters() {
    setSearchParams(new URLSearchParams());
  }

  function goToPage(page: number) {
    setSearchParams(toSearchParams({ ...filters, page }));
    // Don't strand keyboard users at the bottom. focus() also scrolls it into view.
    headingRef.current?.focus();
  }

  const filtered = hasActiveFilters(filters);
  useDocumentTitle(filters.search ? `"${filters.search}" · Products` : "Products");

  return (
    <section aria-labelledby="products-heading">
      <h2 id="products-heading" ref={headingRef} tabIndex={-1} className="page-heading">
        Products
      </h2>

      <ProductFilters
        filters={filters}
        onFiltersChange={updateFilters}
        onClear={clearFilters}
        onSearchPendingChange={setSearchPending}
      />

      {/* Live region: screen readers hear the new count after each filter change. */}
      <p className="result-count" role="status">
        {searchPending
          ? "Searching…"
          : products.status === "success"
            ? resultSummary(products.data.total, filters.search, filtered)
            : ""}
      </p>

      {/* Dimmed while a typed search is pending: never present old results as current. */}
      <div
        className={searchPending ? "results results--stale" : "results"}
        aria-busy={searchPending}
      >
        <LoadGate
          state={products}
          onRetry={retry}
          subject="products"
          loading={<LoadingState label="Loading products…" variant="grid" />}
          isEmpty={({ total }) => total === 0}
          empty={
            filtered ? (
              <EmptyState
                title="No products match your filters"
                description="Try a different search, or clear the filters to see everything."
                action={
                  <button type="button" className="button button--primary" onClick={clearFilters}>
                    Clear filters
                  </button>
                }
              />
            ) : (
              <EmptyState icon="📦" title="No products yet" description="Check back soon." />
            )
          }
        >
          {({ items, total }) => {
            const totalPages = Math.ceil(total / PAGE_SIZE);
            if (items.length === 0) {
              // e.g. a stale link to page 40 of a search that now has 3 pages
              return (
                <EmptyState
                  icon="📄"
                  title="That page doesn't exist"
                  description={`These results only have ${String(totalPages)} ${totalPages === 1 ? "page" : "pages"}.`}
                  action={
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={() => goToPage(1)}
                    >
                      Go to page 1
                    </button>
                  }
                />
              );
            }
            return (
              <>
                <ProductGrid products={items} listSearch={searchParams.toString()} />
                <Pagination page={filters.page} totalPages={totalPages} onPageChange={goToPage} />
              </>
            );
          }}
        </LoadGate>
      </div>
      <BackToTop />
    </section>
  );
}
