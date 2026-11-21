import { useEffect, useId, useState, type FormEvent } from "react";
import { useDebouncedCallback } from "../../../hooks/useDebouncedCallback.ts";
import { CATEGORIES, SORTS, isCategory, isSortOption } from "../../../types/api.ts";
import {
  CATEGORY_LABELS,
  hasActiveFilters,
  SORT_LABELS,
  type ProductFilters as Filters,
} from "../filters.ts";

export const SEARCH_DEBOUNCE_MS = 300;

type ProductFiltersProps = {
  /** Current filters, parsed from the URL (the source of truth). */
  filters: Filters;
  onFiltersChange: (changes: Partial<Filters>) => void;
  onClear: () => void;
  /**
   * True while the typed search differs from the results on screen (waiting
   * for the debounce). Lets the page mark its results as outdated (D2-6).
   */
  onSearchPendingChange?: (pending: boolean) => void;
};

export default function ProductFilters({
  filters,
  onFiltersChange,
  onClear,
  onSearchPendingChange,
}: ProductFiltersProps) {
  const id = useId();

  // The input needs its own draft so typing stays instant while the URL only
  // updates after a pause (one history entry per search, not per keystroke).
  const [draft, setDraft] = useState(filters.search);
  const [syncedSearch, setSyncedSearch] = useState(filters.search);

  // If the URL's search changed from outside (Back, Clear, a pasted link), show
  // it in the input. This is React's "adjust state during render" pattern: no
  // effect, no extra paint with the stale value.
  if (filters.search !== syncedSearch) {
    setSyncedSearch(filters.search);
    if (filters.search !== draft.trim()) setDraft(filters.search);
  }

  const commitSearch = useDebouncedCallback((value: string) => {
    onFiltersChange({ search: value.trim() });
    onSearchPendingChange?.(false);
  }, SEARCH_DEBOUNCE_MS);

  // A URL change from elsewhere wins over a half-typed search still waiting to commit.
  useEffect(() => {
    commitSearch.cancel();
    onSearchPendingChange?.(false);
  }, [filters.search, commitSearch, onSearchPendingChange]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    commitSearch.flush(); // Enter searches immediately
  }

  function handleClear() {
    commitSearch.cancel();
    onSearchPendingChange?.(false);
    setDraft("");
    onClear();
  }

  return (
    <form role="search" aria-label="Filter products" className="filters" onSubmit={handleSubmit}>
      <div className="filters__field filters__field--search">
        <label htmlFor={`${id}-search`}>Search</label>
        <input
          id={`${id}-search`}
          type="search"
          placeholder="Ducks, keyboards, coffee…"
          value={draft}
          onChange={(event) => {
            const value = event.target.value;
            setDraft(value);
            commitSearch.call(value);
            onSearchPendingChange?.(value.trim() !== filters.search);
          }}
          autoComplete="off"
        />
      </div>

      <div className="filters__field">
        <label htmlFor={`${id}-category`}>Category</label>
        <select
          id={`${id}-category`}
          value={filters.category ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onFiltersChange({ category: isCategory(value) ? value : null });
          }}
        >
          <option value="">All categories</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>

      <div className="filters__field">
        <label htmlFor={`${id}-sort`}>Sort by</label>
        <select
          id={`${id}-sort`}
          value={filters.sort}
          onChange={(event) => {
            const value = event.target.value;
            if (isSortOption(value)) onFiltersChange({ sort: value });
          }}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </div>

      <div className="filters__field filters__field--checkbox">
        <input
          id={`${id}-in-stock`}
          type="checkbox"
          checked={filters.inStock}
          onChange={(event) => onFiltersChange({ inStock: event.target.checked })}
        />
        <label htmlFor={`${id}-in-stock`}>In stock only</label>
      </div>

      {hasActiveFilters(filters) && (
        <button type="button" className="filters__clear" onClick={handleClear}>
          Clear filters
        </button>
      )}
    </form>
  );
}
