import { Link } from "react-router-dom";
import { NotFoundState } from "../components/states.tsx";
import { useDocumentTitle } from "../hooks/useDocumentTitle.ts";

/** The catch-all route. Same Not Found card as a missing product or order (D3-4). */
export default function NotFoundPage() {
  useDocumentTitle("Page not found");
  return (
    <section>
      <NotFoundState
        title="Page not found"
        description="That URL doesn't lead anywhere in the Bazaar."
        action={
          <Link to="/" className="button button--primary">
            Browse products
          </Link>
        }
      />
    </section>
  );
}
