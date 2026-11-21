import { useEffect, useRef, type RefObject } from "react";
import { NavigationType, useLocation, useNavigationType } from "react-router-dom";

/**
 * After an in-app navigation to a different page, move focus to that page's
 * <h1> (D4-1). Without this, focus stays on a link that may no longer exist,
 * falling back to <body>, and a screen reader says nothing about the new page.
 * Focusing the heading reads the page name and puts keyboard users at the
 * start of the content.
 *
 * - Only when the *path* changes: filters and pagination change the query
 *   string, and typing in the search box must keep focus there.
 * - Not on the first load: the browser and screen reader handle that.
 * - Pages whose heading arrives with their data (product details) focus it
 *   themselves when it renders; until then, focus goes to <main>.
 * - On Back/Forward ("POP"), focus without scrolling: the page may restore
 *   its own scroll position (the all-products list does, D4-3). New
 *   navigations scroll to the heading, i.e. the top.
 */
export function useFocusOnRouteChange(main: RefObject<HTMLElement | null>): void {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    const region = main.current;
    if (!region) return;
    const heading = region.querySelector<HTMLElement>("h1");
    if (heading) {
      // Focusable from code without joining the Tab order.
      if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1");
      heading.focus({ preventScroll: navigationType === NavigationType.Pop });
    } else {
      region.focus({ preventScroll: navigationType === NavigationType.Pop });
    }
  }, [pathname, main, navigationType]);
}
