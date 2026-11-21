// @vitest-environment jsdom
// D2-5: the custom hooks tested directly, independent of any page.

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../api/index.ts";
import { createDebouncer, useDebouncedCallback } from "./useDebouncedCallback.ts";
import { useDocumentTitle } from "./useDocumentTitle.ts";
import { useRequest } from "./useRequest.ts";
import { useScrolledPast } from "./useScrolledPast.ts";

/** A promise the test resolves or rejects by hand: it controls response timing and order. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Run `fn` inside act() and let pending promise callbacks (and React updates) settle. */
async function settle(fn?: () => void) {
  await act(async () => {
    fn?.();
    await Promise.resolve();
  });
}

describe("useRequest", () => {
  it("starts loading, then resolves to success with the data", async () => {
    const response = deferred<string>();
    const { result } = renderHook(() => useRequest("a", () => response.promise));
    expect(result.current.state).toEqual({ status: "loading" });

    await settle(() => response.resolve("data"));
    expect(result.current.state).toEqual({ status: "success", data: "data" });
  });

  it("with a null key it stays idle and never fetches", () => {
    const fetcher = vi.fn(() => Promise.resolve(1));
    const { result } = renderHook(() => useRequest(null, fetcher));
    expect(result.current.state).toEqual({ status: "idle" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("a new key aborts the old request, resets to loading at once, and ignores the stale answer", async () => {
    const responses: Record<string, ReturnType<typeof deferred<string>>> = {
      a: deferred(),
      b: deferred(),
    };
    const signals: Record<string, AbortSignal> = {};
    const { result, rerender } = renderHook(
      ({ id }: { id: "a" | "b" }) =>
        useRequest(id, (signal) => {
          signals[id] = signal;
          return responses[id]?.promise ?? Promise.reject(new Error("unknown"));
        }),
      { initialProps: { id: "a" } },
    );

    rerender({ id: "b" });
    expect(result.current.state).toEqual({ status: "loading" }); // same render: no stale frame
    expect(signals["a"]?.aborted).toBe(true);

    await settle(() => responses["b"]?.resolve("B"));
    await settle(() => responses["a"]?.resolve("A (late)"));
    expect(result.current.state).toEqual({ status: "success", data: "B" });
  });

  it("turns a failure into an error state carrying the Error", async () => {
    const failure = new Error("boom");
    const { result } = renderHook(() => useRequest("x", () => Promise.reject(failure)));
    await settle();
    expect(result.current.state).toEqual({ status: "error", error: failure });
  });

  it("retry goes back to loading and fetches again", async () => {
    const fetcher = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockRejectedValueOnce(new Error("first try fails"))
      .mockResolvedValueOnce("second try works");
    const { result } = renderHook(() => useRequest("k", fetcher));
    await settle();
    expect(result.current.state.status).toBe("error");

    act(() => result.current.retry());
    expect(result.current.state).toEqual({ status: "loading" });
    await settle();
    expect(result.current.state).toEqual({ status: "success", data: "second try works" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("ignores aborted requests: no error state for a cancellation", async () => {
    const aborted = new ApiRequestError({
      kind: "aborted",
      message: "cancelled",
      method: "GET",
      path: "/x",
    });
    const { result } = renderHook(() => useRequest("k", () => Promise.reject(aborted)));
    await settle();
    expect(result.current.state).toEqual({ status: "loading" });
  });

  it("aborts the in-flight request on unmount", () => {
    let captured: AbortSignal | undefined;
    const { unmount } = renderHook(() =>
      useRequest("k", (signal) => {
        captured = signal;
        return new Promise<never>(() => undefined);
      }),
    );
    unmount();
    expect(captured?.aborted).toBe(true);
  });

  it("calls the latest fetcher (no stale closure) on retry", async () => {
    const { result, rerender } = renderHook(
      ({ value }: { value: string }) => useRequest("same-key", () => Promise.resolve(value)),
      { initialProps: { value: "old" } },
    );
    await settle();
    rerender({ value: "new" });
    act(() => result.current.retry());
    await settle();
    expect(result.current.state).toEqual({ status: "success", data: "new" });
  });
});

describe("createDebouncer / useDebouncedCallback", () => {
  afterEach(() => vi.useRealTimers());

  it("runs once, after the pause, with the latest arguments", () => {
    vi.useFakeTimers();
    const spy = vi.fn<(value: string) => void>();
    const debouncer = createDebouncer(spy, 300);
    debouncer.call("d");
    debouncer.call("du");
    vi.advanceTimersByTime(299);
    debouncer.call("duck");
    vi.advanceTimersByTime(299);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledExactlyOnceWith("duck");
  });

  it("cancel drops a pending call; flush runs it now", () => {
    vi.useFakeTimers();
    const spy = vi.fn<(value: number) => void>();
    const debouncer = createDebouncer(spy, 300);
    debouncer.call(1);
    debouncer.cancel();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();

    debouncer.call(2);
    debouncer.flush();
    expect(spy).toHaveBeenCalledExactlyOnceWith(2);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(1); // no second run after flush
  });

  it("the hook keeps a stable identity and always calls the latest callback", () => {
    vi.useFakeTimers();
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ callback }: { callback: () => void }) => useDebouncedCallback(callback, 300),
      { initialProps: { callback: first } },
    );
    const initial = result.current;
    result.current.call();
    rerender({ callback: second }); // e.g. new props before the timer fires
    vi.advanceTimersByTime(300);

    expect(result.current).toBe(initial);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending call on unmount, so nothing runs after the component is gone", () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 300));
    result.current.call();
    unmount();
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("useDocumentTitle", () => {
  it("sets the title with the site name, updates it, and restores it on unmount", () => {
    document.title = "Original";
    const { rerender, unmount } = renderHook(({ title }) => useDocumentTitle(title), {
      initialProps: { title: "Ducks" },
    });
    expect(document.title).toBe("Ducks · The Bug Bazaar");
    rerender({ title: "Coffee" });
    expect(document.title).toBe("Coffee · The Bug Bazaar");
    unmount();
    expect(document.title).toBe("Original");
  });

  it("null leaves the current title alone (e.g. while loading)", () => {
    document.title = "Keep me";
    renderHook(() => useDocumentTitle(null));
    expect(document.title).toBe("Keep me");
  });
});

describe("useScrolledPast", () => {
  it("flips only when crossing the threshold, at most once per frame", async () => {
    const setScroll = (y: number) => {
      Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
      window.dispatchEvent(new Event("scroll"));
    };
    const nextFrame = () =>
      act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

    setScroll(0);
    const { result } = renderHook(() => useScrolledPast(300));
    expect(result.current).toBe(false);

    setScroll(250);
    await nextFrame();
    expect(result.current).toBe(false);

    setScroll(301);
    await nextFrame();
    expect(result.current).toBe(true);
  });
});
