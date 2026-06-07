import { create } from "zustand";

export type DrugSortKey = "drug_name" | "gr_score" | "growth_class" | "drug_group";

interface DrugListFilterState {
  search: string;
  /** Multi-select: empty = "All groups". */
  filterGroup: string[];
  /** Multi-select: empty = "All effects". On multi-dose plates, a drug matches
   *  if ANY of its by_dose growth_class values is in this set. */
  filterEffect: string[];
  assetsOnly: boolean;
  sortKey: DrugSortKey;
  sortDir: "asc" | "desc";
  set: (patch: Partial<Omit<DrugListFilterState, "set" | "clearFilters" | "toggleGroup" | "toggleEffect">>) => void;
  toggleGroup: (value: string) => void;
  toggleEffect: (value: string) => void;
  clearFilters: () => void;
}

/**
 * Drug-list filter/sort state, held outside the React tree so it survives
 * DrugSummaryPage unmount/remount — i.e. when the user opens a drug dashboard
 * and navigates back, the previous filters/sort are reproduced.
 *
 * 2026-06-08: filterGroup / filterEffect promoted to string[] for checkbox
 * multi-select. Sorting GR / Growth on multi-dose plates uses each drug's
 * worst-case across by_dose (min GR · max severity) per the A-strategy.
 */
export const useDrugListFilters = create<DrugListFilterState>((set) => ({
  search: "",
  filterGroup: [],
  filterEffect: [],
  assetsOnly: false,
  sortKey: "drug_name",
  sortDir: "asc",
  set: (patch) => set(patch),
  toggleGroup: (value) =>
    set((s) => ({
      filterGroup: s.filterGroup.includes(value)
        ? s.filterGroup.filter((v) => v !== value)
        : [...s.filterGroup, value],
    })),
  toggleEffect: (value) =>
    set((s) => ({
      filterEffect: s.filterEffect.includes(value)
        ? s.filterEffect.filter((v) => v !== value)
        : [...s.filterEffect, value],
    })),
  clearFilters: () =>
    set({ search: "", filterGroup: [], filterEffect: [], assetsOnly: false }),
}));
