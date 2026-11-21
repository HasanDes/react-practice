import { useState, type FormEvent } from "react";
import { isSeverity, SEVERITIES, type NewBug, type Severity } from "../types.ts";

type BugFormProps = {
  onAddBug: (bug: NewBug) => void;
};

export default function BugForm({ onAddBug }: BugFormProps) {
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("Low");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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
        <select
          value={severity}
          onChange={(event) => {
            // <select> values are plain strings; narrow instead of casting.
            if (isSeverity(event.target.value)) setSeverity(event.target.value);
          }}
        >
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
