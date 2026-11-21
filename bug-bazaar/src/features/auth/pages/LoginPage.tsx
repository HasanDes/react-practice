import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Navigate, useSearchParams } from "react-router-dom";
import { isApiRequestError, login } from "../../../api/index.ts";
import { useDocumentTitle } from "../../../hooks/useDocumentTitle.ts";
import { useAppDispatch, useAppSelector } from "../../../store/store.ts";
import { safeReturnTo } from "../returnTo.ts";
import { selectSession, sessionStarted } from "../sessionSlice.ts";

type Field = "email" | "password";
type FieldErrors = Partial<Record<Field, string>>;

/** One status at a time: "submitting" and "showing an error" can't overlap. */
type LoginStatus =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "failed"; fieldErrors: FieldErrors; message: string | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const mockEnabled = import.meta.env.VITE_USE_MOCK_API !== "false";

// Our own copy for each field. The server's details say *which* field is
// wrong; the words on screen are ours (D3-4: raw messages never reach the UI).
const FIELD_COPY: Record<Field, string> = {
  email: "Enter a valid email address, like name@example.com.",
  password: "Enter your password.",
};

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = FIELD_COPY.email;
  if (!password) errors.password = FIELD_COPY.password;
  return errors;
}

/** Map a failed login to what the form shows. Branches on kind/status, never on message text. */
function describeLoginFailure(error: unknown): {
  fieldErrors: FieldErrors;
  message: string | null;
} {
  if (isApiRequestError(error)) {
    if (error.status === 400) {
      const fieldErrors: FieldErrors = {};
      if ("email" in error.details) fieldErrors.email = FIELD_COPY.email;
      if ("password" in error.details) fieldErrors.password = FIELD_COPY.password;
      return Object.keys(fieldErrors).length > 0
        ? { fieldErrors, message: null }
        : { fieldErrors, message: "Check your email and password, then try again." };
    }
    if (error.status === 401) {
      return {
        fieldErrors: {},
        message: "That email and password don't match. Please check them and try again.",
      };
    }
    if (error.kind === "network") {
      return {
        fieldErrors: {},
        message: "You seem to be offline. Check your connection, then try again.",
      };
    }
    if (error.kind === "timeout") {
      return { fieldErrors: {}, message: "Signing in is taking too long. Please try again." };
    }
  }
  return { fieldErrors: {}, message: "We couldn't sign you in right now. Please try again." };
}

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const session = useAppSelector(selectSession);
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<LoginStatus>({ status: "idle" });
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  const emailId = useId();
  const passwordId = useId();
  useDocumentTitle("Sign in");

  // Signed in (already, or just now): go back to where the user was. A
  // successful submit lands here too, so there's a single redirect path.
  if (session.status === "authenticated") return <Navigate to={returnTo} replace />;

  /** Show the failure, then move focus to the first thing to fix. */
  function fail(fieldErrors: FieldErrors, message: string | null) {
    // flushSync: render the error text and aria-invalid *before* moving
    // focus, so a screen reader reads the field together with its error.
    flushSync(() => {
      setStatus({ status: "failed", fieldErrors, message });
    });
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
    else messageRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Can't be double-submitted. Two layers: the button is disabled while
    // submitting (state, visible), and this ref stops a second submit that
    // arrives before React re-renders. It must be a ref: `status` in this
    // closure still says "idle" until the next render.
    if (inFlight.current) return;

    const invalid = validate(email, password);
    if (Object.keys(invalid).length > 0) {
      fail(invalid, null);
      return;
    }

    inFlight.current = true;
    setStatus({ status: "submitting" });
    try {
      const result = await login({ email: email.trim(), password });
      dispatch(sessionStarted(result)); // the <Navigate> above takes it from here
    } catch (error) {
      const { fieldErrors, message } = describeLoginFailure(error);
      setPassword(""); // don't leave a rejected password sitting in the form
      fail(fieldErrors, message);
    } finally {
      inFlight.current = false;
    }
  }

  const submitting = status.status === "submitting";
  const errors = status.status === "failed" ? status.fieldErrors : {};
  const message = status.status === "failed" ? status.message : null;

  return (
    <section aria-labelledby="login-heading" className="auth">
      <h2 id="login-heading" className="page-heading">
        Sign in
      </h2>

      {session.endedBecause === "expired" && status.status === "idle" && (
        <p role="status" className="auth__notice">
          Your session expired. Please sign in again to continue.
        </p>
      )}

      <form className="auth__form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        {/* Always rendered, so the alert region exists before its text changes
            (more reliable announcements). tabIndex -1: focusable from code only. */}
        <p
          ref={messageRef}
          tabIndex={-1}
          role="alert"
          className={message ? "auth__error" : "visually-hidden"}
        >
          {message}
        </p>

        <div className="auth__field">
          <label htmlFor={emailId}>Email</label>
          <input
            ref={emailRef}
            id={emailId}
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${emailId}-error` : undefined}
          />
          {errors.email && (
            <p id={`${emailId}-error`} className="auth__field-error">
              {errors.email}
            </p>
          )}
        </div>

        <div className="auth__field">
          <label htmlFor={passwordId}>Password</label>
          <input
            ref={passwordRef}
            id={passwordId}
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={errors.password ? `${passwordId}-error` : undefined}
          />
          {errors.password && (
            <p id={`${passwordId}-error`} className="auth__field-error">
              {errors.password}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="button button--primary"
          disabled={submitting}
          aria-disabled={submitting}
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      {mockEnabled && (
        <p className="auth__hint">
          Demo account: <code>dev@bugbazaar.test</code> / <code>rubberduck</code>
        </p>
      )}
    </section>
  );
}
