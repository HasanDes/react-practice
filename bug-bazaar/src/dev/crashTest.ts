// D4-7 QA: make the current page throw while rendering, on purpose, to show
// the fallback screen and the log entry. Armed from the QA panel or with
// `bazaarMonitoring.crashPage()` in the console. It stays armed (so React's
// automatic re-render after an error throws again) until the boundary resets.

type Listener = () => void;

let armed = false;
const listeners = new Set<Listener>();

function emit(): void {
  for (const listener of listeners) listener();
}

export const crashTest = {
  arm: (): void => {
    armed = true;
    emit();
  },
  disarm: (): void => {
    if (!armed) return;
    armed = false;
    emit();
  },
  isArmed: (): boolean => {
    return armed;
  },
  subscribe: (listener: Listener): (() => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export class CrashTestError extends Error {
  override name = "CrashTestError";
  constructor() {
    super("Crash test: thrown on purpose while rendering (D4-7 QA)");
  }
}
