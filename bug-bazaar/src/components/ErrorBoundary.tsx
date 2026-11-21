import { Component, type ErrorInfo, type ReactNode } from "react";
import { monitor as appMonitor, type Monitor } from "../monitoring/monitor.ts";

export type FallbackProps = {
  /** The logged report's reference, once it's been logged. */
  reportId: string | null;
  /** Render the children again (after the cause may have gone away). */
  reset: () => void;
};

type Props = {
  children: ReactNode;
  fallback: (props: FallbackProps) => ReactNode;
  /** When this value changes, a crashed boundary resets, e.g. the route path:
   *  navigating away from a broken page shows the new page. */
  resetKey?: unknown;
  /** Called on every reset, to clear whatever caused the crash if possible. */
  onReset?: () => void;
  monitor?: Monitor;
};

type State = { failed: boolean; reportId: string | null };

/**
 * Catches errors thrown while rendering its children (D4-7): instead of React
 * unmounting the whole app (a blank page), it shows `fallback` and logs the
 * error, with React's component stack, to the monitor.
 *
 * A class because React only offers error boundaries as class components.
 * It catches render, lifecycle and effect errors below it, not errors in
 * event handlers or async code (globalHandlers.ts logs those).
 */
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { failed: false, reportId: null };

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    const report = (this.props.monitor ?? appMonitor).capture(error, {
      source: "render",
      componentStack: info.componentStack,
    });
    this.setState({ reportId: report.id });
  }

  override componentDidUpdate(previous: Props): void {
    if (this.state.failed && !Object.is(previous.resetKey, this.props.resetKey)) this.reset();
  }

  reset = (): void => {
    this.props.onReset?.();
    this.setState({ failed: false, reportId: null });
  };

  override render(): ReactNode {
    if (this.state.failed) {
      return this.props.fallback({ reportId: this.state.reportId, reset: this.reset });
    }
    return this.props.children;
  }
}
