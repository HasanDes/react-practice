import { Link } from "react-router-dom";

export default function BugCard({ bug }) {
  return (
    <li className="bug-card">
      <Link to={`/bugs/${bug.id}`}>{bug.title}</Link>
      <span className={`severity severity-${bug.severity.toLowerCase()}`}>
        {bug.severity}
      </span>
    </li>
  );
}
