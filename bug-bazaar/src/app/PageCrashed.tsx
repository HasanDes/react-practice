import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import type { FallbackProps } from "../components/ErrorBoundary.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";

/**
 * The fallback when a page crashes while rendering (D4-7). It replaces only
 * the page: the header, account and cart links stay, so the user can carry
 * on. Navigating anywhere resets the boundary (App passes the path as its
 * resetKey). The error's own text is never shown (D3-4); the reference ties
 * a user's report to the logged one.
 *
 * Focus moves to the heading: whatever had focus (often the button that
 * triggered the crash) is gone, and this tells screen reader users why.
 */
export default function PageCrashed({ reportId, reset }: FallbackProps) {
  useDocumentTitle("Something went wrong");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section className="state state--error" aria-labelledby="crash-title">
      <span className="state__icon" aria-hidden="true">
        🐞
      </span>
      <h1 id="crash-title" className="state__title" tabIndex={-1} ref={heading}>
        Something went wrong on this page
      </h1>
      <p className="state__description">
        It wasn&apos;t anything you did, and your cart is safe. We&apos;ve logged the problem.
        {reportId && (
          <>
            {" "}
            If you contact us, quote reference <strong>{reportId}</strong>.
          </>
        )}
      </p>
      <div className="state__actions">
        <button type="button" className="button button--primary" onClick={reset}>
          Try again
        </button>
        {/* Also resets when already on "/": same path, so resetKey wouldn't change. */}
        <Link to="/" className="button" onClick={reset}>
          Back to products
        </Link>
      </div>
    </section>
  );
}
