// Remember which filtered list a product was opened from, so "Back to products"
// returns to the same view. It's carried in router state, not the URL: the
// details URL stays clean (/products/p-0042) and shareable.

export type FromListState = { listSearch: string };

/** Router state is `unknown` (it can come from anywhere), so narrow it. */
export function isFromListState(value: unknown): value is FromListState {
  return (
    typeof value === "object" &&
    value !== null &&
    "listSearch" in value &&
    typeof value.listSearch === "string"
  );
}

/** "/" or "/?category=ducks&page=2" */
export function productListHref(state: unknown): string {
  return isFromListState(state) && state.listSearch ? `/?${state.listSearch}` : "/";
}
