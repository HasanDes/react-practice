// @vitest-environment jsdom
// D2-4 "Done when": switching products quickly never shows the wrong one, and
// nothing keeps running after the page closes.

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../app/App.tsx";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";

const server = setupServer();
let db: MockDb;
/** Every product request's abort signal, by product id (in request order). */
let productSignals: Record<string, AbortSignal[]>;
/** Per-product response delay: lets tests force slow, out-of-order responses. */
let productDelays: Record<string, number>;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  productSignals = {};
  productDelays = {};
  server.resetHandlers(
    http.get<{ id: string }>("*/api/products/:id", async ({ params, request }) => {
      (productSignals[params.id] ??= []).push(request.signal);
      await delay(productDelays[params.id] ?? 0);
      const product = db.getProduct(params.id);
      return product ? HttpResponse.json(product) : new HttpResponse(null, { status: 404 });
    }),
    ...createHandlers({ db, controls: createControls({ storage }) }),
  );
});
afterEach(() => vi.restoreAllMocks());

/** Test-only navigation, standing in for clicking links quickly. */
function TestNav() {
  const navigate = useNavigate();
  return (
    <nav aria-label="test navigation">
      {["p-0001", "p-0002", "p-0003"].map((id) => (
        <button key={id} type="button" onClick={() => navigate(`/products/${id}`)}>
          go {id}
        </button>
      ))}
      <button type="button" onClick={() => navigate("/")}>
        go home
      </button>
    </nav>
  );
}

function renderAt(path: string) {
  const user = userEvent.setup();
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <TestNav />
    </MemoryRouter>,
  );
  return { user, ...view };
}

const nameOf = (id: string) => db.getProduct(id)?.name ?? "";

/** Record every product name that is ever rendered as the page heading. */
function recordHeadings() {
  const seen = new Set<string>();
  const record = () => {
    document.querySelectorAll("h2.page-heading").forEach((heading) => {
      if (heading.textContent) seen.add(heading.textContent);
    });
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return {
    seen,
    stop: () => observer.disconnect(),
  };
}

describe("switching products quickly", () => {
  it("a slow response for the previous product never replaces the current one", async () => {
    productDelays = { "p-0001": 300, "p-0002": 20 };
    const headings = recordHeadings();
    const { user } = renderAt("/products/p-0001");

    // Leave p-0001 before its (slow) response arrives.
    await user.click(screen.getByRole("button", { name: "go p-0002" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: nameOf("p-0002") }),
    ).toBeInTheDocument();

    // Wait past p-0001's delay: its late response must not show up.
    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    expect(screen.getByRole("heading", { level: 2, name: nameOf("p-0002") })).toBeInTheDocument();
    headings.stop();

    expect(headings.seen.has(nameOf("p-0001"))).toBe(false); // never shown, not even briefly
    expect(productSignals["p-0001"]?.every((signal) => signal.aborted)).toBe(true); // actually cancelled
  });

  it("a burst of switches (A → C → B) ends on B, with A and C cancelled", async () => {
    productDelays = { "p-0001": 300, "p-0003": 150, "p-0002": 10 };
    const headings = recordHeadings();
    const { user } = renderAt("/products/p-0001");

    await user.click(screen.getByRole("button", { name: "go p-0003" }));
    await user.click(screen.getByRole("button", { name: "go p-0002" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: nameOf("p-0002") }),
    ).toBeInTheDocument();

    await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
    headings.stop();

    expect([...headings.seen].filter((name) => name !== nameOf("p-0002"))).toEqual([]);
    expect(productSignals["p-0001"]?.every((signal) => signal.aborted)).toBe(true);
    expect(productSignals["p-0003"]?.every((signal) => signal.aborted)).toBe(true);
    expect(productSignals["p-0002"]?.some((signal) => !signal.aborted)).toBe(true);
  });

  it("also cancels the previous product's related-products request", async () => {
    const relatedSignals: AbortSignal[] = [];
    server.use(
      http.get("*/api/products", async ({ request }) => {
        relatedSignals.push(request.signal);
        await delay(300);
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    const { user } = renderAt("/products/p-0001");
    await screen.findByRole("heading", { level: 2, name: nameOf("p-0001") });
    expect(relatedSignals.length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "go p-0002" }));
    await screen.findByRole("heading", { level: 2, name: nameOf("p-0002") });
    expect(relatedSignals[0]?.aborted).toBe(true);
  });
});

describe("nothing keeps running after the page closes", () => {
  it("removes every scroll listener and cancels a pending animation frame", async () => {
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    // Frames never fire on their own here, so one is guaranteed to be pending.
    const PENDING_FRAME = 4242;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => PENDING_FRAME);
    const cancelFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => undefined);

    const { user } = renderAt("/products/p-0001");
    await screen.findByRole("heading", { level: 2, name: nameOf("p-0001") });

    const scrollHandlersOf = (spy: typeof added | typeof removed) =>
      spy.mock.calls.filter(([type]) => type === "scroll").map(([, handler]) => handler);
    // Exactly the listeners added while the details page was open.
    const detailHandlers = scrollHandlersOf(added);
    expect(detailHandlers.length).toBeGreaterThan(0); // Back to Top is listening

    window.dispatchEvent(new Event("scroll")); // schedules a frame...
    await user.click(screen.getByRole("button", { name: "go home" })); // ...then leave
    await screen.findByRole("heading", { name: "Products" });

    const removedHandlers = scrollHandlersOf(removed);
    for (const handler of detailHandlers) expect(removedHandlers).toContain(handler);
    expect(cancelFrame).toHaveBeenCalledWith(PENDING_FRAME);
  });

  it("aborts an in-flight product request when leaving the page", async () => {
    productDelays = { "p-0001": 300 };
    const { user } = renderAt("/products/p-0001");
    await user.click(screen.getByRole("button", { name: "go home" }));
    expect(productSignals["p-0001"]?.every((signal) => signal.aborted)).toBe(true);
  });

  it("restores the document title on unmount", async () => {
    document.title = "Before";
    const { unmount } = renderAt("/products/p-0001");
    await screen.findByRole("heading", { level: 2, name: nameOf("p-0001") });
    expect(document.title).toBe(`${nameOf("p-0001")} · The Bug Bazaar`);

    unmount();
    expect(document.title).toBe("Before");
  });
});

describe("Back to Top", () => {
  function scrollTo(y: number) {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    window.dispatchEvent(new Event("scroll"));
  }

  it("appears after scrolling, scrolls up and moves focus to the main content", async () => {
    const scrollToSpy = vi.fn();
    vi.stubGlobal("scrollTo", scrollToSpy);
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query }));

    const { user } = renderAt("/products/p-0001");
    await screen.findByRole("heading", { level: 2, name: nameOf("p-0001") });
    expect(screen.queryByRole("button", { name: /back to top/i })).not.toBeInTheDocument();

    scrollTo(800);
    const button = await screen.findByRole("button", { name: /back to top/i });
    await user.click(button);

    expect(scrollToSpy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    expect(document.getElementById("main")).toHaveFocus();

    scrollTo(0);
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
    expect(screen.queryByRole("button", { name: /back to top/i })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
