import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "../api/index.ts";
import { requestState, type RequestState } from "../types/request.ts";
import { toError } from "../utils/toError.ts";

export type UseRequestResult<T> = {
  state: RequestState<T>;
  /** Run the same request again (e.g. from an error state's Try again). */
  retry: () => void;
};

/**
 * Load data for a component, with the lifecycle every page needs:
 *
 * - `key` identifies the request. When it changes, the previous request is
 *   aborted and the state resets to loading right away, so stale data never
 *   shows (D2-4, D2-6). Pass `null` to skip fetching (state stays idle).
 * - `fetcher` gets an AbortSignal and returns a promise. It must only depend
 *   on values encoded in `key`, the same contract as SWR / TanStack Query keys.
 * - Aborted requests are ignored: no state update, no error shown.
 * - Unmounting aborts the in-flight request, so nothing keeps running.
 *
 * Replaces the fetch/abort/retry effect that was copied into the product
 * list, the details page and related products.
 */
export function useRequest<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): UseRequestResult<T> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RequestState<T>>(() =>
    key === null ? requestState.idle() : requestState.loading(),
  );

  // New key → reset during render (React's "adjust state when a prop changes"
  // pattern), so there's no frame showing the previous key's data.
  const [trackedKey, setTrackedKey] = useState(key);
  if (key !== trackedKey) {
    setTrackedKey(key);
    setState(key === null ? requestState.idle() : requestState.loading());
  }

  // Always call the latest fetcher without re-running the effect when only
  // its identity changes (a new closure every render). Declared before the
  // fetch effect, so it's updated first.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) return;
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState(requestState.success(data));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        setState(requestState.error(toError(error)));
      });

    return () => controller.abort();
  }, [key, attempt]);

  const retry = useCallback(() => {
    setState(requestState.loading());
    setAttempt((current) => current + 1);
  }, []);

  return { state, retry };
}
