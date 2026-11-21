import type { FallbackProps } from "../components/ErrorBoundary.tsx";

// The app may be served from a subfolder (D4-6), so "home" is the base path.
const homeHref = import.meta.env.BASE_URL;

/**
 * The last-resort fallback (D4-7): something outside any page crashed (the
 * header, the store or router providers). It renders above the router and
 * the store, so it uses nothing from them: a full reload is the way out.
 */
export default function AppCrashed({ reportId }: FallbackProps) {
  return (
    <main className="app">
      <section className="state state--error" aria-labelledby="app-crash-title">
        <span className="state__icon" aria-hidden="true">
          🐞
        </span>
        <h1 id="app-crash-title" className="state__title">
          The Bug Bazaar hit a problem
        </h1>
        <p className="state__description">
          We&apos;ve logged it. Reloading usually fixes it, and your cart is saved.
          {reportId && (
            <>
              {" "}
              Reference: <strong>{reportId}</strong>.
            </>
          )}
        </p>
        <div className="state__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={() => window.location.reload()}
          >
            Reload the page
          </button>
          <a className="button" href={homeHref}>
            Go to the home page
          </a>
        </div>
      </section>
    </main>
  );
}
