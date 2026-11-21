// @vitest-environment jsdom
// D3-3 "Done when": a 401 clears the session, the login form can't be
// double-submitted, and users return to where they were after signing in.
// Runs the real App, store and API client against the mock backend.

import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getMe, login } from "../../api/index.ts";
import { createControls } from "../../mocks/controls.ts";
import { createDb, createMemoryStorage, DEMO_USER, type MockDb } from "../../mocks/db.ts";
import { createHandlers } from "../../mocks/handlers.ts";
import { connectApiToStore } from "../../store/connectApi.ts";
import { makeStore, type AppStore } from "../../store/store.ts";
import TestApp from "../../test/TestApp.tsx";
import { sessionEnded, sessionStarted } from "./sessionSlice.ts";
import { loadSession, persistSession, verifySession } from "./sessionStorage.ts";

const server = setupServer();
let db: MockDb;
let disconnect: () => void = () => undefined;
/** Every POST /api/login the app sent. */
let loginPosts: number;

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  server.events.on("request:start", ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname === "/api/login") loginPosts++;
  });
});
afterAll(() => server.close());
beforeEach(() => {
  const storage = createMemoryStorage();
  db = createDb({ storage });
  server.resetHandlers(...createHandlers({ db, controls: createControls({ storage }) }));
  loginPosts = 0;
});
afterEach(() => {
  disconnect();
});

/** A store wired to the data layer like main.tsx, optionally already signed in. */
function connectedStore({ signedIn = false } = {}): AppStore {
  const session = signedIn ? db.login(DEMO_USER.email, DEMO_USER.password) : null;
  const store = makeStore(session ? { session: { status: "authenticated", ...session } } : {});
  disconnect = connectApiToStore(store);
  return store;
}

function renderAt(path: string, store: AppStore) {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={[path]}>
      <TestApp store={store} />
    </MemoryRouter>,
  );
  return user;
}

async function fillIn(user: ReturnType<typeof userEvent.setup>, email: string, password: string) {
  if (email) await user.type(screen.getByLabelText("Email"), email);
  if (password) await user.type(screen.getByLabelText("Password"), password);
}

const submit = () => screen.getByRole("button", { name: /sign(ing)? in/i });

describe("login", () => {
  it("signs in and returns to the page in ?returnTo", async () => {
    const store = connectedStore();
    const user = renderAt("/login?returnTo=%2Faccount", store);
    await fillIn(user, DEMO_USER.email, DEMO_USER.password);
    await user.click(submit());

    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(await screen.findByTestId("account-name")).toHaveTextContent("Dev Duck");
    expect(store.getState().session.status).toBe("authenticated");
    expect(
      screen.getByRole("link", { name: "Account, signed in as Dev Duck" }),
    ).toBeInTheDocument();
  });

  it("ignores an unsafe ?returnTo (open redirect) and goes to the home page", async () => {
    const user = renderAt("/login?returnTo=https%3A%2F%2Fevil.test", connectedStore());
    await fillIn(user, DEMO_USER.email, DEMO_USER.password);
    await user.click(submit());
    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
  });

  it("a protected page sends a signed-out user to sign in, then back to that page", async () => {
    const user = renderAt("/account", connectedStore());
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await fillIn(user, DEMO_USER.email, DEMO_USER.password);
    await user.click(submit());
    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
  });

  it("wrong password: says so, clears the password, focuses the message, stays signed out", async () => {
    const store = connectedStore();
    const user = renderAt("/login", store);
    await fillIn(user, DEMO_USER.email, "not-the-password");
    await user.click(submit());

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent("email and password don't match"));
    expect(alert).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(store.getState().session).toEqual({ status: "anonymous", endedBecause: null });
  });

  it("empty fields: marks them invalid and focuses the first one, without a request", async () => {
    const user = renderAt("/login", connectedStore());
    await user.click(submit());

    const email = screen.getByLabelText("Email");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter your email address.");
    expect(screen.getByLabelText("Password")).toHaveAccessibleDescription("Enter your password.");
    expect(email).toHaveFocus();
    expect(loginPosts).toBe(0);
  });

  it("a server 400 marks the named field, with our own copy (not the server's text)", async () => {
    server.use(
      http.post("*/api/login", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "RAW", details: { email: "RAW" } } },
          { status: 400 },
        ),
      ),
    );
    const user = renderAt("/login", connectedStore());
    await fillIn(user, "someone@example.com", "secret");
    await user.click(submit());

    const email = screen.getByLabelText("Email");
    await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
    expect(email).toHaveAccessibleDescription(/enter a valid email address/i);
    expect(screen.queryByText("RAW")).not.toBeInTheDocument();
  });

  it("can't be double-submitted: double-click plus Enter sends one request", async () => {
    // Hold the response so the extra clicks land while the first is in flight.
    // (With an instant response the test passes even without the guards.)
    server.use(
      http.post("*/api/login", async () => {
        await delay(200);
        return undefined; // fall through to the real handler
      }),
    );
    const store = connectedStore();
    const user = renderAt("/login?returnTo=%2Faccount", store);
    await fillIn(user, DEMO_USER.email, DEMO_USER.password);

    await user.dblClick(submit());
    await user.keyboard("{Enter}");
    expect(submit()).toBeDisabled();
    expect(submit()).toHaveTextContent("Signing in…");

    expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
    expect(loginPosts).toBe(1);
  });
});

