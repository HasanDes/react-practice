import type { Bug } from "../types.ts";
import BugCard from "./BugCard.tsx";

type BugListProps = {
  bugs: readonly Bug[];
};

export default function BugList({ bugs }: BugListProps) {
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
