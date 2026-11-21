# AI Notes

Log of notable AI use during the Bug Bazaar week (required by D5-7: three AI uses with the prompt, what was kept, what was changed and why; one AI mistake and how it was caught; one thing I wouldn't hand to AI).

> Entries are added as the week goes. The final D5-7 write-up picks the three most instructive.

---

## AI mistake: outdated library API (D1-2 → caught in D1-3)

- **What happened:** the D1-2 mock code (AI-written) started MSW with `onUnhandledRequest: "bypass"` in the browser and `"error"` in tests. That option name is from **MSW 2**. MSW 3, the version actually installed, renamed it to `onUnhandledFrame`.
- **Why nobody noticed:** plain JavaScript passes unknown option keys through silently. All 25 tests still passed, and the browser smoke test worked, because the defaults happened to be harmless.
- **How it was caught:** the D1-3 TypeScript migration. `tsc` reported `'onUnhandledRequest' does not exist in type 'StartOptions'`.
- **Impact:** the tests' safety net (fail on any request without a handler) had never been active, and the browser logged warnings instead of quietly bypassing Vite's asset requests.
- **Lesson:** AI suggestions reflect whatever version of a library was most common in its training data, not necessarily the installed one. Check new-major APIs against the installed package (`node_modules/<pkg>/README.md` or its types). Strict types are a cheap way to catch this whole class of mistake.

---

## AI mistake: assuming aborts reach the mock (D2-3)

- **What happened:** the QA panel's "fail the next request" didn't work in the browser. The AI correctly diagnosed React StrictMode's double request using up the one-shot failure. But its first fix (skip requests whose `request.signal.aborted` is true) **assumed** the abort would reach the MSW handler.
- **How it was caught:** not by tests (jsdom has no StrictMode and no Service Worker), but by driving real headless Edge and reading the screenshots. The error state never showed up. A targeted probe (abort a request, then check whether the forced failure was still armed) proved that the Service Worker doesn't forward aborts.
- **What changed:** the speculative check was removed, and the panel switched to persistent failures with an explicit "Stop errors" step, which is deterministic everywhere.
- **Lesson:** "the tests pass" isn't "it works". Check behavior that depends on the runtime (StrictMode, Service Workers, real browser history) in a real browser, and test assumptions with a probe instead of coding around them.

---

## AI mistake: a test that couldn't fail (D3-2)

- **What happened:** the AI wrote a "can't be double-submitted" test: double-click Place order, then assert one request. It passed.
- **How it was caught:** mutation testing. With both double-submit guards deliberately removed, the test **still passed**. The mock answered instantly, so the first order completed and the page navigated away before the second click landed. The test never reached the situation it claimed to check.
- **What changed:** the test now holds the first request in flight for 200 ms (an MSW handler that delays, then falls through to the real one). It asserts the button is disabled and reads "Placing your order…" during the request, and that only one request was sent. It fails without the guards and passes with them.
- **Lesson:** a green test isn't evidence until you've seen it go red for the right reason. For every key guarantee this week (race safety, effect cleanup, idempotency, double-submit), I break the code on purpose and confirm the test catches it.

---

## AI mistake: a double-submit guard that read stale state (D3-2 → caught in D3-3)

- **What happened:** for both checkout (D3-2) and login (D3-3), the AI added an early return, `if (status === "submitting") return`, with a comment claiming it stopped "a second click that lands before React re-renders". It doesn't. The handler's `status` comes from the last render, so until React re-renders, a second event still sees "idle".
- **Why the tests didn't catch it:** user-event waits between events, so React re-rendered and the **disabled button** blocked the second click. The early return never had to do anything, and a mutation that removed only the button's `disabled` would have been the right check.
- **How it was caught:** the real-browser check fired click, click and `requestSubmit()` in one task against an 800 ms server. **Three** login requests went out.
- **What changed:** both guards are now a ref, which changes immediately. New tests fire both events inside one `act()`, so there's no re-render in between. They fail with the old state-based guard and pass with the ref.
- **Lesson:** a comment describing what code protects against is a claim, not a proof. Test the exact situation the comment names, here "before React re-renders", and make sure the test's tooling doesn't quietly avoid that situation.

---

## AI mistake: an open-redirect check that normalization could bypass (D3-3)

- **What happened:** the AI's first `safeReturnTo` checked the **raw** `?returnTo` value (one leading `/`, no `//`, no `\`) and then returned the URL-normalized path. But normalization can create what the check forbids: `/.//evil.test` passes, and resolving `.` turns it into `//evil.test`, a link to another site.
- **How it was caught:** mutation testing. Removing a validation line **didn't fail any test**. Every unsafe input in the tests happened to normalize to `/`, the same as the fallback, so the tests couldn't tell "rejected" from "cleaned up". Asking why led to the bypass.
- **What changed:** the normalized result is checked too. The tests use a distinct fallback (`/fallback`) and include dot-segment inputs. A check that no input could trigger (the origin comparison) was removed as dead code.
- **Lesson:** validate what you **output**, not only what you received. And when a test's "rejected" value is also a plausible normal result, the test can pass for the wrong reason.

---

## AI mistake: a React.memo that couldn't work (D4-3)

- **What happened:** the AI memoized `ProductCard` for the virtualized list, but its own grid code passed `position={{ index, total }}`, a new object on every render. Memo's shallow comparison always failed, so every visible card still re-rendered on every scroll frame.
- **How it was caught:** measurement, not review. The scroll benchmark counted card renders: 12,140 without memo and 11,715 with it. The optimization had no effect.
- **What changed:** the props became two numbers (`positionIndex`, `setSize`). Card renders during the same scroll fell to 590 (−95%), and the median frame went from 33 to 17 ms.
- **Lesson:** `React.memo`, `useMemo` and `useCallback` only help if the values being compared can actually be equal from render to render. Don't assume a memoization works: count renders before and after. The same reasoning removed a `useCallback` whose identity nothing compared.

---

## AI mistake: two scroll-restore bugs only a browser could show (D4-3)

- **What happened:** "Back returns to the same place in the 5,000-item list" was written twice before it worked. (1) The position was saved in a normal effect's cleanup, which runs after React has swapped in the shorter product page, when the browser has already clamped `scrollY` to near 0. (2) A manual `scrollTo` on return was overwritten by the virtualizer, which scrolls the window to its own `initialOffset` when it attaches.
- **How it was caught:** the headless-browser check (Back from product #1996 landed at the top), then a frame-by-frame probe of `scrollY` and sessionStorage, then reading the library source for the attach-time scroll.
- **What changed:** save in a layout-effect cleanup (it runs before the list's DOM is removed), and restore through the virtualizer's `initialOffset` option. Verified: Back from #2001 returns to #1996.
- **Lesson:** jsdom has no layout or scrolling, so these bugs can't exist there. Behavior that depends on layout timing needs a real browser, and when a library owns scrolling, read how it behaves on mount before fighting it.
