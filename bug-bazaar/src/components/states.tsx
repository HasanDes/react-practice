// Shared UI states. Every page shows loading, empty, error and "not found"
// with the same building blocks, so they look and behave consistently (D2-3).

import type { ReactNode } from "react";
import { describeLoadError } from "../utils/describeError.ts";

type StateCardProps = {
  tone: "neutral" | "error";
  icon: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** "alert" for errors (announced immediately); omitted for calm states. */
  role?: "alert";
};

function StateCard({ tone, icon, title, description, actions, role }: StateCardProps) {
  return (
    <div className={`state state--${tone}`} role={role}>
      <span className="state__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="state__title">{title}</p>
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

/** A failed load: friendly copy chosen by error kind, plus Try again. */
export function ErrorState({ error, subject, onRetry }: ErrorStateProps) {
  const { title, description, retryable } = describeLoadError(error, subject);
  return (
    <StateCard
      tone="error"
      icon="⚠️"
      title={title}
      description={description}
      role="alert"
      actions={
        retryable && (
          <button type="button" className="button button--primary" onClick={onRetry}>
            Try again
          </button>
        )
      }
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
