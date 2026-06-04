// Mirrors backend/app/schemas.py. Keep manually in sync until codegen is added.

export interface PlateSummary {
  plate_id: string;
  plate_code: string;
  dose_um: number | null;
  treatment_hours: number | null;
  cell_line: string | null;
  n_wells: number;
  n_drugs: number;
  generated_at: string | null;
  pipeline_version: string | null;
  has_dashboard_assets: boolean;
}

export interface DrugTargetEntry {
  target: string;
  if_g: boolean;
  e3_ligase: string | null;
}

export interface DrugSummaryRow {
  drug_id: string;
  drug_name: string;
  hy_code: string | null;
  wells: string[];
  targets: DrugTargetEntry[];
  target_class: string | null;
  drug_group: string | null;
  gr_score: number | null;
  growth_class: string | null;
  effect_class: string | null;
  smiles: string | null;
  has_dashboard_assets: boolean;
}

export interface CompoundDetails {
  drug_id: string;
  drug_name: string;
  hy_code: string | null;
  smiles: string | null;
  dose_um: number | null;
  treatment_hours: number | null;
  structure_image_url: string | null;
}

export interface TargetProfile {
  targets: string[];
  target_class: string | null;
  drug_group: string | null;
  pathway: string | null;
  moa: string | null;
}

export interface CellLine {
  name: string;
  species: string | null;
  tissue: string | null;
  morphology: string | null;
  description: string | null;
}

export interface ReferenceDatabases {
  by_target: Record<string, Record<string, string>>;
}

export interface GrCurvePoint { t_hours: number; grv: number; }
export interface PhenomeTrackingPoint { t_step: number; deviation: number; }

export interface PhenotypicProfiling {
  gr_curve: GrCurvePoint[];
  gr_curve_dmso: GrCurvePoint[];
  gr_score: number | null;
  growth_class: string | null;
  phenome_drug: PhenomeTrackingPoint[];
  phenome_dmso: PhenomeTrackingPoint[];
}

export interface ProteinInfo {
  gene: string;
  found: boolean;
  accession: string | null;
  protein_name: string | null;
  function: string | null;
  summary: string[];
  families: string[];
  length: number | null;
  mass_kda: number | null;
  subcellular: string[];
  pdb_ids: string[];
  pdb_count: number;
  links: { uniprot?: string; string?: string; pdb?: string };
}

export interface TimeLapseFrame { t_hours: number; image_url: string; n_cells?: number | null; }
export interface TimeLapseViewer {
  frames: TimeLapseFrame[];
  scale_bar_um: number | null;
  well_id: string | null;
  n_cells_t0: number | null;
}

export type PpiRole = "target" | "activated" | "suppressed" | "info" | "unknown";

export interface PpiNode {
  id: string;
  degree: number;
  corr: number;
  is_target: boolean;
  community_id: number | null;
  role: PpiRole;
  confidence: number | null;
  influence: number | null;
}
export interface PpiEdge {
  source: string;
  target: string;
  string_score: number;
  corr: number;
}
export interface GoTerm {
  term: string;
  score: number;
  pvalue: number;
  category: "BP" | "MF" | "CC";
}

export interface CommunitySummary {
  community_id: number;
  size: number;
  is_target: boolean;
  distavg: number | null;
  corravg: number | null;
  landscape: { x: number; y: number; z: number } | null;
}

export interface PpiPanel {
  target: string;
  target_community_id: number;
  current_community_id: number;
  communities: CommunitySummary[];
  nodes: PpiNode[];
  edges: PpiEdge[];
  go_terms: GoTerm[];
  node_community_index: Record<string, number[]>;
}

export interface LandscapeGrid { xi: number[]; yi: number[]; z: number[][]; }
export interface LandscapePoint {
  x: number; y: number; z: number;
  community_id: number; size: number; is_target: boolean;
}
export interface LandscapePanel {
  axes: Record<string, string>;
  grid: LandscapeGrid | null;
  scatter: LandscapePoint[];
  target_point: { x: number; y: number; z: number } | null;
}

export interface InteractomeGoCategoryItem { term: string; score: number; pvalue: number; }
export interface InteractomeNodeEgo { nodes: PpiNode[]; edges: PpiEdge[]; }
export interface InteractomeNodeDetail {
  node_id: string;
  ego: InteractomeNodeEgo;
  go_terms: Partial<Record<"BP" | "MF" | "CC", InteractomeGoCategoryItem[]>>;
  decay: Array<{ concentration_um: number; t_hours: number; remaining: number }>;
}

export interface ProvenancePanel {
  plate_id: string;
  drug_id: string;
  target_id: string;
  pipeline_version: string;
  generated_at: string | null;
  panel_overrides: Record<string, Record<string, unknown>>;
}

export type KpiSentiment = "positive" | "negative" | "neutral" | "warning";

export interface KpiMetric {
  label: string;
  value: string;
  raw: number | null;
  direction: "up" | "down" | "flat" | null;
  sentiment: KpiSentiment | null;
  hint: string | null;
}

export type InsightIcon = "pulse" | "warning" | "info" | "target" | "trend-up" | "trend-down";

export interface InsightFinding {
  title: string;
  detail: string | null;
  sentiment: KpiSentiment;
  icon: InsightIcon;
}

export interface InsightSummary {
  mechanism: string;
  key_findings: InsightFinding[];
  biomarkers: string[];
  experimental_notes: string[];
}

export interface DashboardResponse {
  plate_id: string;
  drug_id: string;
  drug_name: string;
  target_id: string;
  available_targets: string[];
  compound: CompoundDetails;
  target_profile: TargetProfile;
  cell_line: CellLine;
  references: ReferenceDatabases;
  phenotypic: PhenotypicProfiling | null;
  time_lapse: TimeLapseViewer | null;
  ppi: PpiPanel | null;
  landscape: LandscapePanel | null;
  enrichment: GoTerm[];
  moa_summary: string | null;
  localization_annotations: Array<{ label: string; level: number }>;
  status_flags: Record<string, string>;
  provenance: ProvenancePanel;
  kpis: KpiMetric[];
  insight: InsightSummary | null;
}

export interface CommunitySwitchResponse {
  from_community_id: number;
  to_community_id: number;
  bridging_node: string;
  nodes: PpiNode[];
  edges: PpiEdge[];
  go_terms: GoTerm[];
  landscape_point: { x: number; y: number; z: number } | null;
}

export interface InteractomeNodeResponse {
  plate_id: string;
  drug_id: string;
  target_id: string;
  node: InteractomeNodeDetail;
}
