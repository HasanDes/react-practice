import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.tsx";
import { loadCart, persistCart } from "./features/cart/cartStorage.ts";
import { connectApiToStore } from "./store/connectApi.ts";
import { makeStore } from "./store/store.ts";
import "./styles/global.css";

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

// The saved cart (validated) is the starting state; every change is saved again.
const savedCart = loadCart();
const store = makeStore(savedCart ? { cart: savedCart } : undefined);
persistCart(store);

// The data layer reads the token from the session; a 401 ends the session.
connectApiToStore(store);

function renderApp(): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("index.html is missing the #root element");

  ReactDOM.createRoot(container).render(
    <React.StrictMode>
      <Provider store={store}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </Provider>
    </React.StrictMode>,
  );
}

// If the mock fails to start, still render: requests then fail visibly
// through the app's error states instead of leaving a blank page.
void enableMocking()
  .catch((error: unknown) => {
    console.error("[mock] Failed to start the mock API.", error);
  })
  .finally(renderApp);
