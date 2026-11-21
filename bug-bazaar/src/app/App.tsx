import { Link, Route, Routes } from "react-router-dom";
import ProductDetailRoute from "../features/products/pages/ProductDetailPage.tsx";
import ProductsPage from "../features/products/pages/ProductsPage.tsx";
import NotFoundPage from "./NotFoundPage.tsx";

export default function App() {
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <p className="site-title">
          <Link to="/">
            <span aria-hidden="true">🦆 </span>The Bug Bazaar
          </Link>
        </p>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailRoute />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
