// Product details page.
//
// Every side effect here cleans up after itself (D2-4):
//   effect                      | cleanup
//   ----------------------------|---------------------------------------------
//   fetch the product           | abort it (switching products, retrying, leaving)
//   fetch related products      | abort it
//   (both via useRequest, which owns the fetch/abort/retry lifecycle)
//   document title              | restore the previous title
//   Back to Top scroll listener | remove the listener, cancel the pending frame
//   focus the heading           | none needed (one-off, synchronous)
// And the route is keyed by id, so switching products mounts a fresh page:
// state can never carry over from the previous product.

import { useEffect, useRef } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getProduct, getProducts } from "../../../api/index.ts";
import BackToTop from "../../../components/BackToTop.tsx";
import LoadGate from "../../../components/LoadGate.tsx";
import { EmptyState, LoadingState, NotFoundState } from "../../../components/states.tsx";
import { classifyError } from "../../../errors/appError.ts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useRequest } from "../../../hooks/useRequest.ts";
import type { Product } from "../../../types/api.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import AddToCart from "../../cart/components/AddToCart.tsx";
import ProductGrid from "../components/ProductGrid.tsx";
import StockStatus from "../components/StockStatus.tsx";
import { CATEGORY_LABELS } from "../filters.ts";
import { listSearchFrom, productListHref } from "../navigation.ts";

export const RELATED_COUNT = 4;

/**
 * Route entry: keys the page by id, so moving from one product to another
 * remounts it with fresh state instead of briefly showing the old product.
 */
export default function ProductDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <ProductDetailPage key={id} id={id} />;
}

function ProductDetailPage({ id }: { id: string }) {
  // Aborted if the user switches product, retries or leaves before the
  // response arrives, so a slow answer for the *previous* product can never
  // be written into this page.
  const { state: product, retry } = useRequest(id, (signal) => getProduct(id, { signal }));

  const notFound = product.status === "error" && classifyError(product.error).kind === "not-found";
  useDocumentTitle(
    product.status === "success" ? product.data.name : notFound ? "Product not found" : null,
  );

  return (
    <section className="product-detail">
      <BackLink />
      <LoadGate
        state={product}
        onRetry={retry}
        subject="this product"
        loading={<LoadingState label="Loading product…" variant="detail" />}
        notFound={
          // 404 isn't a failure to retry: the product doesn't exist.
          <NotFoundState
            title="Product not found"
            description="We couldn't find that product. It may have been removed, or the link is wrong."
            action={<BackLink className="button button--primary" />}
          />
        }
      >
        {(data) => (
          <>
            <ProductDetails product={data} />
            <RelatedProducts product={data} />
          </>
        )}
      </LoadGate>
      <BackToTop />
    </section>
  );
}

function ProductDetails({ product }: { product: Product }) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Route change: move focus to the new page's heading, so screen reader users
  // hear where they landed instead of staying on a link that no longer exists.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <article className="product-detail__content">
      <img
        className="product-detail__image"
        src={product.imageUrl}
        alt=""
        width={400}
        height={300}
      />
      <div className="product-detail__info">
        <h2 ref={headingRef} tabIndex={-1} className="page-heading">
          {product.name}
        </h2>
        <p className="product-detail__price">{formatPrice(product.price)}</p>
        <StockStatus stock={product.stock} />
        <AddToCart product={product} />
        <dl className="product-detail__facts">
          <dt>Category</dt>
          <dd>{CATEGORY_LABELS[product.category]}</dd>
          <dt>Rating</dt>
          <dd>{product.rating.toFixed(1)} out of 5</dd>
          <dt>Product ID</dt>
          <dd>{product.id}</dd>
        </dl>
      </div>
    </article>
  );
}

/** Top-rated items from the same category: a second request, cancelled the same way. */
function RelatedProducts({ product }: { product: Product }) {
  const { id, category } = product;
  const listSearch = listSearchFrom(useLocation().state);
  const { state: related, retry } = useRequest(`related:${category}:${id}`, async (signal) => {
    const { items } = await getProducts(
      { category, sort: "rating-desc", pageSize: RELATED_COUNT + 1 },
      { signal },
    );
    return items.filter((item) => item.id !== id).slice(0, RELATED_COUNT);
  });

  return (
    <section className="related" aria-labelledby="related-heading">
      <h3 id="related-heading" className="related__heading">
        More {CATEGORY_LABELS[category].toLowerCase()}
      </h3>
      <LoadGate
        state={related}
        onRetry={retry}
        subject="related products"
        loading={
          <LoadingState label="Loading related products…" variant="grid" count={RELATED_COUNT} />
        }
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState title="Nothing else in this category yet" />}
      >
        {(items) => <ProductGrid products={items} listSearch={listSearch} />}
      </LoadGate>
    </section>
  );
}

function BackLink({ className = "back-link" }: { className?: string }) {
  // Back to the exact filtered list this product was opened from (or "/").
  const state: unknown = useLocation().state;
  return (
    <Link to={productListHref(state)} className={className}>
      ← Back to products
    </Link>
  );
}
