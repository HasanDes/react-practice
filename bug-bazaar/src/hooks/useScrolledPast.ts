import { useEffect, useState } from "react";

/**
 * True once the window has scrolled more than `threshold` pixels.
 *
 * - The scroll listener is passive (never blocks scrolling) and throttled to
 *   one check per animation frame, since scroll events can fire many times per frame.
 * - It only re-renders when the boolean flips, not on every pixel.
 * - Cleanup removes the listener *and* cancels a pending frame, so nothing
 *   keeps running after the component unmounts (D2-4).
 */
export function useScrolledPast(threshold: number): boolean {
  const [isPast, setIsPast] = useState(() => window.scrollY > threshold);

  useEffect(() => {
    let frame: number | null = null;

    const check = () => {
      frame = null;
      // Same value → React bails out of the re-render.
      setIsPast(window.scrollY > threshold);
    };
    const onScroll = () => {
      frame ??= requestAnimationFrame(check);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return isPast;
}
