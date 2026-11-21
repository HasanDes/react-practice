// Where to send the user after they sign in (D3-3: "return users to where
// they were"). The path arrives in the URL (?returnTo=…), so anyone can craft
// a link with any value. Only same-origin app paths are accepted: never
// "https://evil.test", "//evil.test" or "/\evil.test", which browsers treat
// as other sites (an open redirect). The React Router advisory noted in D1-2
// is about exactly this kind of input.

const LOGIN_PATH = "/login";
// Any fixed origin works: it is only the base for resolving the path.
const BASE = "https://bazaar.invalid";

/** A path that can only mean "this site": one leading slash, no backslashes or control characters. */
function isLocalPath(path: string): boolean {
  return (
    path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !/\p{Cc}/u.test(path)
  );
}

/**
 * A safe in-app path from a ?returnTo value, or the fallback.
 *
 * Checked twice: the raw input, and the normalized result. Normalizing can
 * *create* a dangerous path: "/.//evil.test" passes the first check, but
 * resolving "." turns it into "//evil.test" (another site). So the value
 * returned is always one that passed `isLocalPath` itself.
 */
export function safeReturnTo(raw: string | null, fallback = "/"): string {
  if (raw === null || !isLocalPath(raw)) return fallback;
  try {
    const url = new URL(raw, BASE);
    if (url.pathname === LOGIN_PATH) return fallback; // never loop back to the login page
    const path = `${url.pathname}${url.search}${url.hash}`;
    return isLocalPath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

/** The login URL that brings the user back to `location` afterwards. */
export function loginHref(location: { pathname: string; search?: string; hash?: string }): string {
  const here = `${location.pathname}${location.search ?? ""}${location.hash ?? ""}`;
  if (location.pathname === LOGIN_PATH || here === "/") return LOGIN_PATH;
  return `${LOGIN_PATH}?returnTo=${encodeURIComponent(here)}`;
}
