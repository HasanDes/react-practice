import { useEffect } from "react";

const SITE_NAME = "The Bug Bazaar";

/**
 * Sets the browser tab title while the component is mounted, and restores
 * the previous title on cleanup. A unique title per page lets screen reader
 * users know where they are after navigation (WCAG 2.4.2), and makes tabs
 * and history entries readable.
 */
export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    if (title === null) return;
    const previous = document.title;
    document.title = `${title} · ${SITE_NAME}`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
