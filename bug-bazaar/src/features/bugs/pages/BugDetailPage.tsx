import { Link, useParams } from "react-router-dom";
import type { Bug } from "../types.ts";

type BugDetailPageProps = {
  bugs: readonly Bug[];
};

export default function BugDetailPage({ bugs }: BugDetailPageProps) {
  const { id } = useParams<{ id: string }>();
  // URL params are strings and bug ids are numbers.
  const bug = bugs.find((candidate) => String(candidate.id) === id);

  if (!bug) {
    return (
      <>
        <h2>Bug not found</h2>
        <p>There is no bug with id &quot;{id}&quot;.</p>
        <Link to="/">Back to the board</Link>
      </>
    );
  }

  return (
    <article>
      <h2>{bug.title}</h2>
      <dl>
        <dt>Case number</dt>
        <dd>#{bug.id}</dd>
        <dt>Severity</dt>
        <dd>{bug.severity}</dd>
      </dl>
      <Link to="/">Back to the board</Link>
    </article>
  );
}
