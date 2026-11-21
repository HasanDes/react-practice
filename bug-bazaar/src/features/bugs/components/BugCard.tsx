import { Link } from "react-router-dom";
import type { Bug } from "../types.ts";

type BugCardProps = {
  bug: Bug;
};

export default function BugCard({ bug }: BugCardProps) {
  return (
    <li className="bug-card">
      <Link to={`/bugs/${bug.id}`}>{bug.title}</Link>
      <span className={`severity severity-${bug.severity.toLowerCase()}`}>{bug.severity}</span>
    </li>
  );
}
