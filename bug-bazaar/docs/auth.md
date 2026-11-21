# Auth: how sign-in works, and where the token lives

This page covers how the Bug Bazaar signs users in and out, protects pages, and keeps a session. It also explains the trade-offs behind those choices. The decision log is in [decisions.md](decisions.md#d3-3-auth).

## The flow

```text
Signed out, opens /checkout
  → RequireAuth redirects (replace) to /login?returnTo=%2Fcheckout
  → POST /api/login { email, password }
      200 → sessionStarted({ token, user }) → <Navigate to={returnTo} replace>
      400 → the named fields are marked invalid (our own wording), focus moves to the first one
      401 → "That email and password don't match", the password is cleared, focus moves to the message
      offline / timeout / 5xx → a matching message; the user can submit again

Signed in, any authenticated call returns 401
  → the API client calls onUnauthorized(error, tokenItSent)
  → if that token is still the current one: sessionEnded({ reason: "expired" })
  → the session is removed from storage, and RequireAuth sends the user to
    /login?returnTo=<the page they were on>, with "Your session expired"
  → the cart is untouched, so after signing in again the user is back where they were
```

| Piece         | File                                                   | Job                                                                                                       |
| ------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Session state | `features/auth/sessionSlice.ts`                        | `anonymous (endedBecause)` or `authenticated (token, user)`. A token without a user can't be represented. |
| 401 handling  | `store/connectApi.ts`                                  | Ends the session when an authenticated call gets a 401, but only for the token that call sent.            |
| Route guard   | `features/auth/components/RequireAuth.tsx`             | Protects `/account` and `/checkout`. Redirects to login with a return path.                               |
| Return path   | `features/auth/returnTo.ts`                            | Accepts only same-site paths (see "Open redirects" below).                                                |
| Persistence   | `features/auth/sessionStorage.ts`                      | Saves and removes the session, validates it on load, and checks it with `GET /api/me` at startup.         |
| Pages         | `features/auth/pages/LoginPage.tsx`, `AccountPage.tsx` | The form; the profile and Log out.                                                                        |

## Where the token is stored, and why

**Choice: `sessionStorage`**, under `bazaar:session:v1`, as `{ token, user }`.

| Option                  | Survives reload | Survives closing the tab | Readable by injected script (XSS)       | Notes                                                                                                                                                                      |
| ----------------------- | --------------- | ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory only (Redux)     | ❌              | ❌                       | Harder (no fixed place to read it from) | Every reload signs the user out. Bad for a shop.                                                                                                                           |
| **`sessionStorage`** ✅ | ✅              | ❌                       | ✅                                      | Per tab. Gone when the tab closes, so a forgotten tab on a shared computer has a short life.                                                                               |
| `localStorage`          | ✅              | ✅                       | ✅                                      | Stays signed in for good, in every tab. Same XSS exposure, open for much longer.                                                                                           |
| `httpOnly` cookie       | ✅              | Configurable             | ❌ (script can't read it)               | Best against token theft. Needs the server to set the cookie and CSRF protection. **The shared contract uses `Authorization: Bearer`**, so this is out of reach this week. |

**The trade-off in one sentence:** `sessionStorage` keeps the user signed in across reloads (the "Done when" for persistence-style features), and limits how long a token sits on the device. But it is still readable by any script running on the page, exactly like `localStorage`.

**Why not `localStorage`?** Both are equally exposed to XSS. The difference is lifetime. A token in `localStorage` survives browser restarts and is shared by every tab, so a stolen or forgotten token stays valid for longer. For a shop, "sign in again after closing the tab" is a fair price. The cart is a different matter: it holds no secret, so it lives in `localStorage` (D3-2) and is still there after sign-in.

**What it costs:**

- Opening a link in a **new tab** starts signed out (each tab has its own `sessionStorage`). The cart is still there, so the user signs in and carries on.
- Signing out in one tab doesn't sign out the others. Each tab has its own session.

**What actually protects the token** is not the storage choice but not letting attacker script run at all:

- React escapes rendered text. There is no `dangerouslySetInnerHTML` in the app.
- In production, a Content Security Policy that blocks inline and third-party scripts would be the next step.

### In production I'd move to

An `httpOnly`, `Secure`, `SameSite=Lax` session cookie set by the server, plus a CSRF token for state-changing requests. The token would then never be visible to JavaScript. This needs a contract change (cookie auth instead of a bearer header), so it's noted here rather than built.

## Startup: trust, but verify

1. `loadSession()` reads the saved session and **validates its shape** with a Zod schema. Corrupt or wrongly shaped data means starting signed out, not crashing.
2. The store starts as `authenticated` with that token, so a reload on `/account` doesn't flash the login page.
3. Once the mock API is running, `verifySession()` calls `GET /api/me`:
   - **200:** refresh the user's details.
   - **401:** the normal 401 path ends the session as "expired".
   - **Offline or 5xx:** keep the session. The next authenticated call decides.

The guard is a convenience, not security. The server checks the token on every call, and a stale token in the browser can't see or buy anything.

## "A 401 clears the session"

A 401 from **any authenticated call** (`GET /api/me`, `POST /api/orders`, `GET /api/orders/:id`) ends the session. A 401 from **`POST /api/login`** means wrong credentials and never ends anything (the client only notifies on `auth: true` calls).

**Stale 401s are ignored.** A slow request sent with an old token can come back with a 401 _after_ the user has signed in again. The client passes the token that request sent to `onUnauthorized`. The session only ends if that token is still the current one, so the new session survives. There's a test for this.

## The login form can't be double-submitted

Two layers:

1. **The button is disabled** while submitting, and reads "Signing in…".
2. **A ref** (`inFlight`) makes the submit handler return early.

The ref is needed because a second submit can arrive **before React re-renders**: two clicks or Enter presses in the same task, or a script calling `requestSubmit()`. In that window the button isn't disabled yet, and component state seen by the handler still says "idle". A ref changes immediately.

The first version used state for layer 2. Tests passed, because user-event yields between events and the disabled button caught the second one. A real browser sent **three** login requests for a same-task click + click + submit. See [ai-notes.md](ai-notes.md). The checkout button had the same bug and got the same fix.

## Open redirects: validating `returnTo`

`?returnTo=` comes from the URL, so anyone can send a victim a link like `/login?returnTo=https://evil.test`. If the app redirected there after a real sign-in, the victim would land on a look-alike page, believing they had just logged in. This is also the class of input behind the React Router advisory noted in D1-2.

`safeReturnTo(raw)` accepts only **local paths**: one leading `/`, not `//`, no backslashes, no control characters. It checks this **twice**, on the raw value and on the normalized result:

| Input                    | Result      | Why                                                               |
| ------------------------ | ----------- | ----------------------------------------------------------------- |
| `/checkout`              | `/checkout` | Local path                                                        |
| `https://evil.test`      | `/`         | Not a path                                                        |
| `//evil.test`            | `/`         | Protocol-relative: another site                                   |
| `/\evil.test`            | `/`         | Browsers treat `\` as `/`                                         |
| `/%09/evil.test` (a tab) | `/`         | Browsers strip tabs and newlines, leaving `//`                    |
| `/.//evil.test`          | `/`         | Passes the raw check, but resolving `.` **creates** `//evil.test` |
| `/login?...`             | `/`         | Avoids a loop back to the login page                              |

The second check exists because of the last-but-one row. The first version only checked the raw value, and mutation testing showed the tests couldn't tell "rejected" from "normalized to `/`".

## Logout

- **Log out** (on `/account`) navigates home, then ends the session with `reason: "logout"`. The stored session is removed.
- Navigating first matters: if the session ended first, `RequireAuth` would send the user to the login page instead.
- **The token is not revoked on the server.** The contract has no logout endpoint, so the token stays valid until it expires. In production: `POST /api/logout` to revoke it.
- **The cart is kept.** It belongs to the device, not the account, and holds no secret.

## Testing it by hand

| What            | How                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sign in         | Demo account `dev@bugbazaar.test` / `rubberduck` (shown on the login page while the mock is on)                    |
| Return path     | Open `/account` or `/checkout` signed out, sign in, and you're back on that page                                   |
| Session expired | QA panel → **Expire session (401)**, or `bazaarMock.expireSessions()` in the console, then load any signed-in page |
| Wrong password  | Any other password                                                                                                 |
| Field errors    | Leave a field empty, or `bazaarMock.fail("login", 400)`                                                            |
| Double submit   | `bazaarMock.latency(2000)`, then click Sign in repeatedly: one request                                             |
| Open redirect   | `/login?returnTo=%2F.%2F%2Fevil.test`: after signing in you stay on the Bazaar                                     |
