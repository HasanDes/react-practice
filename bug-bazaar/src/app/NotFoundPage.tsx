import { Link } from "react-router-dom";

export default function NotFoundPage() {
  return (
    <section>
      <h2 className="page-heading">Page not found</h2>
      <p>That URL doesn&apos;t lead anywhere in the Bazaar.</p>
      <Link to="/">Browse products</Link>
    </section>
  );
}
