import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import { apiWebSocketUrl } from "./api/index.ts";
import App from "./app/App.tsx";
import AppCrashed from "./app/AppCrashed.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import { crashTest } from "./dev/crashTest.ts";
import { loadSession, persistSession, verifySession } from "./features/auth/sessionStorage.ts";
import { loadCart, persistCart } from "./features/cart/cartStorage.ts";
import { LiveStockContext, startLiveStock } from "./features/stock/liveStock.tsx";
import { connectApiToStore } from "./store/connectApi.ts";
import { makeStore } from "./store/store.ts";
import { exposeMonitoringConsole } from "./monitoring/console.ts";
import { installGlobalErrorHandlers } from "./monitoring/globalHandlers.ts";
import { monitor } from "./monitoring/monitor.ts";
import "./styles/global.css";

// D4-7: log errors from the very start, before anything else can throw.
// Render errors are caught by the error boundaries below; these handlers
// catch the rest (event handlers, timers, unhandled promise rejections).
installGlobalErrorHandlers(monitor);
const mockEnabled = import.meta.env.VITE_USE_MOCK_API !== "false";
exposeMonitoringConsole(monitor, mockEnabled ? { crashPage: crashTest.arm } : {});

/**
 * Start the mock backend before the first render, so the app's very first
 * request is already intercepted. It's on by default (dev and production
 * builds) because there is no real backend. Set VITE_USE_MOCK_API=false to
 * call a real API at VITE_API_BASE_URL instead. The dynamic import keeps
 * all mock code out of the main bundle when it's off.
 */
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_USE_MOCK_API === "false") return;
  const { startMockApi } = await import("./mocks/browser.ts");
  await startMockApi();
}

// The saved cart and session (both validated) are the starting state; every
// change is saved again. The cart lives in localStorage, the session in
// sessionStorage (docs/auth.md explains why).
const savedCart = loadCart();
const savedSession = loadSession();
const store = makeStore({
  ...(savedCart ? { cart: savedCart } : {}),
  ...(savedSession ? { session: savedSession } : {}),
});
persistCart(store);
persistSession(store);

// The data layer reads the token from the session; a 401 ends the session.
connectApiToStore(store);

// Live stock (D4-4): connects only while products are on screen.
const liveStock = startLiveStock(store, { url: apiWebSocketUrl("/stock") });

function renderApp(): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("index.html is missing the #root element");

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      {/* Last resort (D4-7): anything outside a page that throws (header,
          providers) shows a reload screen instead of a blank page. Pages
          have their own boundary inside App, which keeps the header. */}
      <ErrorBoundary fallback={(props) => <AppCrashed {...props} />}>
        <Provider store={store}>
          <LiveStockContext.Provider value={liveStock.registry}>
            {/* basename: the app can be served from a subfolder (D4-6 deploy). */}
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <App />
            </BrowserRouter>
          </LiveStockContext.Provider>
        </Provider>
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

// If the mock fails to start, still render: requests then fail visibly
// through the app's error states instead of leaving a blank page.
void enableMocking()
  .catch((error: unknown) => {
    console.error("[mock] Failed to start the mock API.", error);
  })
  .finally(() => {
    renderApp();
    // Now that the mock is up, check a restored token. A 401 ends the session.
    void verifySession(store);
  });
