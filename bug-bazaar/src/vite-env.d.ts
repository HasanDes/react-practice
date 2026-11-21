/// <reference types="vite/client" />

// Typed environment variables (see .env.example). All values arrive as strings.
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_USE_MOCK_API?: "true" | "false";
  readonly VITE_MOCK_LATENCY_MS?: string;
  readonly VITE_STOCK_FEED_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
