import { useRef, type ReactNode } from "react";
import type { RequestState } from "../types/request.ts";
import { ErrorState } from "./states.tsx";

type LoadGateProps<T> = {
  state: RequestState<T>;
  onRetry: () => void;
  /** What's being loaded, used in error copy: "We couldn't load {subject}." */
  subject: string;
  /** Shown while idle or loading (usually a <LoadingState>). */
  loading: ReactNode;
  /** "Empty" is derived from successful data, not stored as a separate status. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  /** Override for specific errors (e.g. 404 → "not found"). Return null for the default. */
  renderError?: (error: Error) => ReactNode;
  /** Render prop: receives data only on success, so it can't render without data. */
  children: (data: T) => ReactNode;
};

/**
 * Maps a RequestState to one of the four UI states: loading, error, empty or
 * success. Every page goes through it, so they all look and behave the same.
 */
export default function LoadGate<T>({
  state,
  onRetry,
  subject,
  loading,
  isEmpty,
  empty,
  renderError,
  children,
}: LoadGateProps<T>) {
  const regionRef = useRef<HTMLDivElement>(null);

  function retry() {
    onRetry();
    // The Try again button is about to disappear. Keep keyboard focus in this
    // region instead of letting it fall back to <body>.
    regionRef.current?.focus();
  }

  let content: ReactNode;
  switch (state.status) {
    case "idle":
    case "loading":
      content = loading;
      break;
    case "error":
      content = renderError?.(state.error) ?? (
        <ErrorState error={state.error} subject={subject} onRetry={retry} />
      );
      break;
    case "success":
      content = isEmpty?.(state.data) ? empty : children(state.data);
      break;
  }

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      className="load-region"
      aria-busy={state.status === "loading" || state.status === "idle"}
    >
      {content}
    </div>
  );
}
