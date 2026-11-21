import type { ReactNode } from "react";
import type { RequestState } from "../types/request.ts";

type LoadGateProps<T> = {
  state: RequestState<T>;
  onRetry: () => void;
  /** Render prop: receives data only in the success state, so it can't render without data. */
  children: (data: T) => ReactNode;
};

export default function LoadGate<T>({ state, onRetry, children }: LoadGateProps<T>) {
  switch (state.status) {
    case "idle":
    case "loading":
      return <p role="status">Loading bugs...</p>;
    case "error":
      return (
        <div role="alert" className="error-box">
          <p>Could not load bugs: {state.error.message}</p>
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
    case "success":
      return <>{children(state.data)}</>;
  }
}
