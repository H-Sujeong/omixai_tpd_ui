import type { CommunitySummary, PpiPanel } from "@/types/api";

/**
 * Pick the community most related to a PPI edge for bi-directional sync
 * (PPI edge click → landscape peak selection).
 *
 * Strategy:
 *   1. If both endpoints appear in another shared community, return that one.
 *      (The edge bridges two memberships — strong semantic signal.)
 *   2. Otherwise, take the union of communities reachable from either endpoint
 *      and pick the one closest in landscape coordinates to the current
 *      community. (Edge direction in landscape space ≈ next neighbourhood.)
 *   3. If nothing is reachable, stay on the current community (return null).
 */
export function findRelatedCommunityFromEdge(
  ppi: PpiPanel,
  edge: { source: string; target: string },
  currentCommunityId: number,
): { communityId: number; reason: "shared" | "nearest"; distance?: number } | null {
  const idx = ppi.node_community_index ?? {};
  const srcComms = (idx[edge.source] ?? []).filter((c) => c !== currentCommunityId);
  const tgtComms = (idx[edge.target] ?? []).filter((c) => c !== currentCommunityId);

  // 1. Shared community across both endpoints
  const shared = srcComms.filter((c) => tgtComms.includes(c));
  if (shared.length > 0) {
    return { communityId: shared[0], reason: "shared" };
  }

  // 2. Nearest by landscape distance
  const candidates = Array.from(new Set([...srcComms, ...tgtComms]));
  if (candidates.length === 0) return null;

  const here = communityLandscape(ppi.communities, currentCommunityId);
  if (!here) return { communityId: candidates[0], reason: "nearest" };

  let best = candidates[0];
  let bestDist = Number.POSITIVE_INFINITY;
  for (const cid of candidates) {
    const there = communityLandscape(ppi.communities, cid);
    if (!there) continue;
    const d = distance3d(here, there);
    if (d < bestDist) {
      bestDist = d;
      best = cid;
    }
  }
  return {
    communityId: best,
    reason: "nearest",
    distance: bestDist === Number.POSITIVE_INFINITY ? undefined : bestDist,
  };
}

function communityLandscape(
  communities: CommunitySummary[],
  id: number,
): { x: number; y: number; z: number } | null {
  const c = communities.find((c) => c.community_id === id);
  return c?.landscape ?? null;
}

function distance3d(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
