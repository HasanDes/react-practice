import { Link } from "react-router-dom";
import type { Product } from "../../../types/api.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import type { FromListState } from "../navigation.ts";
import StockStatus from "./StockStatus.tsx";

type ProductCardProps = {
  /** Card titles sit one level below the section heading: 2 in the main list (under the page's h1), 3 in Related (under its h2). */
  headingLevel?: 2 | 3;
  product: Product;
  listSearch: string;
};

/**
 * Keyboard and screen reader design:
 * - One Tab stop per card: only the name is a link. A CSS "stretched link"
 *   (::after covering the card) makes the whole card clickable for mouse users.
 * - The link's accessible name is just the product name, not the whole card's
 *   text, so tabbing through 24 cards isn't a wall of noise. Price and stock
 *   are read as normal content around it.
 * - The image is decorative (a category illustration next to the name), so alt="".
 */
export default function ProductCard({ product, listSearch, headingLevel = 2 }: ProductCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const linkState: FromListState = { listSearch };
  const { id, name, price, stock, imageUrl, rating } = product;

  return (
    <li className="product-card">
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
          <span aria-hidden="true">★ </span>
          <span className="visually-hidden">Rated </span>
          {rating.toFixed(1)}
          <span className="visually-hidden"> out of 5</span>
        </p>
      </div>
    </li>
  );
}
