import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlateSortKey = "title" | "created_at" | "updated_at" | "n_drugs";
export type PlateView = "card" | "table";

interface PlateListViewState {
  sortKey: PlateSortKey;
  sortDir: "asc" | "desc";
  view: PlateView;
  set: (patch: Partial<Omit<PlateListViewState, "set">>) => void;
}

/**
 * Plate-list sort + card/table view preference. Persisted so the choice sticks
 * across sessions (same pattern as the language toggle).
 */
export const usePlateListView = create<PlateListViewState>()(
  persist(
    (set) => ({
      sortKey: "title",
      sortDir: "asc",
      view: "card",
      set: (patch) => set(patch),
    }),
    { name: "omixai-plate-list-view-v2" },
  ),
);
