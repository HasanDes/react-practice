# Performance

This page records how the product list was measured, what was slow, what changed, and the numbers before and after each change. D4-2 covers measuring the list and fixing its two slowest spots. D4-3 (memoization and virtualization) adds to it.

## How it's measured

**Tool:** `scripts/perf-trace.mjs` (`npm run perf`) records a Chrome performance trace of a **cold first visit to the product list** (`/`):

| Setting      | Value                                           | Why                                                                                                                                     |
| ------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Browser      | Headless Chrome or Edge, fresh profile each run | No cache, no Service Worker yet: a real first visit                                                                                     |
| Cache        | Disabled                                        | Every byte is fetched                                                                                                                   |
| CPU          | 4× slower (DevTools throttling)                 | Roughly a mid-range phone; makes small costs visible                                                                                    |
| Mock latency | 0 ms (or 1000 ms where stated)                  | 0 measures **our** work, not a simulated network wait                                                                                   |
| Runs         | Median of 11, **interleaved** across builds     | Back-to-back batches drifted by about 100 ms between sessions; interleaving (before, after, before, after, …) spreads that drift evenly |

**What it reports:**

- **Product cards visible:** the moment the first real product card is in the DOM. This is the number a shopper feels.
- **LCP:** Largest Contentful Paint, the browser's own "main content painted" timestamp (here, the first product image).
- **Main-thread time** from the trace: script, style, layout and paint.
- **Paint work while the skeleton is on screen:** the time between the skeleton appearing and the cards replacing it.

**Supporting tools:**

- `scripts/perf-profile.mjs`: CPU profiles of interactions (typing a search, next page, sorting), with the slowest interaction from the Event Timing API (the basis of INP).
- Lighthouse performance, as a standard reference. It turned out to be blind to both fixes; see "What Lighthouse says" below.

## Baseline: what was slow

**Interactions were already fine** (`perf-profile.mjs`, 4× CPU, warm):

| Interaction                 | Result on screen                                    | Long tasks | Slowest interaction                |
| --------------------------- | --------------------------------------------------- | ---------- | ---------------------------------- |
| Next page                   | 127 ms                                              | 0          | under 16 ms                        |
| Sort by price               | 114 ms                                              | 0          | under 16 ms                        |
| Type "decaf pods" (10 keys) | 1.5 s, mostly the 300 ms search debounce, by design | 0          | 48 ms (INP "good" is under 200 ms) |

Pages are 24 items, so React work per interaction is small.

**The cold load is where time went.** The first trace showed two oddities:

1. **The first layout took about 170–200 ms** (4× CPU) for a header, filters and eight placeholder cards. Removing the header emoji (🦆, 🛒) as an experiment cut it to about 80–100 ms. Any character the page font doesn't have, emoji included, makes the browser search for and load a **fallback font during layout**. The header is on every page, and every product card had a "★".
2. **Hundreds of paints while the list loaded.** With the mock's default latency, about 290 paints happened in the 0.7 s the skeleton was on screen. The shimmer animated `background-position` on every placeholder bar, and that property can only be animated by **repainting on the main thread, every frame**. That's the same thread that has to process the response and render the cards.

## Fix 1: no fallback-font glyphs on the critical path

**Change:** the header emoji (🦆 logo, 👤 account, 🛒 cart) and the rating star (★) on every card became small inline SVG icons (`src/components/icons.tsx`). They're decorative (`aria-hidden`), follow the text color, and cost no font and no request.

Cold first visit, 4× CPU, mock latency 0, median of 11, interleaved:

| Metric                    | Before | After fix 1 | Change                                                                |
| ------------------------- | ------ | ----------- | --------------------------------------------------------------------- |
| **Product cards visible** | 720 ms | **593 ms**  | **−127 ms (−18%)**                                                    |
| **LCP**                   | 992 ms | **844 ms**  | **−148 ms (−15%)**                                                    |
| Main-thread layout        | 366 ms | 240 ms      | −126 ms (−34%)                                                        |
| Main-thread script        | 401 ms | 383 ms      | within noise                                                          |
| App shell visible         | 368 ms | 363 ms      | within noise (the shell waits for the mock; see "Tried and rejected") |

**How the cause was confirmed before fixing it:**

- Removing only the header emoji cut the first layout from about 170–200 ms to 80–105 ms, and the cards came about 140 ms sooner.
- Removing only the star brought the cards about 40 ms sooner and LCP about 80 ms sooner.
- Both are the same cause, so one fix covers both.

## Fix 2: a shimmer the compositor can animate

