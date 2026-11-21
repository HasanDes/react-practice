import { useState } from "react";

const SEVERITIES = ["Low", "Medium", "High"];

export default function BugForm({ onAddBug }) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("Low");
  const [error, setError] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required.");
      return;
    }

    onAddBug({ title: trimmedTitle, severity });
    setTitle("");
    setSeverity("Low");
    setError(null);
  }

  return (
    <form className="bug-form" onSubmit={handleSubmit} noValidate>
      <h2>Report a bug</h2>
      <label>
        Title
        <input
          type="text"
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            setError(null);
          }}
        />
      </label>
      <label>
        Severity
        <select value={severity} onChange={(event) => setSeverity(event.target.value)}>
          {SEVERITIES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button type="submit">Add bug</button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </form>
  );
}
