"""Synthesizes dashboard-ready payloads for drugs that lack pre-computed assets.

The real on_target / landscape JSON exist only for select drugs (e.g. dBET6/BRD3).
For every other (drug, target) pair we build a minimal-but-coherent PPI/landscape
structure from `target_map_clean.json` so the dashboard remains usable.
"""

from __future__ import annotations

import hashlib
import math
import random
from dataclasses import dataclass
from typing import Any

from ..schemas import (
    CommunitySummary,
    GoTerm,
    LandscapeGrid,
    LandscapePanel,
    LandscapePoint,
    PpiEdge,
    PpiNode,
    PpiPanel,
)

_GO_PLACEHOLDERS = {
    "BP": [
        "Regulation of transcription, DNA-templated (GO:0006355)",
        "Cellular response to stimulus (GO:0051716)",
        "Protein ubiquitination (GO:0016567)",
        "Cell cycle process (GO:0022402)",
        "Chromatin remodeling (GO:0006338)",
    ],
    "MF": [
        "Protein binding (GO:0005515)",
        "Sequence-specific DNA binding (GO:0043565)",
        "Histone modification (GO:0016570)",
        "Kinase activity (GO:0016301)",
        "Ubiquitin ligase activity (GO:0061630)",
    ],
    "CC": [
        "Nucleus (GO:0005634)",
        "Cytosol (GO:0005829)",
        "Chromatin (GO:0000785)",
        "Membrane (GO:0016020)",
        "Ribonucleoprotein complex (GO:1990904)",
    ],
}


def _seeded(seed: str) -> random.Random:
    return random.Random(int(hashlib.md5(seed.encode()).hexdigest(), 16))


@dataclass
class CommunityShape:
    community_id: int
    name: str
    members: list[str]
    is_target: bool
    x: float
    y: float
    z: float
    size: int


def build_communities_from_target_map(
    target_map: dict[str, list[str]],
    target_gene: str,
) -> list[CommunityShape]:
    out: list[CommunityShape] = []
    rng = _seeded(target_gene + "/seed")
    target_group = None
    for grp, genes in target_map.items():
        if target_gene in genes:
            target_group = grp
            break
    for idx, (grp, genes) in enumerate(target_map.items()):
        is_t = grp == target_group
        # Polar-ish layout: stable based on group hash
        angle = (hash(grp) % 360) * math.pi / 180
        r = 1.6 + 1.4 * rng.random()
        out.append(CommunityShape(
            community_id=idx,
            name=grp,
            members=list(genes),
            is_target=is_t,
            x=r * math.cos(angle) + 2.0,
            y=r * math.sin(angle) + 1.5,
            z=0.05 + 0.4 * rng.random(),
            size=len(genes),
        ))
    return out


