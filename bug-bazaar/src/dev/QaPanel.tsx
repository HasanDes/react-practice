// QA panel: one click to put the current page into any UI state (D2-3:
// "each state can be triggered on purpose"). Talks to the mock only through
// the global window.bazaarMock console API, so it never imports mock code.
// Rendered only while the mock API is on, and lazy-loaded (separate chunk).
//
// Errors are *persistent* until "Stop errors", not one-shot: in development,
// React StrictMode mounts effects twice, and the first (discarded) request
// would use up a one-shot failure. The Service Worker doesn't forward aborts
// to the mock, so it can't tell that request was cancelled.

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SLOW_MS = 4000;

export default function QaPanel() {
  const location = useLocation();
  const navigate = useNavigate();
  const mock = window.bazaarMock;
  // Re-render after "Stop errors" (which doesn't reload) so the summary updates.
  const [, setVersion] = useState(0);
  if (!mock) return null;

  // Which request the current page makes, so errors hit the right endpoint.
  const route = location.pathname.startsWith("/products/") ? "products:get" : "products:list";
  const status = mock.status();
  const activeErrors = Object.entries(status.failures).map(
    ([name, failure]) => `${name} → ${String(failure.status)}`,
  );
  const reload = () => window.location.reload();

  return (
    <details className="qa-panel">
      <summary>
        QA: trigger states
        {status.latencyMs >= SLOW_MS ? " · slow" : ""}
        {activeErrors.length > 0 ? " · errors on" : ""}
        {status.raceStepMs > 0 ? " · race" : ""}
      </summary>
      <p className="qa-panel__hint">
        This page calls <code>{route}</code>.
        {activeErrors.length > 0 && <> Forcing: {activeErrors.join(", ")}.</>}
      </p>
      <div className="qa-panel__actions">
        <button
          type="button"
          onClick={() => {
            mock.latency(SLOW_MS, 0);
            reload();
          }}
        >
          Loading (slow {SLOW_MS / 1000}s)
        </button>
        <button
          type="button"
          onClick={() => {
            mock.fail(route, 500);
            reload();
          }}
        >
          Server error (500)
        </button>
        <button
          type="button"
          onClick={() => {
            mock.fail(route, "network");
            reload();
          }}
        >
          Offline (network error)
        </button>
        <button
          type="button"
          onClick={() => {
            mock.clear();
            setVersion((version) => version + 1);
          }}
        >
          Stop errors (then press Try again)
        </button>
        <button
          type="button"
          aria-pressed={status.raceStepMs > 0}
          onClick={() => {
            // Shorter (older) searches answer slower, so responses arrive out of order (D2-6).
            mock.race(status.raceStepMs > 0 ? 0 : 400);
            setVersion((version) => version + 1);
          }}
        >
          Race mode: {status.raceStepMs > 0 ? "on" : "off"} (out-of-order search)
        </button>
        <button type="button" onClick={() => navigate("/?search=no-such-product")}>
          Empty results
        </button>
        <button type="button" onClick={() => navigate("/products/p-9999")}>
          Not found (404)
        </button>
        {/* The token stops working; going to the account page makes the
            signed-in request that gets the 401 (D3-3). */}
        <button
          type="button"
          onClick={() => {
            mock.expireSessions();
            // Already there: reload, and the startup token check gets the 401.
            if (location.pathname === "/account") reload();
            else navigate("/account");
          }}
        >
          Expire session (401)
        </button>
        <button
          type="button"
          onClick={() => {
            mock.clear();
            mock.race(0);
            mock.latency(Number(import.meta.env.VITE_MOCK_LATENCY_MS ?? 300));
            reload();
          }}
        >
          Reset everything
        </button>
      </div>
    </details>
  );
}
