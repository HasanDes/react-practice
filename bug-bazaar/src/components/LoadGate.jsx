export default function LoadGate({ status, error, onRetry, children }) {
  if (status === "loading") {
    return <p role="status">Loading bugs...</p>;
  }

  if (status === "error") {
    return (
      <div role="alert" className="error-box">
        <p>Could not load bugs: {error}</p>
        <button type="button" onClick={onRetry}>
          Retry
        </button>
      </div>
    );
  }

  return children;
}
