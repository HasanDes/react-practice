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
