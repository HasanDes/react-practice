import { useEffect, useRef, useState } from "react";
import { getProducts, isAbortError } from "../../../api/index.ts";
import LoadGate from "../../../components/LoadGate.tsx";
import type { ProductListResponse } from "../../../types/api.ts";
import { requestState, type RequestState } from "../../../types/request.ts";
import { toError } from "../../../utils/toError.ts";
import Pagination from "../components/Pagination.tsx";
import ProductGrid from "../components/ProductGrid.tsx";

export const PAGE_SIZE = 24;

/** Container: owns loading and paging. ProductGrid/ProductCard only render. */
export default function ProductsPage() {
  // Page is local state for now. D2-2 moves page and filters into the URL.
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [products, setProducts] = useState<RequestState<ProductListResponse>>(
    requestState.loading(),
  );
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Cancel the request if the page changes or the component unmounts,
    // so a slow, stale response can never overwrite a newer one.
    const controller = new AbortController();

    getProducts({ page, pageSize: PAGE_SIZE }, { signal: controller.signal })
      .then((data) => setProducts(requestState.success(data)))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setProducts(requestState.error(toError(error)));
      });

    return () => controller.abort();
  }, [page, attempt]);

  function goToPage(next: number) {
    setProducts(requestState.loading());
    setPage(next);
    // Keyboard and screen reader users would otherwise be left at the
    // pagination buttons at the bottom. focus() also scrolls the heading into view.
    headingRef.current?.focus();
  }

  function retry() {
    setProducts(requestState.loading());
    setAttempt((current) => current + 1);
  }

  return (
    <section aria-labelledby="products-heading">
      <h2 id="products-heading" ref={headingRef} tabIndex={-1} className="page-heading">
        Products
      </h2>
      <LoadGate
        state={products}
        onRetry={retry}
        loadingText="Loading products…"
        errorText="We couldn't load products. Please try again."
      >
        {({ items, total }) =>
          items.length === 0 ? (
            <p className="state state--empty">No products found.</p>
          ) : (
            <>
              <p className="result-count">{total.toLocaleString("en-US")} products</p>
              <ProductGrid products={items} />
              <Pagination
                page={page}
                totalPages={Math.ceil(total / PAGE_SIZE)}
                onPageChange={goToPage}
              />
            </>
          )
        }
      </LoadGate>
    </section>
  );
}
