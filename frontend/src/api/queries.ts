import { useQuery, useMutation } from "@tanstack/react-query";
import { apiGet, apiPost } from "./client";
import type {
  CommunitySwitchResponse,
  DashboardResponse,
  DrugSummaryRow,
  InteractomeNodeResponse,
  PlateSummary,
  PpiPanel,
  ProteinInfo,
} from "@/types/api";

export function useProtein(gene: string | null) {
  return useQuery<ProteinInfo>({
    queryKey: ["protein", gene],
    enabled: !!gene,
    staleTime: 1000 * 60 * 60, // protein metadata is stable; cache for an hour
    queryFn: () => apiGet<ProteinInfo>(`/api/v1/proteins/${encodeURIComponent(gene as string)}`),
  });
}

// Korean function summary — separate (slow, local LLM) so the info panel never
// blocks on it. Long timeout tolerated; cached for the session.
export function useProteinSummary(gene: string | null) {
  return useQuery<{ gene: string; summary: string[] }>({
    queryKey: ["protein-summary", gene],
    enabled: !!gene,
    staleTime: 1000 * 60 * 60,
    retry: false,
    queryFn: () =>
      apiGet<{ gene: string; summary: string[] }>(
        `/api/v1/proteins/${encodeURIComponent(gene as string)}/summary`,
      ),
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

export function useDashboard(
  plateId: string | undefined,
  drugId: string | undefined,
  target?: string,
) {
  return useQuery<DashboardResponse>({
    queryKey: ["dashboard", plateId, drugId, target ?? "default"],
    enabled: !!plateId && !!drugId,
    queryFn: () =>
      apiGet<DashboardResponse>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/dashboard`,
        { target },
      ),
  });
}

export function useCommunityPanel(
  plateId: string | undefined,
  drugId: string | undefined,
  communityId: number | null,
  target?: string,
) {
  return useQuery<PpiPanel>({
    queryKey: ["community", plateId, drugId, target ?? "", communityId],
    enabled: !!plateId && !!drugId && communityId !== null,
    queryFn: () =>
      apiGet<PpiPanel>(
        `/api/v1/plates/${plateId}/drugs/${drugId}/communities/${communityId}`,
        { target },
      ),
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
