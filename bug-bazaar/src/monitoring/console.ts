import type { ErrorReport, Monitor } from "./monitor.ts";

export type BazaarMonitoringConsole = {
  /** Every error logged since the page loaded (up to 50), oldest first. */
  reports: () => ErrorReport[];
  clear: () => void;
  /** QA builds only: make the current page throw while rendering. */
  crashPage?: () => void;
};

declare global {
  interface Window {
    /** D4-7: read the error log from DevTools, e.g. `bazaarMonitoring.reports()`. */
    bazaarMonitoring?: BazaarMonitoringConsole;
  }
}

export function exposeMonitoringConsole(
  monitor: Monitor,
  { crashPage }: { crashPage?: () => void } = {},
): void {
  window.bazaarMonitoring = {
    reports: () => monitor.reports(),
    clear: () => monitor.clear(),
    ...(crashPage ? { crashPage } : {}),
  };
}
