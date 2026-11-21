import { memo } from "react";
import { Link } from "react-router-dom";
import { StarIcon } from "../../../components/icons.tsx";
import type { Product } from "../../../types/api.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import type { FromListState } from "../navigation.ts";
import StockStatus from "./StockStatus.tsx";

type ProductCardProps = {
  /** Card titles sit one level below the section heading: 2 in the main list (under the page's h1), 3 in Related (under its h2). */
  headingLevel?: 2 | 3;
  product: Product;
  listSearch: string;
  /**
   * In the virtualized "all" view (D4-3): the card's place in the whole
   * result set (0-based index, and the set size), so a screen reader says
   * "3 of 5,000" although only a few rows exist in the DOM. Two numbers, not
   * an object: a new { index, total } on every render would defeat memo.
   */
  positionIndex?: number;
  setSize?: number;
  /** In the virtualized view, the first card of each row is measured (row height). */
  measureRef?: (element: HTMLLIElement | null) => void;
  rowIndex?: number;
};

/**
 * Keyboard and screen reader design:
 * - One Tab stop per card: only the name is a link. A CSS "stretched link"
 *   (::after covering the card) makes the whole card clickable for mouse users.
 * - The link's accessible name is just the product name, not the whole card's
 *   text, so tabbing through 24 cards isn't a wall of noise. Price and stock
 *   are read as normal content around it.
 * - The image is decorative (a category illustration next to the name), so alt="".
 *
 * Memoized (D4-3): in the virtualized all view the grid re-renders on every
 * scroll frame, and without memo every visible card re-rendered with it
 * (11,830 card renders in a 7 s scroll; 590 with memo, frames over 33 ms
 * 24.5% → 13.4%). Its props are primitives or stable references on purpose:
 * an object prop created per render would defeat memo (the first version
 * did exactly that). See docs/performance.md.
 */
export default memo(function ProductCard({
  product,
  listSearch,
  headingLevel = 2,
  positionIndex,
  setSize,
  measureRef,
  rowIndex,
}: ProductCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const linkState: FromListState = { listSearch };
  const { id, name, price, stock, imageUrl, rating } = product;

  return (
    <li
      className="product-card"
      ref={measureRef}
      data-index={rowIndex}
      aria-posinset={positionIndex === undefined ? undefined : positionIndex + 1}
      aria-setsize={setSize}
    >
      <img
        className="product-card__image"
        src={imageUrl}
        alt=""
        width={400}
        height={300}
        loading="lazy"
      />
      <div className="product-card__body">
        <Heading className="product-card__name">
          <Link to={`/products/${id}`} state={linkState} className="product-card__link">
            {name}
          </Link>
        </Heading>
        <p className="product-card__price">{formatPrice(price)}</p>
        <StockStatus stock={stock} />
        <p className="product-card__rating">
          <StarIcon className="product-card__star" />
          <span className="visually-hidden">Rated </span>
          {rating.toFixed(1)}
          <span className="visually-hidden"> out of 5</span>
        </p>
      </div>
    </li>
  );
});
