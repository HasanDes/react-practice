import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import ProductDetailRoute from "../features/products/pages/ProductDetailPage.tsx";
import ProductsPage from "../features/products/pages/ProductsPage.tsx";
import NotFoundPage from "./NotFoundPage.tsx";

// QA tool for the mock API: its own chunk, loaded only while mocking is on.
const QaPanel = lazy(() => import("../dev/QaPanel.tsx"));
const mockEnabled = import.meta.env.VITE_USE_MOCK_API !== "false";

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
      {mockEnabled && (
        <Suspense fallback={null}>
          <QaPanel />
        </Suspense>
      )}
    </div>
  );
}
