import { Link } from "react-router-dom";
import type { Product } from "../../../types/api.ts";
import { formatPrice } from "../../../utils/formatPrice.ts";
import StockStatus from "./StockStatus.tsx";

type ProductCardProps = {
  product: Product;
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
export default function ProductCard({ product }: ProductCardProps) {
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
        <h3 className="product-card__name">
          <Link to={`/products/${id}`} className="product-card__link">
            {name}
          </Link>
        </h3>
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
