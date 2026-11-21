import { useEffect, useMemo } from "react";

export type Debouncer<Args extends unknown[]> = {
  /** Schedule a call; each new call restarts the wait. */
  call: (...args: Args) => void;
  /** Drop a pending call (e.g. the URL changed from elsewhere). */
  cancel: () => void;
  /** Run a pending call now (e.g. the user pressed Enter). */
  flush: () => void;
  /** Point at the latest callback without restarting the timer. */
  setCallback: (callback: (...args: Args) => void) => void;
};

/** Framework-free debouncer: the timer lives in this closure, not in React. */
export function createDebouncer<Args extends unknown[]>(
  initialCallback: (...args: Args) => void,
  delayMs: number,
): Debouncer<Args> {
  let callback = initialCallback;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Args | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };
  const flush = () => {
    const args = pendingArgs;
    cancel();
    if (args) callback(...args);
  };

  return {
    call: (...args) => {
      if (timer !== null) clearTimeout(timer);
      pendingArgs = args;
      timer = setTimeout(flush, delayMs);
    },
    cancel,
    flush,
    setCallback: (next) => {
      callback = next;
    },
  };
}

/**
 * Debounce a callback inside a component. The returned object is stable
 * across renders, always calls the *latest* callback (never stale props or
 * state), and its timer is cleared on unmount, so nothing runs after the
 * component is gone.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): Omit<Debouncer<Args>, "setCallback"> {
  // Starts with a no-op; the effect below installs the latest callback after
  // every render. Safe because React flushes pending effects before it
  // handles the next user event, which is the only way `call` gets invoked.
  const debouncer = useMemo(() => createDebouncer<Args>(() => undefined, delayMs), [delayMs]);

  useEffect(() => {
    debouncer.setCallback(callback);
  });

  useEffect(() => debouncer.cancel, [debouncer]);

  return debouncer;
}
