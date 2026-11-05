import BugCard from "./BugCard.jsx";

export default function BugList({ bugs }) {
  if (bugs.length === 0) {
    return <p>No bugs found.</p>;
  }

  return (
    <ul className="bug-list">
      {bugs.map((bug) => (
        <BugCard key={bug.id} bug={bug} />
      ))}
    </ul>
  );
}
