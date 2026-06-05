"""Compose dashboard payloads from plate data + asset JSONs (no synth fallback)."""

from __future__ import annotations

import json
import logging
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from ..config import get_settings
from ..data_loader import DrugRecord, PlateRecord
from ..schemas import (
    CellLine,
    CommunitySummary,
    CompoundDetails,
    DashboardResponse,
    GoTerm,
    GrCurvePoint,
    InsightFinding,
    InsightSummary,
    InteractomeNodeDetail,
    InteractomeNodeEgo,
    InteractomeGoCategoryItem,
    KpiMetric,
    LandscapeGrid,
    LandscapeNode,
    LandscapePanel,
    LandscapePoint,
    PhenomeTrackingPoint,
    PhenotypicProfiling,
    PpiEdge,
    PpiNode,
    PpiPanel,
    ProvenancePanel,
    ReferenceDatabases,
    TargetProfile,
    TimeLapseFrame,
    TimeLapseViewer,
)
from . import drug_info as drug_info_mod
from . import synthesize as synth

log = logging.getLogger(__name__)


# -----------------------------------------------------------------------------
# PPI node semantic role (PRD §9)
# -----------------------------------------------------------------------------

def _classify_role(corr: float, is_target: bool) -> str:
    """Map raw PPI metrics → semantic role for node coloring."""
    if is_target:
        return "target"
    if corr >= 0.5:
        return "activated"
    if corr <= -0.3:
        return "suppressed"
    if abs(corr) >= 0.1:
        return "info"
    return "unknown"


def _make_ppi_node(raw: dict[str, Any], community_id: int | None) -> PpiNode:
    corr = float(raw.get("corr", 0.0))
    is_target = bool(raw.get("is_target", False))
    degree = int(raw.get("degree", 0))
    return PpiNode(
        id=raw["id"],
        degree=degree,
        corr=corr,
        is_target=is_target,
        community_id=community_id,
        role=_classify_role(corr, is_target),  # type: ignore[arg-type]
        confidence=abs(corr),
        influence=float(degree),
    )


# -----------------------------------------------------------------------------
# Asset loading
# -----------------------------------------------------------------------------

# Real plates nest assets one level deeper under a treatment-time folder
# (<TARGET>_<WELL>/24h/landscape.json). Load 24h by default; 4h is retained on
# disk for a future time toggle. Legacy/mock plates keep the JSON directly in
# <TARGET>_<WELL>/, so the resolver falls back to the un-nested path.
_TIME_PREF = ("24h", "4h")


def _resolve_in_well_dir(well_dir: Path, suffix: str) -> Path | None:
    """Find <suffix>.json in a <TARGET>_<WELL> dir: prefer 24h, then 4h, then
    the un-nested legacy path."""
    for tw in _TIME_PREF:
        cand = well_dir / tw / f"{suffix}.json"
        if cand.exists():
            return cand
    cand = well_dir / f"{suffix}.json"
    return cand if cand.exists() else None


def _load_asset(drug: DrugRecord, target: str, suffix: str) -> dict[str, Any] | None:
    """Load <drug.asset_dir>/<TARGET>_<WELL>/[<24h|4h>/]<suffix>.json.

    Layout (plate-unit): each (drug, target) lives in a `<TARGET>_<WELL_LABEL>/`
    subfolder (e.g. dBET6/BRD3_C05/landscape.json). We resolve WELL_LABEL from
    drug.wells; if there are multiple wells with the same target we take the
    first match. As a last-resort fallback, glob for `<TARGET>_*/<suffix>.json`.
    """
    if not drug.asset_dir or not drug.asset_dir.exists():
        return None

    def _read(path: Path) -> dict[str, Any] | None:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as exc:                                # noqa: BLE001
            log.warning("asset %s load failed: %s", path, exc)
            return None

    # Primary: resolve WELL from drug.wells
    for w in drug.wells:
        if any(t.target == target for t in w.targets):
            cand = _resolve_in_well_dir(drug.asset_dir / f"{target}_{w.well_label}", suffix)
            if cand:
                return _read(cand)
            break  # well resolved but file missing → fall through to glob

    # Fallback: glob the subfolder by target prefix
    for tdir in sorted(drug.asset_dir.glob(f"{target}_*")):
        if tdir.is_dir():
            cand = _resolve_in_well_dir(tdir, suffix)
            if cand:
                return _read(cand)
    return None


