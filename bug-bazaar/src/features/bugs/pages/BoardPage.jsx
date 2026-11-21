import { useState } from "react";
import BugForm from "../components/BugForm.jsx";
import BugList from "../components/BugList.jsx";

export default function BoardPage({ bugs, onAddBug }) {
  const [query, setQuery] = useState("");

  // Derived on every render, so it can never go out of sync with bugs or query.
  const normalizedQuery = query.trim().toLowerCase();
  const visibleBugs = bugs.filter((bug) => bug.title.toLowerCase().includes(normalizedQuery));

  return (
    <>
      <BugForm onAddBug={onAddBug} />
      <h2>Bugs</h2>
      <label className="search">
        Search by title
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <BugList bugs={visibleBugs} />
    </>
  );
}
