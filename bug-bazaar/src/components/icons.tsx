// Icons as inline SVG (D4-2).
//
// These replaced characters the page's font doesn't have: the header emoji
// (🦆 👤 🛒) and the rating star (★). Each makes the browser find and load a
// fallback font during layout, and the header and cards are on the critical
// path. Measured (4x CPU throttle, cold visit): the emoji made the first
// layout about twice as long and the cards appear ~140 ms later; the star
// added ~40 ms more (docs/performance.md). Inline SVG costs no font, no
// request, and follows the text colour. All are decorative: aria-hidden, with
// the meaning carried by the text next to them.

type IconProps = { className?: string };

const common = {
  width: "1.25em",
  height: "1.25em",
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  focusable: false,
} as const;

export function DuckIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path
        fill="#f5b700"
        d="M8.5 4a4.5 4.5 0 0 1 4.37 5.56C16.6 9.3 20 10.6 21 13c.6 3.9-3.4 7-9 7S3 17.4 3 14.3c0-1.7 1.2-3 2.6-3.6A4.5 4.5 0 0 1 8.5 4Z"
      />
      <path fill="#e36414" d="M3.6 7.3 1 8.3l2.7 1.1c.2-.8.5-1.5.9-2.1Z" />
      <circle cx="8.3" cy="7.6" r="1" fill="#1f2933" />
    </svg>
  );
}

export function UserIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CartIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path
        d="M3 4h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 7H6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9.5" cy="19" r="1.5" fill="currentColor" />
      <circle cx="17" cy="19" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** The rating star on every product card (was "★", also a fallback-font glyph). */
export function StarIcon({ className }: IconProps) {
  return (
    <svg {...common} width="1em" height="1em" className={className}>
      <path
        fill="currentColor"
        d="m12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8L12 2.5Z"
      />
    </svg>
  );
}
