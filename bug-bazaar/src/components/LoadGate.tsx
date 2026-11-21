import type { ReactNode } from "react";
import type { RequestState } from "../types/request.ts";

type LoadGateProps<T> = {
  state: RequestState<T>;
  onRetry: () => void;
  /** e.g. "Loading products…" */
  loadingText: string;
  /** Friendly, user-facing copy. Raw error messages never reach the screen. */
  errorText: string;
  /** Render prop: receives data only in the success state, so it can't render without data. */
  children: (data: T) => ReactNode;
};

export default function LoadGate<T>({
  state,
  onRetry,
  loadingText,
  errorText,
  children,
}: LoadGateProps<T>) {
  switch (state.status) {
    case "idle":
    case "loading":
      return (
        <p role="status" className="state state--loading">
          {loadingText}
        </p>
      );
    case "error":
      return (
        <div role="alert" className="state state--error">
          <p>{errorText}</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      );
    case "success":
      return <>{children(state.data)}</>;
  }
}
