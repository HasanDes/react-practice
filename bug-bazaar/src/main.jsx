import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.jsx";
import "./styles/global.css";

/**
 * Start the mock backend before the first render, so the app's very first
 * request is already intercepted. It's on by default (dev and production
 * builds) because there is no real backend. Set VITE_USE_MOCK_API=false to
 * call a real API at VITE_API_BASE_URL instead. The dynamic import keeps
 * all mock code out of the main bundle when it's off.
 */
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCK_API === "false") return;
  const { startMockApi } = await import("./mocks/browser.js");
  await startMockApi();
}

enableMocking().then(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
});
