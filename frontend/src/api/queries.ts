import { useQuery, useMutation, keepPreviousData } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";
import type {
  CommunitySwitchResponse,
  DashboardResponse,
  DrugSummaryRow,
  InteractomeNodeResponse,
  PlateSummary,
  PpiPanel,
  ProteinInfo,
  TimecourseResponse,
} from "@/types/api";

// Protein info. lang="ko" includes the local-LLM Korean summary (slow first
// fetch → shimmer); lang="en" skips it (English UniProt function, fast).
export function useProtein(gene: string | null, lang: "ko" | "en" = "ko") {
  return useQuery<ProteinInfo>({
    queryKey: ["protein", gene, lang],
    enabled: !!gene,
    staleTime: 1000 * 60 * 60,
    retry: false,
    queryFn: () =>
      apiGet<ProteinInfo>(`/api/v1/proteins/${encodeURIComponent(gene as string)}`, { lang }),
    // The LLM bullet summary is generated in the background (instant extractive
    // bullets are served meanwhile). While summary_pending, re-poll so the panel
    // upgrades to the polished summary without a manual refresh.
    refetchInterval: (q) => (q.state.data?.summary_pending ? 10_000 : false),
  });
}

export function usePlates() {
  return useQuery<PlateSummary[]>({
    queryKey: ["plates"],
    queryFn: () => apiGet<PlateSummary[]>("/api/v1/plates"),
  });
}

export function useDrugSummary(plateId: string | undefined) {
  return useQuery<DrugSummaryRow[]>({
    queryKey: ["drugs", plateId],
    enabled: !!plateId,
    queryFn: () => apiGet<DrugSummaryRow[]>(`/api/v1/plates/${plateId}/drugs`),
  });
}

/** Tier 1 timecourse (opt-in v2) — lazy: only enabled when the drawer is open. */
export function useTimecourse(
  plateId: string | undefined,
  drugId: string | undefined,
  target: string | undefined,
  dose: string | undefined,
  enabled: boolean,
  threshold = 0.2,
) {
  return useQuery<TimecourseResponse>({
    queryKey: ["timecourse", plateId, drugId, target ?? "default", dose ?? "default", threshold],
    enabled: enabled && !!plateId && !!drugId,
    queryFn: () =>
      apiGet<TimecourseResponse>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/timecourse`,
        { target, dose, threshold },
      ),
  });
}

export function useDashboard(
  plateId: string | undefined,
  drugId: string | undefined,
  target?: string,
  dose?: string,
  time?: string,
) {
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard", plateId, drugId, target ?? "default", dose ?? "default", time ?? "default"],
    enabled: !!plateId && !!drugId,
    queryFn: () =>
      apiGet<DashboardResponse>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/dashboard`,
        { target, dose, time },
      ),
  });
}

export function useCommunityPanel(
  plateId: string | undefined,
  drugId: string | undefined,
  communityId: number | null,
  target?: string,
  dose?: string,
) {
  return useQuery<PpiPanel>({
    queryKey: ["community", plateId, drugId, target ?? "", dose ?? "", communityId],
    enabled: !!plateId && !!drugId && communityId !== null,
    queryFn: () =>
      apiGet<PpiPanel>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/communities/${communityId}`,
        { target, dose },
      ),
    // While the next community is fetching, keep showing the previous one
    // instead of falling back to the dashboard payload's target community —
    // otherwise the PPI flashes back to the target between every switch.
    placeholderData: keepPreviousData,
  });
}

export function useInteractomeNode(
  plateId: string | undefined,
  drugId: string | undefined,
  target: string | undefined,
  nodeId: string | null,
) {
  return useQuery<InteractomeNodeResponse>({
    queryKey: ["interactome-node", plateId, drugId, target, nodeId],
    enabled: !!plateId && !!drugId && !!nodeId,
    queryFn: () =>
      apiGet<InteractomeNodeResponse>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/interactome/${nodeId}`,
        { target },
      ),
  });
}

export function useSwitchCommunity() {
  return useMutation<
    CommunitySwitchResponse,
    Error,
    {
      plateId: string;
      drugId: string;
      fromCommunityId: number;
      toCommunityId: number;
      bridgingNode: string;
      target?: string;
    }
  >({
    mutationFn: ({ plateId, drugId, fromCommunityId, toCommunityId, bridgingNode, target }) =>
      apiPost<CommunitySwitchResponse>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/communities/switch`,
        {
          from_community_id: fromCommunityId,
          to_community_id: toCommunityId,
          bridging_node: bridgingNode,
          target,
        },
      ),
  });
}
