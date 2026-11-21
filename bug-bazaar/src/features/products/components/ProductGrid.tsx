import type { Product } from "../../../types/api.ts";
import ProductCard from "./ProductCard.tsx";

type ProductGridProps = {
  /** Heading level for each card title (see ProductCard). */
  headingLevel?: 2 | 3;
  products: readonly Product[];
  /** Current list query string, so details can link back to this exact view. */
  listSearch: string;
};

/**
 * Presentational: renders what it's given. Data loading lives in the page
 * (container/presentational split).
 *
 * A semantic list (<ul>), not role="grid": ARIA grids are for interactive
 * tabular data with arrow-key navigation. For a set of product links, plain
 * Tab order is what keyboard and screen reader users expect, and a list
 * announces "list, 24 items".
 */
export default function ProductGrid({ products, listSearch, headingLevel }: ProductGridProps) {
  return (
    <ul className="product-grid">
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          listSearch={listSearch}
          {...(headingLevel ? { headingLevel } : {})}
        />
      ))}
    </ul>
  );
}
