// Shared UI states. Every page shows loading, empty, error and "not found"
// with the same building blocks, so they look and behave consistently (D2-3).

import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { classifyError } from "../errors/appError.ts";
import { describeLoadError } from "../errors/describeError.ts";
import { loginHref } from "../features/auth/returnTo.ts";

type StateCardProps = {
  tone: "neutral" | "error";
  icon: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** "alert" for errors (announced immediately); omitted for calm states. */
  role?: "alert";
  /** Render the title as the page's heading (when the card *is* the page, e.g. Not Found). */
  asHeading?: boolean;
};

function StateCard({ tone, icon, title, description, actions, role, asHeading }: StateCardProps) {
  return (
    <div className={`state state--${tone}`} role={role}>
      <span className="state__icon" aria-hidden="true">
        {icon}
      </span>
      {asHeading ? (
        <h2 className="state__title">{title}</h2>
      ) : (
        <p className="state__title">{title}</p>
      )}
      {description && <p className="state__description">{description}</p>}
      {actions && <div className="state__actions">{actions}</div>}
    </div>
  );
}

type EmptyStateProps = {
  title: string;
  description?: ReactNode;
  /** A way forward, e.g. "Clear filters" or a link back. */
  action?: ReactNode;
  icon?: string;
};

/** Success, but nothing to show. Always offers a way forward when there is one. */
export function EmptyState({ title, description, action, icon = "🔍" }: EmptyStateProps) {
  return (
    <StateCard
      tone="neutral"
      icon={icon}
      title={title}
      description={description}
      actions={action}
    />
  );
}

type ErrorStateProps = {
  error: unknown;
  /** What failed to load, e.g. "products" → "We couldn't load products." */
  subject: string;
  onRetry: () => void;
};

/**
 * A failed load. The error is classified (errors/appError.ts) and the copy
 * comes from one table, so every page words the same failure the same way.
 * "Try again" only when retrying can help (5xx, offline, timeout); "Sign in"
 * when the session ended. The error's own message is never rendered.
 */
export function ErrorState({ error, subject, onRetry }: ErrorStateProps) {
  const location = useLocation();
  const { title, description, retryable, signIn } = describeLoadError(
    classifyError(error),
    subject,
  );
  return (
    <StateCard
      tone="error"
      icon="⚠️"
      title={title}
      description={description}
      role="alert"
      actions={
        (retryable || signIn) && (
          <>
            {retryable && (
              <button type="button" className="button button--primary" onClick={onRetry}>
                Try again
              </button>
            )}
            {signIn && (
              <Link to={loginHref(location)} className="button button--primary">
                Sign in
              </Link>
            )}
          </>
        )
      }
    />
  );
}

type NotFoundStateProps = {
  title: string;
  description: ReactNode;
  /** The way out, e.g. "Back to products". */
  action: ReactNode;
};

/**
 * 404: the thing doesn't exist, so there's nothing to retry. Used by the
 * catch-all route and by pages whose item is missing (product, order), so
 * every Not Found looks the same. The title is the page heading.
 */
export function NotFoundState({ title, description, action }: NotFoundStateProps) {
  return (
    <StateCard
      tone="neutral"
      icon="🦆"
      title={title}
      description={description}
      actions={action}
      asHeading
    />
  );
}

type LoadingStateProps = {
  /** Announced to screen readers, e.g. "Loading products…" */
  label: string;
  variant: "grid" | "detail";
  /** Number of placeholder cards for the grid variant. */
  count?: number;
};

/**
 * Skeletons in the shape of the real content, so the layout doesn't jump
 * when data arrives. They're decorative (aria-hidden); screen readers get the
 * text label through a status region instead.
 */
export function LoadingState({ label, variant, count = 8 }: LoadingStateProps) {
  return (
    <div className="loading">
      <p role="status" className="visually-hidden">
        {label}
      </p>
      {variant === "grid" ? (
        <ul className="product-grid" aria-hidden="true">
          {Array.from({ length: count }, (_, index) => (
            <li key={index} className="product-card skeleton-card">
              <div className="skeleton skeleton--image" />
              <div className="product-card__body">
                <div className="skeleton skeleton--line" />
                <div className="skeleton skeleton--line skeleton--short" />
                <div className="skeleton skeleton--line skeleton--shorter" />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="product-detail__content" aria-hidden="true">
          <div className="skeleton skeleton--image" />
          <div>
            <div className="skeleton skeleton--heading" />
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="skeleton skeleton--line skeleton--shorter" />
          </div>
        </div>
      )}
    </div>
  );
}
