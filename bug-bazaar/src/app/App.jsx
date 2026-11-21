import { useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { fetchBugs } from "../mocks/mockApi.js";
import LoadGate from "../components/LoadGate.jsx";
import BoardPage from "../features/bugs/pages/BoardPage.jsx";
import BugDetailPage from "../features/bugs/pages/BugDetailPage.jsx";
import NotFoundPage from "./NotFoundPage.jsx";

export default function App() {
  const [bugs, setBugs] = useState([]);
  const [status, setStatus] = useState("loading"); // "loading" | "success" | "error"
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0); // Bumping this re-runs the fetch effect.

  useEffect(() => {
    // Ignore a response if this effect was cleaned up before it arrived,
    // e.g. the extra mount StrictMode does in development.
    let ignore = false;

    fetchBugs()
      .then((data) => {
        if (ignore) return;
        setBugs(data);
        setStatus("success");
      })
      .catch((err) => {
        if (ignore) return;
        setError(err.message);
        setStatus("error");
      });

    return () => {
      ignore = true;
    };
  }, [attempt]);

  function handleRetry() {
    setStatus("loading");
    setError(null);
    setAttempt((current) => current + 1);
  }

  function handleAddBug({ title, severity }) {
    setBugs((current) => {
      const nextId = Math.max(0, ...current.map((bug) => bug.id)) + 1;
      return [...current, { id: nextId, title, severity }];
    });
  }

  const gateProps = { status, error, onRetry: handleRetry };

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
              <LoadGate {...gateProps}>
                <BoardPage bugs={bugs} onAddBug={handleAddBug} />
              </LoadGate>
            }
          />
          <Route
            path="/bugs/:id"
            element={
              <LoadGate {...gateProps}>
                <BugDetailPage bugs={bugs} />
              </LoadGate>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
