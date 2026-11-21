import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import LoadGate from "../components/LoadGate.tsx";
import BoardPage from "../features/bugs/pages/BoardPage.tsx";
import BugDetailPage from "../features/bugs/pages/BugDetailPage.tsx";
import type { Bug, NewBug } from "../features/bugs/types.ts";
import { getBugs } from "../api/index.ts";
import { requestState, type RequestState } from "../types/request.ts";
import NotFoundPage from "./NotFoundPage.tsx";

/** Anything can be thrown in JS; normalize it to an Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

export default function App() {
  // One union instead of separate bugs/status/error states: "error with data"
  // or "success without data" can't be represented.
  const [bugsRequest, setBugsRequest] = useState<RequestState<Bug[]>>(requestState.loading());
  const [attempt, setAttempt] = useState(0); // Bumping this re-runs the fetch effect.

  useEffect(() => {
    // Ignore a response if this effect was cleaned up before it arrived,
    // e.g. the extra mount StrictMode does in development.
    let ignore = false;

    getBugs()
      .then((data) => {
        if (!ignore) setBugsRequest(requestState.success(data));
      })
      .catch((error: unknown) => {
        if (!ignore) setBugsRequest(requestState.error(toError(error)));
      });

    return () => {
      ignore = true;
    };
  }, [attempt]);

  function handleRetry() {
    setBugsRequest(requestState.loading());
    setAttempt((current) => current + 1);
  }

  function handleAddBug(newBug: NewBug) {
    setBugsRequest((current) => {
      // Adding only makes sense once the list has loaded.
      if (current.status !== "success") return current;
      const nextId = Math.max(0, ...current.data.map((bug) => bug.id)) + 1;
      return requestState.success([...current.data, { id: nextId, ...newBug }]);
    });
  }

  return (
    <div className="app">
      <header>
        <h1>
          <Link to="/">The Bug Bazaar</Link>
        </h1>
      </header>
      <main>
        <Routes>
          <Route
            path="/"
            element={
              <LoadGate state={bugsRequest} onRetry={handleRetry}>
                {(bugs) => <BoardPage bugs={bugs} onAddBug={handleAddBug} />}
              </LoadGate>
            }
          />
          <Route
            path="/bugs/:id"
            element={
              <LoadGate state={bugsRequest} onRetry={handleRetry}>
                {(bugs) => <BugDetailPage bugs={bugs} />}
              </LoadGate>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
