type StockStatusProps = {
  stock: number;
};

export const LOW_STOCK_THRESHOLD = 5;

/** Stock as words, not just color, so it reads the same to everyone (WCAG 1.4.1). */
export default function StockStatus({ stock }: StockStatusProps) {
  if (stock <= 0) {
    return <p className="stock stock--out">Sold out</p>;
  }
  if (stock <= LOW_STOCK_THRESHOLD) {
    return <p className="stock stock--low">Only {stock} left</p>;
  }
  return <p className="stock stock--in">In stock ({stock})</p>;
}
