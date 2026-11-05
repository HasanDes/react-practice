import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <>
      <h2>Page not found</h2>
      <p>That URL does not lead anywhere on the board.</p>
      <Link to="/">Back to the board</Link>
    </>
  );
}
