import { useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Navigate, useSearchParams } from "react-router-dom";
import { login } from "../../../api/index.ts";
import { classifyError, type AppError } from "../../../errors/appError.ts";
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
  | { status: "failed"; fieldErrors: FieldErrors; formError: string };

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

/**
 * What the form shows for a failed login. Same AppError kinds as every other
 * page (D3-4); the wording fits a form. 400 → the named fields; 401 → wrong
 * credentials (on login, a 401 isn't an expired session); offline, timeout
 * and server errors → submit again.
 */
function describeLoginFailure(error: AppError): { fieldErrors: FieldErrors; formError: string } {
  switch (error.kind) {
    case "invalid-input": {
      const fieldErrors: FieldErrors = {};
      if (error.fields.includes("email")) fieldErrors.email = FIELD_COPY.email;
      if (error.fields.includes("password")) fieldErrors.password = FIELD_COPY.password;
      return Object.keys(fieldErrors).length > 0
        ? { fieldErrors, formError: "" }
        : { fieldErrors, formError: "Check your email and password, then try again." };
    }
    case "unauthenticated":
      return {
        fieldErrors: {},
        formError: "That email and password don't match. Please check them and try again.",
      };
    case "offline":
      return {
        fieldErrors: {},
        formError: "You seem to be offline. Check your connection, then try again.",
      };
    case "timeout":
      return { fieldErrors: {}, formError: "Signing in is taking too long. Please try again." };
    case "server":
    case "unexpected":
    case "not-found":
    case "out-of-stock":
    case "cancelled":
      return {
        fieldErrors: {},
        formError: "We couldn't sign you in right now. Please try again.",
      };
  }
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
  const formErrorRef = useRef<HTMLParagraphElement>(null);
  const inFlight = useRef(false);
  const emailId = useId();
  const passwordId = useId();
  useDocumentTitle("Sign in");

  // Signed in (already, or just now): go back to where the user was. A
  // successful submit lands here too, so there's a single redirect path.
  if (session.status === "authenticated") return <Navigate to={returnTo} replace />;

  /** Show the failure, then move focus to the first thing to fix. */
  function fail(fieldErrors: FieldErrors, formError: string) {
    // flushSync: render the error text and aria-invalid *before* moving
    // focus, so a screen reader reads the field together with its error.
    flushSync(() => {
      setStatus({ status: "failed", fieldErrors, formError });
    });
    if (fieldErrors.email) emailRef.current?.focus();
    else if (fieldErrors.password) passwordRef.current?.focus();
    else formErrorRef.current?.focus();
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
      fail(invalid, "");
      return;
    }

    inFlight.current = true;
    setStatus({ status: "submitting" });
    try {
      const result = await login({ email: email.trim(), password });
      dispatch(sessionStarted(result)); // the <Navigate> above takes it from here
    } catch (error) {
      const { fieldErrors, formError } = describeLoginFailure(classifyError(error));
      setPassword(""); // don't leave a rejected password sitting in the form
      fail(fieldErrors, formError);
    } finally {
      inFlight.current = false;
    }
  }

  const submitting = status.status === "submitting";
  const errors = status.status === "failed" ? status.fieldErrors : {};
  const formError = status.status === "failed" ? status.formError : "";

  return (
    <section aria-labelledby="login-heading" className="auth">
      <h1 id="login-heading" className="page-heading">
        Sign in
      </h1>

      {session.endedBecause === "expired" && status.status === "idle" && (
        <p role="status" className="auth__notice">
          Your session expired. Please sign in again to continue.
        </p>
      )}

      <form className="auth__form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        {/* Always rendered, so the alert region exists before its text changes
            (more reliable announcements). tabIndex -1: focusable from code only. */}
        <p
          ref={formErrorRef}
          tabIndex={-1}
          role="alert"
          className={formError ? "auth__error" : "visually-hidden"}
        >
          {formError}
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