# Canonical 4-axis order/labels for Mechanistic Signatures, matching the
# pipeline's tpd_export/moa_bars.py (build_moa_bars output).
_MOA_AXES = ("pac", "cytostatic", "transcriptional_stress", "dna_damage_response")
_MOA_LABELS = {
    "pac": "Protein Abundance Control",
    "cytostatic": "Cytostatic Effect",
    "transcriptional_stress": "Transcriptional Stress",
    "dna_damage_response": "DNA Damage Response",
}


def _moa_bars_to_annotations(on_target_payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Map the pipeline's `on_target["moa_bars"]` block to the Mechanistic
    Signatures rows the UI renders (`[{label, level, value, placeholder}]`).

    No synthetic fallback: if the asset carries no `moa_bars`, return [] so the
    panel hides itself. Each axis' 0-5 `score` becomes the bar `level`; the
    continuous `value` rides along for tooltips, and `_meta.placeholder` (set by
    the dev seed) is surfaced so placeholder data can be flagged in the UI.
    """
    if not on_target_payload:
        return []
    mb = on_target_payload.get("moa_bars")
    if not isinstance(mb, dict):
        return []
    meta = mb.get("_meta", {}) if isinstance(mb.get("_meta"), dict) else {}
    axes = meta.get("axes") or list(_MOA_AXES)
    labels = {**_MOA_LABELS, **(meta.get("labels") or {})}
    placeholder = bool(meta.get("placeholder", False))
    rows: list[dict[str, Any]] = []
    for ax in axes:
        entry = mb.get(ax)
        if not isinstance(entry, dict):
            continue
        try:
            level = int(entry.get("score", 0) or 0)
        except (TypeError, ValueError):
            level = 0
        rows.append({
            "label": labels.get(ax, ax),
            "level": max(0, min(5, level)),
            "value": entry.get("value"),
            "placeholder": placeholder,
        })
    return rows


# -----------------------------------------------------------------------------
# Conversions from asset JSON shapes -> Pydantic
# -----------------------------------------------------------------------------

def _ppi_panel_from_on_target(payload: dict[str, Any], target: str, target_map: dict[str, list[str]]) -> PpiPanel:
    target_community_id: int = payload.get("target_community", 0)
    communities_raw: dict[str, dict[str, Any]] = payload.get("communities", {})
    scatter_raw: list[dict[str, Any]] = payload.get("scatter", [])
    by_community_landscape = {int(p["community_id"]): {"x": p["x"], "y": p["y"], "z": p["z"]} for p in scatter_raw}

    communities: list[CommunitySummary] = []
    for cid_str, body in communities_raw.items():
        try:
            cid = int(cid_str)
        except ValueError:
            continue
        communities.append(CommunitySummary(
            community_id=cid,
            size=body.get("size", 0),
            is_target=body.get("is_target", False),
            distavg=body.get("distavg"),
            corravg=body.get("corravg"),
            landscape=by_community_landscape.get(cid),
        ))

    cur = communities_raw.get(str(target_community_id), {})
    nodes_raw = cur.get("ppi", {}).get("nodes", [])
    edges_raw = cur.get("ppi", {}).get("edges", [])
    go_raw = cur.get("go_terms", [])

    nodes = [_make_ppi_node(n, community_id=target_community_id) for n in nodes_raw]
    edges = [PpiEdge(
        source=e["source"],
        target=e["target"],
        string_score=int(e.get("string_score", 0)),
        corr=float(e.get("corr", 0.0)),
    ) for e in edges_raw]
    go_terms = [GoTerm(
        term=g["term"],
        score=float(g.get("score", 0.0)),
        pvalue=float(g.get("pvalue", 1.0)),
        category=g.get("category", "BP"),
    ) for g in go_raw if g.get("category") in ("BP", "MF", "CC")]

    # Build node -> communities index (target community + any community where the node
    # appears in another community's PPI subgraph).
    node_community_index: dict[str, list[int]] = {}
    for cid_str, body in communities_raw.items():
        try:
            cid = int(cid_str)
        except ValueError:
            continue
        for n in body.get("ppi", {}).get("nodes", []):
            node_community_index.setdefault(n["id"], []).append(cid)

    # Also pull cross-community neighbors via node_interactome
    ni = payload.get("node_interactome", {})
    ni_nodes = ni.get("nodes", {})
    if isinstance(ni_nodes, dict):
        for node_id, body in ni_nodes.items():
            # Look at ego edges to discover bridging communities
            for e in body.get("ego", {}).get("edges", []):
                for endpoint in (e.get("source"), e.get("target")):
                    if endpoint and endpoint != node_id:
                        # We'll associate the neighbor with the node's community list
                        if endpoint in node_community_index:
                            for cid in node_community_index[endpoint]:
                                if cid not in node_community_index.setdefault(node_id, []):
                                    node_community_index[node_id].append(cid)

    return PpiPanel(
        target=target,
        target_community_id=target_community_id,
        current_community_id=target_community_id,
        communities=communities,
        nodes=nodes,
        edges=edges,
        go_terms=go_terms,
        node_community_index=node_community_index,
    )


def _ppi_panel_for_community(payload: dict[str, Any], target: str, community_id: int, target_map: dict[str, list[str]]) -> PpiPanel:
    """Re-build a PPI panel scoped to a specific community within the same on_target payload."""
    target_community_id: int = payload.get("target_community", 0)
    communities_raw: dict[str, dict[str, Any]] = payload.get("communities", {})
    scatter_raw: list[dict[str, Any]] = payload.get("scatter", [])
    by_community_landscape = {int(p["community_id"]): {"x": p["x"], "y": p["y"], "z": p["z"]} for p in scatter_raw}

    communities: list[CommunitySummary] = []
    for cid_str, body in communities_raw.items():
        try:
            cid = int(cid_str)
        except ValueError:
            continue
        communities.append(CommunitySummary(
            community_id=cid,
            size=body.get("size", 0),
            is_target=body.get("is_target", False),
            distavg=body.get("distavg"),
            corravg=body.get("corravg"),
            landscape=by_community_landscape.get(cid),
        ))

    cur = communities_raw.get(str(community_id), {})
    nodes = [_make_ppi_node(n, community_id=community_id) for n in cur.get("ppi", {}).get("nodes", [])]
    edges = [PpiEdge(
        source=e["source"],
        target=e["target"],
        string_score=int(e.get("string_score", 0)),
        corr=float(e.get("corr", 0.0)),
    ) for e in cur.get("ppi", {}).get("edges", [])]
    go_terms = [GoTerm(
        term=g["term"],
        score=float(g.get("score", 0.0)),
        pvalue=float(g.get("pvalue", 1.0)),
        category=g.get("category", "BP"),
    ) for g in cur.get("go_terms", []) if g.get("category") in ("BP", "MF", "CC")]

    node_community_index: dict[str, list[int]] = {}
    for cid_str, body in communities_raw.items():
        try:
            cid = int(cid_str)
        except ValueError:
            continue
        for n in body.get("ppi", {}).get("nodes", []):
            node_community_index.setdefault(n["id"], []).append(cid)

    return PpiPanel(
        target=target,
        target_community_id=target_community_id,
        current_community_id=community_id,
        communities=communities,
        nodes=nodes,
        edges=edges,
        go_terms=go_terms,
        node_community_index=node_community_index,
    )


def _build_landscape_node_index(on_target: dict[str, Any] | None) -> list[LandscapeNode]:
    """protein -> {community, hops-from-hub, community point} index for search.

    For each community we take the **hub** = the highest-degree node, then BFS
    over the community's PPI edges to get each member's hop distance from the
    hub (None when a member is not connected to the hub within the community,
    e.g. an isolated co-clustered node). The protein's plotted position is its
    community's landscape point (the landscape is community-level).
    """
    if not on_target:
        return []
    coords: dict[int, tuple[float, float, float]] = {}
    for s in on_target.get("scatter", []) or []:
        try:
            coords[int(s.get("community_id", -1))] = (
                float(s["x"]), float(s["y"]), float(s["z"]))
        except (KeyError, TypeError, ValueError):
            continue
    out: list[LandscapeNode] = []
    seen: set[str] = set()
    for cid_str, c in (on_target.get("communities") or {}).items():
        try:
            cid = int(cid_str)
        except (TypeError, ValueError):
            continue
        xyz = coords.get(cid)
        if xyz is None:
            continue
        ppi = c.get("ppi", {}) or {}
        nodes = ppi.get("nodes", []) or []
        edges = ppi.get("edges", []) or []
        if not nodes:
            continue
        hub = max(nodes, key=lambda n: n.get("degree", 0)).get("id")
        adj: dict[str, set[str]] = defaultdict(set)
        for e in edges:
            s_, t_ = e.get("source"), e.get("target")
            if s_ and t_:
                adj[s_].add(t_)
                adj[t_].add(s_)
        hops: dict[str, int] = {hub: 0}
        dq = deque([hub])
        while dq:
            u = dq.popleft()
            for v in adj[u]:
                if v not in hops:
                    hops[v] = hops[u] + 1
                    dq.append(v)
        for n in nodes:
            pid = n.get("id")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            out.append(LandscapeNode(
                protein=pid, community_id=cid, hops=hops.get(pid),
                center=hub, x=xyz[0], y=xyz[1], z=xyz[2],
            ))
    # The target itself may be in no community (self-anchor). Add it so it stays
    # searchable — community_id None, positioned at the self-anchor origin.
    target_name = on_target.get("target")
    if target_name and target_name not in seen:
        out.append(LandscapeNode(
            protein=target_name, community_id=None, hops=None,
            center=None, x=0.0, y=0.0, z=1.0,
        ))
    return out


def _landscape_panel_from_asset(
    payload: dict[str, Any],
    scatter_source: dict[str, Any] | None = None,
) -> LandscapePanel:
    """Build LandscapePanel from landscape.json + optionally borrow scatter
    from on_target.json.

    `landscape.json` carries the grid (xi/yi/Z) and axes. Its own `scatter`
    array only has {x,y,z} — *no* community_id / size / is_target — so using
    it directly makes every point default to community 0 and the landscape
    becomes click-equivalent (the bug observed 2026-06-01).

    `on_target.json` carries scatter with full per-community metadata
    (community_id, size, is_target). When provided as `scatter_source` we
    prefer it for the scatter overlay. Falls back to landscape's own scatter
    if no source is given (preserves backward compat with old data).
    """
    grid_raw = payload.get("grid", {})
    grid = None
    if grid_raw and "xi" in grid_raw and "yi" in grid_raw and "Z" in grid_raw:
        grid = LandscapeGrid(
            xi=list(grid_raw["xi"]),
            yi=list(grid_raw["yi"]),
            z=[list(row) for row in grid_raw["Z"]],
        )
    # Prefer on_target.json scatter (carries community_id etc.) if available.
    scatter_raw = None
    if scatter_source is not None:
        scatter_raw = scatter_source.get("scatter")
    if not scatter_raw:
        scatter_raw = payload.get("scatter", [])
    # `is_target` comes straight from the per-community flag. We deliberately do
    # NOT synthesize it from `target_community`: an audit showed 18/80 assets
    # carry a placeholder target_community (0/1) whose target protein is absent
    # from the PPI data — forcing a ✚ there would mark a fabricated target.
    scatter = [LandscapePoint(
        x=float(s["x"]),
        y=float(s["y"]),
        z=float(s["z"]),
        community_id=int(s.get("community_id", 0)),
        size=int(s.get("size", 1)),
        is_target=bool(s.get("is_target", False)),
    ) for s in scatter_raw]
    return LandscapePanel(
        axes=payload.get("axes", {}),
        grid=grid,
        scatter=scatter,
        target_point=payload.get("target_point"),
        node_index=_build_landscape_node_index(scatter_source),
    )


# -----------------------------------------------------------------------------
# Helpers: phenotype, time-lapse, etc.
# -----------------------------------------------------------------------------

def _pick_representative_well(drug: DrugRecord) -> Any | None:
    if not drug.wells:
        return None
    # Prefer wells with valid effect_class
    valid = [w for w in drug.wells if w.effect_class and w.effect_class != "invalid"]
    return (valid or drug.wells)[0]


def _build_phenotypic(plate: PlateRecord, drug: DrugRecord) -> PhenotypicProfiling | None:
    well = _pick_representative_well(drug)
    if well is None or not well.gr_curve:
        return None
    gr_drug = [GrCurvePoint(t_hours=float(t), grv=float(v)) for t, v in well.gr_curve]
    gr_dmso = []
    if plate.gr_dmso:
        n = min(len(plate.gr_dmso), len(plate.gr_t_hours))
        gr_dmso = [GrCurvePoint(t_hours=float(plate.gr_t_hours[i]), grv=float(plate.gr_dmso[i])) for i in range(n)]
    track_drug = synth.phenome_track_from_gr(
        [v for _, v in well.gr_curve],
        plate.gr_dmso,
    )
    # The GR curve already spans exactly the drug-effect window, so the window is
    # just its time range (used only to label the score — not a sub-region).
    gr_window = [gr_drug[0].t_hours, gr_drug[-1].t_hours] if gr_drug else None
    return PhenotypicProfiling(
        gr_curve=gr_drug,
        gr_curve_dmso=gr_dmso,
        gr_score=well.gr_score,
        growth_class=_classify_growth(well),
        gr_window=gr_window,
        phenome_drug=[PhenomeTrackingPoint(t_step=p["t_step"], deviation=p["deviation"]) for p in track_drug],
        phenome_dmso=[PhenomeTrackingPoint(t_step=i, deviation=0.0) for i in range(len(track_drug))],
    )


def _classify_growth(well: Any) -> str | None:
    if well.effect_class in (None, "", "invalid"):
        return None
    if well.gr_score is not None and well.gr_score < -0.05:
        return "Strong cytotoxic"
    if well.gr_score is not None and well.gr_score < 0.2:
        return "Cytotoxic"
    if well.gr_score is not None and well.gr_score < 0.6:
        return "Cytostatic"
    return "Growth-permissive"


# Hour token, decimal-aware: matches both the legacy mosaic-style name
# (r03_c05_4h0.png -> "4h") and the per-well TimeLapse export
# (C05_0.5h_3056cells.png -> "0.5h"). The optional per-frame cell count is
# captured separately from the "<n>cells" token when present.
_FRAME_HOUR_RE = re.compile(r"(\d+(?:\.\d+)?)h", re.IGNORECASE)
_FRAME_CELLS_RE = re.compile(r"(\d+)cells", re.IGNORECASE)


def _frames_from_drug_assets(drug: DrugRecord, base_prefix: str) -> list[TimeLapseFrame]:
    """Frames from drug-specific timelapse folder.

    Supports decimal-hour timepoints (0.5h, 1.5h, ...) and an optional
    per-frame cell count embedded in the filename. The full set of frames is
    always returned; the UI subsamples by interval client-side.
    """
    if not drug.asset_dir:
        return []
    tdir = drug.asset_dir / "timelapse"
    if not tdir.exists():
        return []
    out: list[TimeLapseFrame] = []
    for p in sorted(tdir.glob("*.png")):
        m = _FRAME_HOUR_RE.search(p.name)
        if not m:
            continue
        cm = _FRAME_CELLS_RE.search(p.name)
        out.append(TimeLapseFrame(
            t_hours=float(m.group(1)),
            image_url=f"{base_prefix}/drug-asset/{drug.drug_id}/timelapse/{p.name}",
            n_cells=int(cm.group(1)) if cm else None,
        ))
    out.sort(key=lambda f: f.t_hours)
    return out


def _frames_from_mosaic(
    plate: PlateRecord,
    drug: DrugRecord,
    base_prefix: str,
) -> tuple[list[TimeLapseFrame], str | None]:
    """Frames from plate-level mosaic_4h/, scoped to one well of the drug."""
    if not plate.mosaic_dir or not plate.mosaic_dir.exists():
        return [], None
    well = _pick_representative_well(drug)
    if not well:
        return [], None
    row_idx = ord(well.row.upper()) - ord("A") + 1
    prefix = f"r{row_idx:02d}_c{well.column:02d}_"
    files = sorted(plate.mosaic_dir.glob(f"{prefix}*.png"))
    frames: list[TimeLapseFrame] = []
    for p in files:
        m = re.search(r"_(\d+)h", p.name)
        if not m:
            continue
        t = float(m.group(1))
        frames.append(TimeLapseFrame(
            t_hours=t,
            image_url=f"{base_prefix}/mosaic/{plate.plate_id}/{p.name}",
        ))
    frames.sort(key=lambda f: f.t_hours)
    return frames, well.well_label


# -----------------------------------------------------------------------------
# Public composition entry-point
# -----------------------------------------------------------------------------

def _compute_kpis(
    phenotypic: PhenotypicProfiling | None,
    ppi: PpiPanel | None,
    target: str,
    drug_group: str | None,
) -> list[KpiMetric]:
    """Headline KPIs (PRD §6) — Phenotype Shift / Cell Viability / Target Confidence / Toxicity."""
    out: list[KpiMetric] = []

    # Phenotype Shift = (DMSO_final − Drug_final) / DMSO_final at last GR timepoint
    if phenotypic and phenotypic.gr_curve:
        drug_final = phenotypic.gr_curve[-1].grv
        dmso_final = phenotypic.gr_curve_dmso[-1].grv if phenotypic.gr_curve_dmso else 1.0
        if dmso_final != 0:
            shift = (dmso_final - drug_final) / abs(dmso_final)
        else:
            shift = 0.0
        sentiment = "negative" if shift > 0.3 else "warning" if shift > 0.05 else "positive"
        sign = "+" if shift >= 0 else ""
        out.append(KpiMetric(
            label="Phenotype Shift",
            value=f"{sign}{shift * 100:.0f}%",
            raw=float(shift),
            direction="up" if shift > 0 else "down",
            sentiment=sentiment,
            hint="Δ vs DMSO @ end-of-track",
        ))

        # Cell Viability ≈ GR_drug(final) / GR_dmso(final) clamped to [0, 1.2]
        if dmso_final > 0:
            vy = max(0.0, drug_final / dmso_final)
        else:
            vy = drug_final
        out.append(KpiMetric(
            label="Cell Viability",
            value=f"{vy * 100:.0f}%",
            raw=float(vy),
            direction="up" if vy >= 0.8 else "down",
            sentiment="positive" if vy >= 0.8 else "warning" if vy >= 0.4 else "negative",
            hint="vs DMSO baseline",
        ))
    else:
        out.append(KpiMetric(label="Phenotype Shift", value="—", sentiment="neutral", hint="no GR data"))
        out.append(KpiMetric(label="Cell Viability", value="—", sentiment="neutral", hint="no GR data"))

    # Target Confidence = abs(corr) for the target node, or average top-3 corr of in-community partners
    if ppi:
        target_node = next((n for n in ppi.nodes if n.id == target or n.is_target), None)
        if target_node and abs(target_node.corr) > 0:
            conf = min(1.0, abs(target_node.corr))
        else:
            non_target_corrs = sorted((abs(n.corr) for n in ppi.nodes if not n.is_target), reverse=True)[:3]
            conf = sum(non_target_corrs) / len(non_target_corrs) if non_target_corrs else 0.0
        out.append(KpiMetric(
            label="Target Confidence",
            value=f"{conf:.2f}",
            raw=conf,
            sentiment="positive" if conf >= 0.7 else "warning" if conf >= 0.4 else "negative",
            hint="PPI corr (target node)",
        ))
    else:
        out.append(KpiMetric(label="Target Confidence", value="—", sentiment="neutral", hint="no PPI"))

    # Toxicity bucket from growth class
    tox_label, tox_sent = "Unknown", "neutral"
    if phenotypic and phenotypic.growth_class:
        gc = phenotypic.growth_class.lower()
        if "strong cytotoxic" in gc:
            tox_label, tox_sent = "High", "negative"
        elif "cytotoxic" in gc:
            tox_label, tox_sent = "Moderate", "warning"
        elif "cytostatic" in gc:
            tox_label, tox_sent = "Low (cytostatic)", "warning"
        else:
            tox_label, tox_sent = "Low", "positive"
    out.append(KpiMetric(
        label="Toxicity",
        value=tox_label,
        sentiment=tox_sent,
        hint=phenotypic.growth_class if phenotypic else None,
    ))

    return out


def _compute_insight(
    drug: DrugRecord,
    target: str,
    drug_group: str | None,
    kpis: list[KpiMetric],
    moa_summary: str,
    ppi: PpiPanel | None,
    enrichment: list[GoTerm],
) -> InsightSummary:
    """PRD §7 Insight Sidebar — mechanism summary + key findings + biomarkers + notes."""
    findings: list[InsightFinding] = []
    kpis_by_label = {k.label: k for k in kpis}

    shift = kpis_by_label.get("Phenotype Shift")
    if shift and shift.raw is not None:
        if shift.raw > 0.4:
            findings.append(InsightFinding(
                title=f"Strong phenotype shift ({shift.value})",
                detail="DMSO 대비 종점 growth rate가 큰 폭으로 떨어집니다 — 효과가 명확합니다.",
                sentiment="negative",
                icon="trend-down",
            ))
        elif shift.raw > 0.1:
            findings.append(InsightFinding(
                title=f"Moderate phenotype shift ({shift.value})",
                detail="DMSO 대비 부분적인 GR 감소. cytostatic 가능성 검토 필요.",
                sentiment="warning",
                icon="trend-down",
            ))
        else:
            findings.append(InsightFinding(
                title=f"Phenotype within DMSO band ({shift.value})",
                detail="현재 dose에서 강한 표현형 변화는 보이지 않습니다.",
                sentiment="neutral",
                icon="pulse",
            ))

    confidence = kpis_by_label.get("Target Confidence")
    if confidence and confidence.raw is not None:
        if confidence.raw >= 0.7:
            findings.append(InsightFinding(
                title=f"High target confidence ({confidence.value})",
                detail=f"{target} 노드 PPI 상관이 높습니다 — on-target 시그널 신뢰 가능.",
                sentiment="positive",
                icon="target",
            ))
        elif confidence.raw < 0.4:
            findings.append(InsightFinding(
                title=f"Low target confidence ({confidence.value})",
                detail="PPI 상관이 낮습니다 — 다른 target 또는 off-target 효과를 의심.",
                sentiment="warning",
                icon="warning",
            ))

    if ppi:
        n_suppressed = sum(1 for n in ppi.nodes if n.role == "suppressed")
        n_activated = sum(1 for n in ppi.nodes if n.role == "activated")
        if n_activated + n_suppressed > 0:
            findings.append(InsightFinding(
                title=f"PPI module: {n_activated} activated · {n_suppressed} suppressed",
                detail=f"community {ppi.current_community_id}에서 부정 상관 노드가 {n_suppressed}개 발견됨.",
                sentiment="neutral",
                icon="info",
            ))

    if enrichment:
        top = enrichment[0]
        findings.append(InsightFinding(
            title=f"Top GO term: {top.term[:60]}{'…' if len(top.term) > 60 else ''}",
            detail=f"category {top.category} · score {top.score:.1f} · p={top.pvalue:.1e}",
            sentiment="neutral",
            icon="info",
        ))

    # Biomarkers — community partners with strong abs(corr)
    biomarkers: list[str] = []
    if ppi:
        # Keep target node first if present, then partners by |corr| desc
        ordered = sorted(
            (n for n in ppi.nodes if not n.is_target),
            key=lambda n: abs(n.corr),
            reverse=True,
        )
        biomarkers = [n.id for n in ordered[:6]]
        targets = [n.id for n in ppi.nodes if n.is_target]
        biomarkers = targets + biomarkers

    notes: list[str] = []
    if drug_group:
        notes.append(f"Drug group: {drug_group}")
    notes.append("Cell line: U2OS · 48h treatment · 4h imaging cadence")

    return InsightSummary(
        mechanism=moa_summary,
        key_findings=findings,
        biomarkers=biomarkers,
        experimental_notes=notes,
    )


def build_dashboard(
    plate: PlateRecord,
    drug: DrugRecord,
    target: str | None,
    file_prefix: str,
) -> DashboardResponse:
    available_targets = [t.target for t in drug.targets] or ["unknown"]
    if not target or target not in available_targets:
        target = available_targets[0]

    info = drug_info_mod.get_drug_info(
        drug.drug_id,
        drug.drug_name,
        drug.hy_code,
        available_targets,
        drug.drug_group,
        drug.smiles,
    )

    compound = CompoundDetails(
        drug_id=drug.drug_id,
        drug_name=drug.drug_name,
        hy_code=drug.hy_code,
        smiles=drug.smiles,
        dose_um=plate.dose_um,
        treatment_hours=48.0,
        structure_image_url=info.get("structure_image_url"),
    )

    target_profile = TargetProfile(
        targets=available_targets,
        target_class=drug.target_class,
        drug_group=drug.drug_group,
        pathway=info["pathway"],
        moa=info["moa"],
    )

    cell_line = CellLine(
        name="U2OS",
        species="Human",
        tissue="Osteosarcoma",
        morphology="Adherent",
        description="Imaging-friendly perturbation assay standard line",
    )

    # Reference DB links (per target)
    references_by_target: dict[str, dict[str, str]] = {}
    refs_cached = info.get("references", {})
    for t in available_targets:
        refs_for_t = refs_cached.get(t) if isinstance(refs_cached, dict) else None
        if refs_for_t:
            references_by_target[t] = refs_for_t
        else:
            references_by_target[t] = {
                "Ensembl": f"https://www.ensembl.org/Multi/Search/Results?q={t}",
                "Entrez": f"https://www.ncbi.nlm.nih.gov/gene/?term={t}",
                "UniProt": f"https://www.uniprot.org/uniprotkb?query={t}",
                "HPA": f"https://www.proteinatlas.org/search/{t}",
            }
    references = ReferenceDatabases(by_target=references_by_target)

    phenotypic = _build_phenotypic(plate, drug)

    # Time-lapse: prefer drug-specific timelapse asset, fallback to plate mosaic for one well
    frames = _frames_from_drug_assets(drug, file_prefix)
    well_id = None
    if not frames:
        frames, well_id = _frames_from_mosaic(plate, drug, file_prefix)
    else:
        well = _pick_representative_well(drug)
        well_id = well.well_label if well else None

    # Prefer the real count parsed from the earliest frame's filename
    # (frames are sorted by t_hours, so frames[0] is t=0). Fall back to the
    # legacy placeholder only when the filename carries no cell count.
    n_cells_t0 = None
    if frames:
        n_cells_t0 = frames[0].n_cells if frames[0].n_cells is not None else 2915

    time_lapse = TimeLapseViewer(
        frames=frames,
        um_per_pixel=get_settings().um_per_pixel,
        well_id=well_id,
        n_cells_t0=n_cells_t0,
    )

    # PPI + Landscape — prefer real assets keyed by current target
    on_target_payload = _load_asset(drug, target, "on_target")
    landscape_payload = _load_asset(drug, target, "landscape")
    # No synthetic fallback: when the real asset JSON is absent, leave the panel
    # empty (None) so the UI shows "데이터 없음" instead of fabricated PPI/landscape.
    ppi = _ppi_panel_from_on_target(on_target_payload, target, plate.target_map) if on_target_payload else None
    # Pass on_target_payload so the scatter overlay carries real community_id /
    # is_target / size (the landscape.json scatter only has x/y/z).
    landscape = _landscape_panel_from_asset(landscape_payload, on_target_payload) if landscape_payload else None

    enrichment = sorted(ppi.go_terms, key=lambda g: g.score, reverse=True)[:12] if ppi else []

    status_flags = {
        "compound": "ok",
        "target_profile": "ok" if available_targets else "empty",
        "cell_line": "ok",
        "references": "ok",
        "phenotypic": "ok" if phenotypic else "empty",
        "time_lapse": "ok" if frames else "empty",
        "ppi": "ok" if on_target_payload else "empty",
        "landscape": "ok" if landscape_payload else "empty",
    }
    moa_summary = info["moa"]
    # Mechanistic Signatures now read the pipeline's real `moa_bars` (4 MoA axes,
    # 0-5 each) from on_target.json. No synthetic fallback: when the asset has no
    # moa_bars the panel stays empty instead of fabricating levels.
    localization = _moa_bars_to_annotations(on_target_payload)

    kpis = _compute_kpis(phenotypic, ppi, target, drug.drug_group)
    insight = _compute_insight(drug, target, drug.drug_group, kpis, moa_summary, ppi, enrichment)

    return DashboardResponse(
        plate_id=plate.plate_id,
        drug_id=drug.drug_id,
        drug_name=drug.drug_name,
        target_id=target,
        available_targets=available_targets,
        compound=compound,
        target_profile=target_profile,
        cell_line=cell_line,
        references=references,
        phenotypic=phenotypic,
        time_lapse=time_lapse,
        ppi=ppi,
        landscape=landscape,
        enrichment=enrichment,
        moa_summary=moa_summary,
        localization_annotations=localization,
        status_flags=status_flags,
        provenance=ProvenancePanel(
            plate_id=plate.plate_id,
            drug_id=drug.drug_id,
            target_id=target,
            pipeline_version="demo-0.1",
            generated_at=datetime.now(timezone.utc).isoformat(),
        ),
        kpis=kpis,
        insight=insight,
    )


def switch_community(
    plate: PlateRecord,
    drug: DrugRecord,
    target: str,
    to_community_id: int,
) -> dict[str, Any] | None:
    """Return a new PPI panel scoped to `to_community_id` for the same target,
    or None if the drug has no PPI asset (on_target.json)."""
    payload = _load_asset(drug, target, "on_target")
    if not payload:
        return None
    new_panel = _ppi_panel_for_community(payload, target, to_community_id, plate.target_map)
    return new_panel.model_dump()


def interactome_node(
    plate: PlateRecord,
    drug: DrugRecord,
    target: str,
    node_id: str,
) -> InteractomeNodeDetail | None:
    """E12 Level 2 — ego graph + GO + decay for a single PPI node."""
    payload = _load_asset(drug, target, "on_target")
    if payload:
        ni = payload.get("node_interactome", {}).get("nodes", {})
        body = ni.get(node_id) if isinstance(ni, dict) else None
        if body:
            ego_nodes = [PpiNode(
                id=n["id"], degree=int(n.get("degree", 0)),
                corr=float(n.get("corr", 0.0)),
                is_target=bool(n.get("is_target", False)),
            ) for n in body.get("ego", {}).get("nodes", [])]
            ego_edges = [PpiEdge(
                source=e["source"], target=e["target"],
                string_score=int(e.get("string_score", 0)),
                corr=float(e.get("corr", 0.0)),
            ) for e in body.get("ego", {}).get("edges", [])]
            go_terms_raw: dict[str, list[dict[str, Any]]] = body.get("go_terms", {}) or {}
            go_terms = {
                k: [InteractomeGoCategoryItem(
                    term=g["term"], score=float(g.get("score", 0)), pvalue=float(g.get("pvalue", 1.0))
                ) for g in v] for k, v in go_terms_raw.items()
            }
            decay = body.get("decay", [])  # may be empty in this dataset
            return InteractomeNodeDetail(
                node_id=node_id,
                ego=InteractomeNodeEgo(nodes=ego_nodes, edges=ego_edges),
                go_terms=go_terms,
                decay=decay,
            )
    # No asset / node not in interactome → no data (no synth fallback).
    return None
