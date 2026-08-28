import { atom } from "nanostores";

/**
 * Catalog state shared with the header. The search box and the filters toggle
 * now live in the header, which is a separate island root from the grid they
 * drive — same reason cartOpen is a store rather than component state.
 *
 * Catalog still owns the filters themselves; these are only the pieces the
 * header has to read or write.
 */

/** The search text, written by the header input and read by the grid. */
export const searchQuery = atom("");

export function setSearchQuery(value: string): void {
  searchQuery.set(value);
}

/** Whether the filters modal is open. */
export const filtersOpen = atom(false);

export function toggleFilters(): void {
  filtersOpen.set(!filtersOpen.get());
}

export function closeFilters(): void {
  filtersOpen.set(false);
}

/**
 * How many sort/price filters are active. Published by Catalog so the header
 * button can show its badge without duplicating the counting rule.
 */
export const activeFilterCount = atom(0);

export function setActiveFilterCount(count: number): void {
  activeFilterCount.set(count);
}
