import { useCallback, useEffect, useRef, useState } from "react";
import { isAbortError } from "../api/index.ts";
import { queryCache as appCache, type QueryCache } from "../cache/queryCache.ts";
import { requestState, type RequestState } from "../types/request.ts";
import { toError } from "../utils/toError.ts";

export type UseRequestResult<T> = {
  state: RequestState<T>;
  /** Run the same request again (e.g. from an error state's Try again). */
  retry: () => void;
};

export type UseRequestOptions = {
  /**
   * Opt in to the cache (D3-5). Cached data younger than this (ms) is used
   * as is, with no request. Older cached data is shown at once and refetched
   * in the background (stale-while-revalidate). Omit it for data that must
   * always come fresh from the server (orders, the signed-in user).
   */
  staleTime?: number;
  /** For tests: a cache with a controllable clock. */
  cache?: QueryCache;
};

/**
 * Load data for a component, with the lifecycle every page needs:
 *
 * - `key` identifies the request. When it changes, the previous request is
 *   aborted and the state resets right away (to loading, or to cached data
 *   for the new key), so the previous key's data never shows (D2-4, D2-6).
 *   Pass `null` to skip fetching (state stays idle).
 * - `fetcher` gets an AbortSignal and returns a promise. It must only depend
 *   on values encoded in `key`, the same contract as SWR / TanStack Query keys.
 * - Aborted requests are ignored: no state update, no error shown.
 * - Unmounting aborts the in-flight request, so nothing keeps running.
 * - With `staleTime`, results are cached by key, and revisiting reuses them.
 */
export function useRequest<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  { staleTime, cache = appCache }: UseRequestOptions = {},
): UseRequestResult<T> {
  const cacheEnabled = staleTime !== undefined;

  /** What to show the moment `key` becomes current: cached data if we have it. */
  function initialState(forKey: string | null): RequestState<T> {
    if (forKey === null) return requestState.idle();
    const entry = cacheEnabled ? cache.get<T>(forKey) : undefined;
    return entry ? requestState.success(entry.data) : requestState.loading();
  }

  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RequestState<T>>(() => initialState(key));

  // New key → reset during render (React's "adjust state when a prop changes"
  // pattern), so there's no frame showing the previous key's data.
  const [trackedKey, setTrackedKey] = useState(key);
  if (key !== trackedKey) {
    setTrackedKey(key);
    setState(initialState(key));
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
    const cached = staleTime === undefined ? undefined : cache.get<T>(key);
    // Fresh enough: the data on screen is the answer. No request at all.
    if (cached && staleTime !== undefined && cache.isFresh(cached, staleTime)) return;

    const controller = new AbortController();
    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (staleTime !== undefined) cache.set(key, data);
        setState(requestState.success(data));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isAbortError(error)) return;
        // A background refresh failed: keep showing the cached data rather
        // than replacing a working page with an error. The next visit retries.
        if (cached) return;
        setState(requestState.error(toError(error)));
      });

    return () => controller.abort();
  }, [key, attempt, staleTime, cache]);

  const retry = useCallback(() => {
    setState(requestState.loading());
    setAttempt((current) => current + 1);
  }, []);

  return { state, retry };
}
