import { useSyncExternalStore } from "react";
import { crashTest, CrashTestError } from "./crashTest.ts";

/** Renders nothing; throws while the crash test is armed (see crashTest.ts). */
export default function CrashOnDemand() {
  const armed = useSyncExternalStore(crashTest.subscribe, crashTest.isArmed);
  if (armed) throw new CrashTestError();
  return null;
}