def synth_ppi_panel(
    target_gene: str,
    target_map: dict[str, list[str]],
) -> PpiPanel:
    rng = _seeded(target_gene + "/ppi")
    shapes = build_communities_from_target_map(target_map, target_gene)
    tcomm: CommunityShape | None = next((c for c in shapes if c.is_target), None)
    if tcomm is None:
        # Target outside the known map — make a singleton synthetic community
        tcomm = CommunityShape(
            community_id=len(shapes),
            name=f"Synthetic_{target_gene}",
            members=[target_gene] + [f"{target_gene}_partner_{i}" for i in range(8)],
            is_target=True,
            x=2.0,
            y=1.5,
            z=0.4,
            size=9,
        )
        shapes.append(tcomm)

    # PPI nodes — target + community members + a few external bridges
    nodes: list[PpiNode] = []
    seen: set[str] = set()
    for g in tcomm.members[:24]:
        if g in seen:
            continue
        seen.add(g)
        is_tgt = g == target_gene
        corr = round(rng.uniform(-0.5, 0.9), 3)
        deg = rng.randint(2, 14)
        role = (
            "target" if is_tgt
            else "activated" if corr >= 0.5
            else "suppressed" if corr <= -0.3
            else "info" if abs(corr) >= 0.1
            else "unknown"
        )
        nodes.append(PpiNode(
            id=g,
            degree=deg,
            corr=corr,
            is_target=is_tgt,
            community_id=tcomm.community_id,
            role=role,  # type: ignore[arg-type]
            confidence=abs(corr),
            influence=float(deg),
        ))
    # External bridges from neighbouring communities
    bridges: list[tuple[str, int]] = []
    others = [c for c in shapes if c.community_id != tcomm.community_id]
    for ext in others[:3]:
        if not ext.members:
            continue
        partner = ext.members[0]
        bridges.append((partner, ext.community_id))
        if partner not in seen:
            seen.add(partner)
            corr = round(rng.uniform(-0.3, 0.7), 3)
            deg = rng.randint(2, 10)
            role = (
                "activated" if corr >= 0.5
                else "suppressed" if corr <= -0.3
                else "info" if abs(corr) >= 0.1
                else "unknown"
            )
            nodes.append(PpiNode(
                id=partner,
                degree=deg,
                corr=corr,
                is_target=False,
                community_id=ext.community_id,
                role=role,  # type: ignore[arg-type]
                confidence=abs(corr),
                influence=float(deg),
            ))

    # Edges — ring + a few random shortcuts, plus bridge edges to target
    edges: list[PpiEdge] = []
    cluster_nodes = [n for n in nodes if n.community_id == tcomm.community_id]
    for i in range(len(cluster_nodes)):
        a = cluster_nodes[i]
        b = cluster_nodes[(i + 1) % len(cluster_nodes)]
        edges.append(PpiEdge(source=a.id, target=b.id, string_score=rng.randint(420, 800), corr=round(rng.uniform(0.3, 0.9), 3)))
    for _ in range(min(6, max(1, len(cluster_nodes) // 4))):
        a, b = rng.sample(cluster_nodes, 2) if len(cluster_nodes) >= 2 else (cluster_nodes[0], cluster_nodes[0])
        if a.id != b.id:
            edges.append(PpiEdge(source=a.id, target=b.id, string_score=rng.randint(400, 700), corr=round(rng.uniform(0.2, 0.8), 3)))
    for partner_id, _ in bridges:
        edges.append(PpiEdge(source=target_gene, target=partner_id, string_score=rng.randint(420, 600), corr=round(rng.uniform(0.2, 0.6), 3)))

    # GO terms — pull from placeholder pool deterministically
    go_terms: list[GoTerm] = []
    for cat in ("BP", "MF", "CC"):
        for i, term in enumerate(_GO_PLACEHOLDERS[cat][:5]):
            go_terms.append(GoTerm(
                term=term,
                score=round(rng.uniform(50, 900), 1),
                pvalue=10 ** -rng.uniform(2.5, 9.0),
                category=cat,  # type: ignore[arg-type]
            ))

    # Communities summary
    communities = [
        CommunitySummary(
            community_id=c.community_id,
            size=c.size,
            is_target=c.is_target,
            distavg=round(2.0 + rng.uniform(0.0, 1.6), 3),
            corravg=round(rng.uniform(-0.1, 0.6), 3),
            landscape={"x": c.x, "y": c.y, "z": c.z},
        )
        for c in shapes
    ]

    # Node -> community index
    node_community_index: dict[str, list[int]] = {}
    for n in nodes:
        node_community_index[n.id] = [n.community_id] if n.community_id is not None else []
    # Bridge nodes additionally point at the target community
    for partner_id, _ in bridges:
        node_community_index.setdefault(partner_id, []).append(tcomm.community_id)

    return PpiPanel(
        target=target_gene,
        target_community_id=tcomm.community_id,
        current_community_id=tcomm.community_id,
        communities=communities,
        nodes=nodes,
        edges=edges,
        go_terms=go_terms,
        node_community_index=node_community_index,
    )


def synth_landscape_panel(ppi: PpiPanel) -> LandscapePanel:
    scatter = [
        LandscapePoint(
            x=c.landscape["x"] if c.landscape else 0.0,
            y=c.landscape["y"] if c.landscape else 0.0,
            z=c.landscape["z"] if c.landscape else 0.0,
            community_id=c.community_id,
            size=c.size,
            is_target=c.is_target,
        )
        for c in ppi.communities
    ]
    target = next((s for s in scatter if s.is_target), scatter[0] if scatter else None)
    return LandscapePanel(
        axes={
            "x": "Distance from anchor",
            "y": "-log10(p)",
            "z": "avg(PCC) for module",
        },
        grid=None,
        scatter=scatter,
        target_point={"x": target.x, "y": target.y, "z": target.z} if target else None,
    )


def gr_curve_for_dmso(t_hours: list[float], gr_dmso: list[float]) -> list[dict[str, float]]:
    if len(t_hours) != len(gr_dmso):
        n = min(len(t_hours), len(gr_dmso))
        t_hours = t_hours[:n]
        gr_dmso = gr_dmso[:n]
    return [{"t_hours": float(t), "grv": float(v)} for t, v in zip(t_hours, gr_dmso)]


def phenome_track_from_gr(gr_values: list[float], dmso_values: list[float]) -> list[dict[str, Any]]:
    """Compress GR drug-vs-DMSO into a 10-step deviation track."""
    if not gr_values:
        return []
    n_target = 10
    n = len(gr_values)
    out = []
    for step in range(n_target + 1):
        idx = int(round(step * (n - 1) / n_target)) if n > 1 else 0
        dmso = dmso_values[idx] if idx < len(dmso_values) and dmso_values else 1.0
        drug = gr_values[idx] if idx < len(gr_values) else 0.0
        deviation = float(dmso - drug)
        out.append({"t_step": step, "deviation": deviation})
    return out
