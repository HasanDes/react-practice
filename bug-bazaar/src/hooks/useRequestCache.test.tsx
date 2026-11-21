// @vitest-environment jsdom
// useRequest with the cache (D3-5): fresh data is reused without a request,
// stale data shows at once and refreshes in the background.

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryCache } from "../cache/queryCache.ts";
import { useRequest } from "./useRequest.ts";

function setup() {
  const clock = { now: 0 };
  return { clock, cache: createQueryCache({ now: () => clock.now }) };
}

describe("useRequest with a staleTime", () => {
  it("fresh cached data: shown on the first render, and no request", () => {
    const { cache } = setup();
    cache.set("k", "cached");
    const fetcher = vi.fn(() => Promise.resolve("network"));

    const { result } = renderHook(() => useRequest("k", fetcher, { staleTime: 1000, cache }));
    expect(result.current.state).toEqual({ status: "success", data: "cached" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stale cached data: shown at once (no loading), then replaced by the refetch", async () => {
    const { clock, cache } = setup();
    cache.set("k", "old");
    clock.now = 5000;
    const fetcher = vi.fn(() => Promise.resolve("new"));

    const { result } = renderHook(() => useRequest("k", fetcher, { staleTime: 1000, cache }));
    expect(result.current.state).toEqual({ status: "success", data: "old" });
    await waitFor(() => expect(result.current.state).toEqual({ status: "success", data: "new" }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cache.get("k")).toEqual({ data: "new", updatedAt: 5000 });
  });

  it("a failed background refresh keeps the cached data instead of showing an error", async () => {
    const { clock, cache } = setup();
    cache.set("k", "old");
    clock.now = 5000;
    let fail: (error: Error) => void = () => undefined;
    const fetcher = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          fail = reject;
        }),
    );

    const { result } = renderHook(() => useRequest("k", fetcher, { staleTime: 1000, cache }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    fail(new Error("offline"));
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.state).toEqual({ status: "success", data: "old" });
  });

  it("nothing cached: loading, then the result is stored for next time", async () => {
    const { cache } = setup();
    const { result } = renderHook(() =>
      useRequest("k", () => Promise.resolve("network"), { staleTime: 1000, cache }),
    );
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("success"));
    expect(cache.get("k")?.data).toBe("network");
  });

  it("switching to a cached key shows that key's data at once, never the previous key's", () => {
    const { cache } = setup();
    cache.set("b", "B");
    const { result, rerender } = renderHook(
      ({ key }) =>
        useRequest(key, () => new Promise<string>(() => undefined), { staleTime: 1000, cache }),
      { initialProps: { key: "a" } },
    );
    expect(result.current.state.status).toBe("loading");
    rerender({ key: "b" });
    expect(result.current.state).toEqual({ status: "success", data: "B" });
  });

  it("without a staleTime the cache is neither read nor written", async () => {
    const { cache } = setup();
    cache.set("k", "cached");
    const { result } = renderHook(() =>
      useRequest("k", () => Promise.resolve("network"), { cache }),
    );
    expect(result.current.state.status).toBe("loading");
    await waitFor(() =>
      expect(result.current.state).toEqual({ status: "success", data: "network" }),
    );
    expect(cache.get("k")?.data).toBe("cached");
  });
});