**Change:** the skeleton shimmer is now a semi-transparent highlight (`::after`) that slides across with `transform: translateX(…)`. The browser's compositor animates `transform` on its own thread without repainting. The old version animated `background-position`, which repaints every bar on the main thread every frame. With reduced motion requested, the animation is still off.

At mock latency 0 the skeleton is only on screen for about 230 ms, so the effect is small but visible:

| Metric                              | After fix 1 | After fix 1 + 2 | Change       |
| ----------------------------------- | ----------- | --------------- | ------------ |
| Paint time while the skeleton shows | 25 ms       | **9 ms**        | −64%         |
| Paints while the skeleton shows     | 46          | 33              | −28%         |
| Product cards visible               | 593 ms      | 573 ms          | within noise |

**With a realistic 1 s response**, the skeleton is on screen for about 1.25 s and the difference is large:

| Metric (mock latency 1000 ms, median of 7, interleaved) | Before (fix 1 only) | After (fix 1 + 2) | Change                                    |
| ------------------------------------------------------- | ------------------- | ----------------- | ----------------------------------------- |
| **Paints while the skeleton shows**                     | 587                 | **35**            | **−94%**                                  |
| **Paint time while the skeleton shows**                 | 240 ms              | **14 ms**         | **−94%**                                  |
| Main-thread paint, first 4 s                            | 471 ms              | 215 ms            | −54%                                      |
| Main-thread style, first 4 s                            | 95 ms               | 49 ms             | −48%                                      |
| Product cards visible                                   | 1626 ms             | 1600 ms           | unchanged (the network is the bottleneck) |

**Why it matters although the cards don't arrive sooner:** the main thread is free while the list loads, for typing in search, opening the menu or scrolling. The old shimmer spent about a fifth of every loading second repainting grey bars. On a real phone with a slow network, loading takes longer, so the cost was larger.

## Totals: before → after both fixes

Cold first visit, 4× CPU, mock latency 0, median of 11, interleaved:

| Metric                  | Before | After  | Change                              |
| ----------------------- | ------ | ------ | ----------------------------------- |
| Product cards visible   | 720 ms | 573 ms | −147 ms (−20%)                      |
| LCP                     | 992 ms | 848 ms | −144 ms (−15%)                      |
| Main-thread layout      | 366 ms | 241 ms | −34%                                |
| Main-thread paint       | 202 ms | 174 ms | −14%                                |
| Paints in the first 4 s | 99     | 86     | −13%                                |
| CLS                     | 0.021  | 0.021  | unchanged (already good: under 0.1) |

## Tried and rejected: render before the mock backend is ready

**Idea:** `main.tsx` waits for the mock backend (a 159 KB gzipped chunk, plus seeding 5,000 products and registering a Service Worker) before rendering anything. Render immediately instead, and make API requests wait for the mock.

**Measured** (median of 9, interleaved, against the final build):

| Metric                | Final build | Render-first prototype      |
| --------------------- | ----------- | --------------------------- |
| App shell visible     | 384 ms      | **289 ms** (−95 ms, better) |
| Product cards visible | 620 ms      | 638 ms (no better)          |
| LCP                   | 936 ms      | **1004 ms** (+68 ms, worse) |

**Rejected.** The shell appears sooner, but rendering it now competes with the mock's start-up for the main thread. The skeleton then sits on screen longer, and the content people came for arrives no sooner, with LCP worse. The prototype was reverted.

**Revisit if:** the mock is replaced by a real backend (the question disappears, since there's nothing to wait for), or measurements on a slow network show the 159 KB download dominating. There, showing the shell sooner may win.

## What Lighthouse says

Lighthouse performance on the home page (simulated mobile, median of 5, interleaved):

|             | Before          | After           |
| ----------- | --------------- | --------------- |
| Score       | 100             | 100             |
| FCP / LCP   | 763 ms / 763 ms | 764 ms / 764 ms |
| Speed Index | 873 ms          | 818 ms          |
| TBT         | 0 ms            | 0 ms            |

Lighthouse saw neither fix, for two reasons:

- **Its LCP element is the page heading**, painted with the first frame, before any card exists. The trace measures the cards themselves.
- **Its simulated throttling** estimates timings from the network request graph, so main-thread costs like font fallback and repaints barely register.

A perfect score didn't mean the list was as fast as it could be, which is why the trace exists.

## Next candidates (not done)

- **The emoji inside the product images:** the category SVG images contain emoji text (☕, 🦆, …). They're decoded as images rather than laid out as page text. Replacing them with plain shapes would likely save some image decode time. Not measured yet.
- **The 159 KB mock chunk:** loaded on every visit because there's no real backend. A real deployment wouldn't ship it at all (`VITE_USE_MOCK_API=false` already drops it from the bundle).