it("can't be double-submitted even when both submits land before React re-renders", async () => {
  // user-event yields between events, so React re-renders and the disabled
  // button blocks the second one. Inside one act() there is no re-render in
  // between: only the ref guard can stop it. (A guard that read component
  // state passed the test above and failed this one, and the browser check.)
  server.use(
    http.post("*/api/login", async () => {
      await delay(200);
      return undefined;
    }),
  );
  const user = renderAt("/login?returnTo=%2Faccount", connectedStore());
  await fillIn(user, DEMO_USER.email, DEMO_USER.password);
  const form = (submit() as HTMLButtonElement).form;
  if (!form) throw new Error("submit button is outside a form");

  act(() => {
    form.requestSubmit();
    form.requestSubmit();
  });
  expect(await screen.findByRole("heading", { name: "Your account" })).toBeInTheDocument();
  expect(loginPosts).toBe(1);
});

describe("a 401 clears the session", () => {
  it("an expired token on a protected page: signed out, told why, and brought back after", async () => {
    const store = connectedStore({ signedIn: true });
    db.expireSessions(); // the server no longer accepts the token
    const user = renderAt("/account", store);

    expect(await screen.findByText(/your session expired/i)).toHaveAttribute("role", "status");
    expect(store.getState().session).toEqual({ status: "anonymous", endedBecause: "expired" });
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();

    await fillIn(user, DEMO_USER.email, DEMO_USER.password);
    await user.click(submit());
    expect(await screen.findByTestId("account-name")).toHaveTextContent("Dev Duck");
  });

  it("a late 401 for an old token doesn't sign the user out of a newer session", async () => {
    const store = connectedStore({ signedIn: true });
    server.use(
      http.get("*/api/me", async () => {
        await delay(100);
        return new HttpResponse(null, { status: 401 });
      }),
    );
    const stale = getMe().catch(() => undefined); // sent with the first token
    const fresh = db.login(DEMO_USER.email, DEMO_USER.password);
    if (!fresh) throw new Error("login failed");
    store.dispatch(sessionStarted(fresh)); // the user signs in again meanwhile
    await stale;

    expect(store.getState().session).toMatchObject({
      status: "authenticated",
      token: fresh.token,
    });
  });

  it("a 401 from login itself (wrong password) doesn't end an existing session", async () => {
    const store = connectedStore({ signedIn: true });
    await login({ email: DEMO_USER.email, password: "wrong" }).catch(() => undefined);
    expect(store.getState().session.status).toBe("authenticated");
  });
});

describe("logout", () => {
  it("ends the session, goes home, and the account page is protected again", async () => {
    const store = connectedStore({ signedIn: true });
    const user = renderAt("/account", store);
    await user.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Products" })).toBeInTheDocument();
    expect(store.getState().session).toEqual({ status: "anonymous", endedBecause: "logout" });
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("the session survives a reload (sessionStorage)", () => {
  it("is saved on sign-in and removed on sign-out", () => {
    const storage = createMemoryStorage();
    const store = connectedStore();
    persistSession(store, storage);
    const session = db.login(DEMO_USER.email, DEMO_USER.password);
    if (!session) throw new Error("login failed");

    store.dispatch(sessionStarted(session));
    expect(loadSession(storage)).toEqual({ status: "authenticated", ...session });

    store.dispatch(sessionEnded({ reason: "expired" }));
    expect(loadSession(storage)).toBeUndefined();
  });

  it("ignores corrupt or wrongly shaped saved data", () => {
    const storage = createMemoryStorage();
    storage.setItem("bazaar:session:v1", "{not json");
    expect(loadSession(storage)).toBeUndefined();
    storage.setItem("bazaar:session:v1", JSON.stringify({ token: "", user: { id: 1 } }));
    expect(loadSession(storage)).toBeUndefined();
  });

  it("a restored token is checked at startup: a 401 ends it as expired", async () => {
    const store = connectedStore({ signedIn: true });
    db.expireSessions();
    await verifySession(store);
    expect(store.getState().session).toEqual({ status: "anonymous", endedBecause: "expired" });
  });

  it("a restored token survives the startup check when the network is down", async () => {
    const store = connectedStore({ signedIn: true });
    server.use(http.get("*/api/me", () => HttpResponse.error()));
    await verifySession(store);
    expect(store.getState().session.status).toBe("authenticated");
  });
});
