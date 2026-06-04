import { create } from "zustand";

export type DrugSortKey = "drug_name" | "gr_score" | "growth_class" | "drug_group";

interface DrugListFilterState {
  search: string;
  filterGroup: string;
  filterEffect: string;
  assetsOnly: boolean;
  sortKey: DrugSortKey;
  sortDir: "asc" | "desc";
  set: (patch: Partial<Omit<DrugListFilterState, "set" | "clearFilters">>) => void;
  clearFilters: () => void;
}

/**
 * Drug-list filter/sort state, held outside the React tree so it survives
 * DrugSummaryPage unmount/remount — i.e. when the user opens a drug dashboard
 * and navigates back, the previous filters/sort are reproduced.
 */
export const useDrugListFilters = create<DrugListFilterState>((set) => ({
  search: "",
  filterGroup: "",
  filterEffect: "",
  assetsOnly: false,
  sortKey: "drug_name",
  sortDir: "asc",
  set: (patch) => set(patch),
  clearFilters: () =>
    set({ search: "", filterGroup: "", filterEffect: "", assetsOnly: false }),
}));
