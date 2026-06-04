"""Pydantic schemas — API I/O single source of truth.

Mirrored in frontend/src/types/api.ts (keep in sync manually for v1).
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# -----------------------------------------------------------------------------
# Plate (Analysis) summary
# -----------------------------------------------------------------------------

class PlateSummary(BaseModel):
    """Light summary of one analysis plate (for the plate-list page)."""

    plate_id: str = Field(..., description="Stable identifier, e.g. 'D3_10'")
    plate_code: str = Field(..., description="Human plate code, e.g. 'D3'")
    dose_um: float | None = Field(None, description="Concentration in µM")
    treatment_hours: float | None = Field(None, description="Treatment duration")
    cell_line: str | None = None
    n_wells: int = 0
    n_drugs: int = 0
    generated_at: str | None = None
    pipeline_version: str | None = None
    has_dashboard_assets: bool = False


# -----------------------------------------------------------------------------
# Drug summary row (for the drug-summary table within a plate)
# -----------------------------------------------------------------------------

class DrugTargetEntry(BaseModel):
    target: str
    if_g: bool = Field(False, description="If=G flag from D3_target.csv")
    e3_ligase: str | None = None


class DrugSummaryRow(BaseModel):
    drug_id: str
    drug_name: str
    hy_code: str | None = None
    wells: list[str] = []
    targets: list[DrugTargetEntry] = []
    target_class: str | None = None
    drug_group: str | None = None
    gr_score: float | None = None
    growth_class: str | None = None
    effect_class: str | None = None
    smiles: str | None = None
    has_dashboard_assets: bool = False


# -----------------------------------------------------------------------------
# Dashboard — single-call response
# -----------------------------------------------------------------------------

class CompoundDetails(BaseModel):
    drug_id: str
    drug_name: str
    hy_code: str | None = None
    smiles: str | None = None
    dose_um: float | None = None
    treatment_hours: float | None = None
    structure_image_url: str | None = None


class TargetProfile(BaseModel):
    targets: list[str]
    target_class: str | None = None
    drug_group: str | None = None
    pathway: str | None = None
    moa: str | None = None


class CellLine(BaseModel):
    name: str
    species: str | None = None
    tissue: str | None = None
    morphology: str | None = None
    description: str | None = None


class ReferenceDatabases(BaseModel):
    """Per-target external DB links. Keys = target gene name."""

    by_target: dict[str, dict[str, str]] = Field(default_factory=dict)


class GrCurvePoint(BaseModel):
    t_hours: float
    grv: float


class PhenomeTrackingPoint(BaseModel):
    t_step: int
    deviation: float


class PhenotypicProfiling(BaseModel):
    gr_curve: list[GrCurvePoint]
    gr_curve_dmso: list[GrCurvePoint] = []
    gr_score: float | None = None
    growth_class: str | None = None
    phenome_drug: list[PhenomeTrackingPoint]
    phenome_dmso: list[PhenomeTrackingPoint] = []


class TimeLapseFrame(BaseModel):
    t_hours: float
    image_url: str
    n_cells: int | None = None


class TimeLapseViewer(BaseModel):
    frames: list[TimeLapseFrame]
    scale_bar_um: float | None = None
    well_id: str | None = None
    n_cells_t0: int | None = None


# --- PPI / Landscape -----------------------------------------------------------

class PpiNode(BaseModel):
    id: str
    degree: int = 0
    corr: float = 0.0
    is_target: bool = False
    community_id: int | None = None
    # PRD §9 semantic role for node coloring
    role: Literal["target", "activated", "suppressed", "info", "unknown"] = "unknown"
    confidence: float | None = None
    influence: float | None = None


class PpiEdge(BaseModel):
    source: str
    target: str
    string_score: int = 0
    corr: float = 0.0


class GoTerm(BaseModel):
    term: str
    score: float
    pvalue: float
    category: Literal["BP", "MF", "CC"]


class CommunitySummary(BaseModel):
    community_id: int
    size: int
    is_target: bool = False
    distavg: float | None = None
    corravg: float | None = None
    landscape: dict[str, float] | None = None  # {x, y, z}


class PpiPanel(BaseModel):
    target: str
    target_community_id: int
    current_community_id: int
    communities: list[CommunitySummary]
    nodes: list[PpiNode]
    edges: list[PpiEdge]
    go_terms: list[GoTerm]
    # node_id -> [community_id ...] (where else the node appears or its 1-hop neighbors live)
    node_community_index: dict[str, list[int]] = Field(default_factory=dict)


class LandscapePoint(BaseModel):
    x: float
    y: float
    z: float
    community_id: int
    size: int
    is_target: bool = False


class LandscapeGrid(BaseModel):
    xi: list[float]
    yi: list[float]
    z: list[list[float]]


class LandscapePanel(BaseModel):
    axes: dict[str, str]
    grid: LandscapeGrid | None = None
    scatter: list[LandscapePoint]
    target_point: dict[str, float] | None = None


class InteractomeNodeEgo(BaseModel):
    nodes: list[PpiNode]
    edges: list[PpiEdge]


class InteractomeGoCategoryItem(BaseModel):
    term: str
    score: float
    pvalue: float


class InteractomeNodeDetail(BaseModel):
    node_id: str
    ego: InteractomeNodeEgo
    go_terms: dict[str, list[InteractomeGoCategoryItem]] = Field(default_factory=dict)
    decay: list[dict[str, Any]] = Field(default_factory=list)


# --- Dashboard composite -------------------------------------------------------

class ProvenancePanel(BaseModel):
    plate_id: str
    drug_id: str
    target_id: str
    pipeline_version: str = "demo-0.1"
    generated_at: str | None = None
    panel_overrides: dict[str, dict[str, Any]] = Field(default_factory=dict)


class KpiMetric(BaseModel):
    """One headline KPI tile (PRD §6 primary metrics)."""
    label: str
    value: str          # presentation form (e.g. "+72%", "0.91", "Low")
    raw: float | None = None   # raw numeric for sparklines / sorting
    direction: Literal["up", "down", "flat"] | None = None
    sentiment: Literal["positive", "negative", "neutral", "warning"] | None = None
    hint: str | None = None       # supporting note ("Δ vs DMSO", "PPI corr", etc.)


class InsightFinding(BaseModel):
    """One bullet for the Insight sidebar (PRD §7 right rail)."""
    title: str
    detail: str | None = None
    sentiment: Literal["positive", "negative", "neutral", "warning"] = "neutral"
    icon: Literal["pulse", "warning", "info", "target", "trend-up", "trend-down"] = "info"


class InsightSummary(BaseModel):
    mechanism: str
    key_findings: list[InsightFinding] = Field(default_factory=list)
    biomarkers: list[str] = Field(default_factory=list)
    experimental_notes: list[str] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    plate_id: str
    drug_id: str
    drug_name: str
    target_id: str
    available_targets: list[str]
    compound: CompoundDetails
    target_profile: TargetProfile
    cell_line: CellLine
    references: ReferenceDatabases
    phenotypic: PhenotypicProfiling | None = None
    time_lapse: TimeLapseViewer | None = None
    ppi: PpiPanel | None = None
    landscape: LandscapePanel | None = None
    enrichment: list[GoTerm] = []
    moa_summary: str | None = None
    localization_annotations: list[dict[str, Any]] = Field(default_factory=list)
    status_flags: dict[str, str] = Field(default_factory=dict)
    provenance: ProvenancePanel
    kpis: list[KpiMetric] = Field(default_factory=list)
    insight: InsightSummary | None = None


class InteractomeNodeResponse(BaseModel):
    """E12 Level 2 — per-node ego + GO + decay payload."""

    plate_id: str
    drug_id: str
    target_id: str
    node: InteractomeNodeDetail


class CommunitySwitchResponse(BaseModel):
    """Result of clicking a node to switch the PPI panel to another community."""

    from_community_id: int
    to_community_id: int
    bridging_node: str
    nodes: list[PpiNode]
    edges: list[PpiEdge]
    go_terms: list[GoTerm]
    landscape_point: dict[str, float] | None = None
