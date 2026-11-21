import { useScrolledPast } from "../hooks/useScrolledPast.ts";

type BackToTopProps = {
  /** Show the button after scrolling this many pixels. */
  threshold?: number;
};

/**
 * Appears after scrolling down; scrolls back up and moves keyboard focus to
 * the top of the main content. Not rendered at all while hidden, so it's
 * never an invisible Tab stop.
 */
export default function BackToTop({ threshold = 300 }: BackToTopProps) {
  const visible = useScrolledPast(threshold);
  if (!visible) return null;

  function handleClick() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    // Without this, keyboard focus would stay down here, at the bottom.
    document.getElementById("main")?.focus({ preventScroll: true });
  }

  return (
    <button type="button" className="back-to-top" onClick={handleClick}>
      <span aria-hidden="true">↑ </span>Back to top
    </button>
  );
}
