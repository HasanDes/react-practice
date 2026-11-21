import { lazy, Suspense } from "react";
import { Link, Route, Routes } from "react-router-dom";
import AccountLink from "../features/auth/components/AccountLink.tsx";
import RequireAuth from "../features/auth/components/RequireAuth.tsx";
import AccountPage from "../features/auth/pages/AccountPage.tsx";
import LoginPage from "../features/auth/pages/LoginPage.tsx";
import CartLink from "../features/cart/components/CartLink.tsx";
import CartPage from "../features/cart/pages/CartPage.tsx";
import CheckoutPage from "../features/orders/pages/CheckoutPage.tsx";
import OrderConfirmationPage from "../features/orders/pages/OrderConfirmationPage.tsx";
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
        <nav aria-label="Main" className="site-nav">
          <AccountLink />
          <CartLink />
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetailRoute />} />
          <Route path="/cart" element={<CartPage />} />
          <Route
            path="/checkout"
            element={
              <RequireAuth>
                <CheckoutPage />
              </RequireAuth>
            }
          />
          <Route path="/orders/:id" element={<OrderConfirmationPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
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
