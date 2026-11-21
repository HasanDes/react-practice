// Error monitoring (D4-7). Every unexpected error ends up here, from three
// sources:
//   - "render":   a component threw while rendering; an error boundary caught
//                 it and showed a fallback screen (components/ErrorBoundary.tsx).
//   - "uncaught": thrown outside rendering (an event handler, a timer). React
//                 doesn't catch these; the window "error" event does.
//   - "unhandled-rejection": a promise rejected and nobody handled it.
//
// A report is built once, kept in a small in-memory buffer (for QA, through
// `window.bazaarMonitoring`), and handed to a transport. The default transport
// logs to the console; production would swap in an error service (Sentry,
// Datadog…) with `createMonitor({ transport })`. Nothing else changes.
//
// Privacy: a report holds the error, where it happened, and the page *path*
// only. No query string (search terms are user input), no token, no cart.

export type ErrorSource = "render" | "uncaught" | "unhandled-rejection";

export type ErrorReport = {
  /** Short reference shown on the fallback screen, so a user's "I got error
   *  4f9c2a1b" can be matched to this report. */
  id: string;
  source: ErrorSource;
  /** Error class name, e.g. "TypeError". "NonError" when a non-Error was thrown. */
  name: string;
  message: string;
  stack?: string;
  /** React's component stack, for render errors: which component threw. */
  componentStack?: string;
  /** location.pathname when it happened. */
  route: string;
  /** ISO timestamp. */
  time: string;
  /** Build mode ("development", "production"), to tell test noise from real users. */
  mode: string;
};

export type ErrorTransport = (report: ErrorReport, error: unknown) => void;

export type CaptureContext = {
  source: ErrorSource;
  componentStack?: string | null;
};

export type Monitor = {
  /** Records the error and returns its report. The same error object is only
   *  reported once: a second capture returns the first report. */
  capture(error: unknown, context: CaptureContext): ErrorReport;
  /** Whether this error object has already been reported. */
  hasCaptured(error: unknown): boolean;
  /** The most recent reports, oldest first. */
  reports(): ErrorReport[];
  clear(): void;
};

export type MonitorOptions = {
  transport?: ErrorTransport;
  /** How many reports the buffer keeps (oldest dropped first). */
  maxReports?: number;
  now?: () => Date;
  makeId?: () => string;
  getRoute?: () => string;
  mode?: string;
};

export const consoleTransport: ErrorTransport = (report, error) => {
  console.error(
    `[monitoring] ${report.source} error ${report.id} on ${report.route}`,
    error,
    report,
  );
};

function randomId(): string {
  return crypto.randomUUID().slice(0, 8);
}

function currentRoute(): string {
  return typeof location === "undefined" ? "" : location.pathname;
}

export function createMonitor({
  transport = consoleTransport,
  maxReports = 50,
  now = () => new Date(),
  makeId = randomId,
  getRoute = currentRoute,
  mode = import.meta.env.MODE,
}: MonitorOptions = {}): Monitor {
  let buffer: ErrorReport[] = [];
  // Keyed by the error object: React (in development) and the browser can
  // both see the same thrown error; it must count once.
  const seen = new WeakMap<object, ErrorReport>();

  return {
    capture(error, { source, componentStack }) {
      const key = typeof error === "object" && error !== null ? error : null;
      const previous = key ? seen.get(key) : undefined;
      if (previous) return previous;

      const isError = error instanceof Error;
      const report: ErrorReport = {
        id: makeId(),
        source,
        name: isError ? error.name : "NonError",
        message: isError ? error.message : safeString(error),
        ...(isError && error.stack ? { stack: error.stack } : {}),
        ...(componentStack ? { componentStack } : {}),
        route: getRoute(),
        time: now().toISOString(),
        mode,
      };
      if (key) seen.set(key, report);
      buffer = [...buffer, report].slice(-maxReports);

      // Reporting must never become a second failure.
      try {
        transport(report, error);
      } catch {
        // Nothing sensible to do: the report is still in the buffer.
      }
      return report;
    },
    hasCaptured(error) {
      return typeof error === "object" && error !== null && seen.has(error);
    },
    reports() {
      return [...buffer];
    },
    clear() {
      buffer = [];
    },
  };
}

function safeString(value: unknown): string {
  try {
    if (typeof value === "string") return value;
    // JSON.stringify returns undefined for undefined, functions and symbols.
    const json = JSON.stringify(value) as string | undefined;
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

/** The app's monitor. Tests build their own with `createMonitor`. */
export const monitor: Monitor = createMonitor();
