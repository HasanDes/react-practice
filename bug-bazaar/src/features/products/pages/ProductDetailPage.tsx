import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getProduct, isAbortError, isApiRequestError } from "../../../api/index.ts";
import LoadGate from "../../../components/LoadGate.tsx";
import type { Product } from "../../../types/api.ts";
import { requestState, type RequestState } from "../../../types/request.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import { toError } from "../../../utils/toError.ts";
import StockStatus from "../components/StockStatus.tsx";
import { productListHref } from "../navigation.ts";

/**
 * Route entry: keys the page by id, so moving from one product to another
 * remounts it with fresh state instead of briefly showing the old product.
 */
export default function ProductDetailRoute() {
  const { id = "" } = useParams<{ id: string }>();
  return <ProductDetailPage key={id} id={id} />;
}

function ProductDetailPage({ id }: { id: string }) {
  const [attempt, setAttempt] = useState(0);
  const [product, setProduct] = useState<RequestState<Product>>(requestState.loading());

  useEffect(() => {
    // Abort if the user leaves (or retries) before the response arrives.
    const controller = new AbortController();

    getProduct(id, { signal: controller.signal })
      .then((data) => setProduct(requestState.success(data)))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setProduct(requestState.error(toError(error)));
      });

    return () => controller.abort();
  }, [id, attempt]);

  function retry() {
    setProduct(requestState.loading());
    setAttempt((current) => current + 1);
  }

  if (
    product.status === "error" &&
    isApiRequestError(product.error) &&
    product.error.status === 404
  ) {
    return (
      <section className="product-detail">
        <h2 className="page-heading">Product not found</h2>
        <p>We couldn&apos;t find that product. It may have been removed.</p>
        <BackLink />
      </section>
    );
  }

  return (
    <section className="product-detail">
      <BackLink />
      <LoadGate
        state={product}
        onRetry={retry}
        loadingText="Loading product…"
        errorText="We couldn't load this product. Please try again."
      >
        {(data) => <ProductDetails product={data} />}
      </LoadGate>
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
        <dl className="product-detail__facts">
          <dt>Category</dt>
          <dd className="capitalize">{product.category}</dd>
          <dt>Rating</dt>
          <dd>{product.rating.toFixed(1)} out of 5</dd>
          <dt>Product ID</dt>
          <dd>{product.id}</dd>
        </dl>
      </div>
    </article>
  );
}

function BackLink() {
  // Back to the exact filtered list this product was opened from (or "/").
  const state: unknown = useLocation().state;
  return (
    <Link to={productListHref(state)} className="back-link">
      ← Back to products
    </Link>
  );
}
