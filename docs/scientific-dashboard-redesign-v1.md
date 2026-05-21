# Scientific Analysis Dashboard — Design PRD / UX Specification v1.0

> **Source**: External design PRD received 2026-05-20
> **Status**: Adopted — supersedes prior light-theme dashboard for the *Dashboard module only*. Other modules inherit the new token system.
> **Scope**: Dashboard route (`/plates/:plateId/drugs/:drugId`). The Plate list and Drug Summary inherit theme tokens but keep their information layout.

This document is a verbatim adoption of the v1.0 external PRD with one tier-mapping addendum (§A) so it fits the existing §0 "design volatility containment" policy of [design-system.md](../02-design/design-system.md).

---

## Tier mapping (addendum §A)

The PRD's directives map to the existing 4-tier classification (T-Invariant / T-Token / T-Visual / T-Layout) so future design swaps still go through a single entry point.

| PRD directive | Tier | Single entry point |
|---|---|---|
| Dark neutral palette `#0F1115 / #161B22 / #21262D / #30363D` | T-Token | `frontend/src/styles/tokens.css` `:root` |
| Purple primary brand | T-Token | `frontend/src/styles/tokens.css` `--color-brand-primary` |
| Semantic palette (purple/green/red/blue/gray) | T-Token | `frontend/src/styles/tokens.css` `--color-status-*` |
| PPI node role coloring (target / activated / suppressed / info / unknown) | T-Visual | `frontend/src/features/ppi-graph/PpiGraph.tsx` style array |
| Tabbed module navigation (Overview / Phenotype / Network / Mechanism / Raw Data) | T-Layout | `frontend/src/routes/DashboardPage.tsx` `<TabBar>` |
| KPI strip (Phenotype Shift / Cell Viability / Target Confidence / Toxicity) | T-Layout + data contract | `backend/app/domain/dashboard.py` `_compute_kpis()` + `frontend/src/features/kpi/KpiStrip.tsx` |
| Insight sidebar (mechanism summary / key findings / biomarkers / experimental notes) | T-Layout | `frontend/src/features/insight-sidebar/InsightSidebar.tsx` |
| Typography Inter / IBM Plex Sans / Geist (line-height ≥ 1.5) | T-Token | `tokens.css` font tokens |
| Token naming `category.role.variant` | T-Invariant | enforced in CSS var names (`--color-surface-primary`, `--space-layout-lg`) |
| Empty / loading / partial / error states | T-Invariant | per-component (already in [LoadingBlock](../../../frontend/src/components/LoadingBlock.tsx)) |
| Motion 150–250ms, subtle | T-Token | `--motion-fast / --motion-base` |

---

## 1. Overview

### Objective
Design a high-density scientific analysis dashboard that enables researchers to:
- Analyze compound behavior
- Understand target interactions
- Observe phenotypic changes
- Correlate biological signals
- Extract actionable scientific insights

### Priorities
- Insight readability
- Scientific workflows
- Progressive disclosure
- Linked interactions
- Exploratory analysis

## 2. Product goals
- Reduce cognitive overload
- Improve insight discoverability
- Support exploratory scientific workflows
- Increase data readability
- Improve navigation across datasets
- Enable connected analysis across modules

## 3. UX principles

### 3.1 Insight first
Always expose conclusions before raw data. **Key finding → supporting data → raw data.**

### 3.2 Progressive disclosure
Use accordions, tabs, expandable panels, hover details, drill-down interactions.

### 3.3 Linked analytical experience
All modules communicate. PPI node selection updates charts; timeline selection updates imaging; target selection filters pathways.

### 3.4 Scientific readability
Precise typography, high-contrast visuals, scalable charts, annotation support.

### 3.5 Workflow-based UX
The UI mirrors real scientific workflows: **Compound Overview → Target Analysis → Phenotypic Impact → Mechanism Analysis → Deep Exploration.**

## 4. Information architecture
```
Dashboard
├── Header Summary  (compound identity + KPI strip + active targets)
├── Main Analysis Workspace
│   ├── Network Analysis      (PPI + Landscape + Enrichment)
│   ├── Phenotype Analysis    (Time-lapse + GR + Phenome)
│   ├── Time-Lapse Imaging
│   └── Mechanism Insights
├── Insight Sidebar           (mechanism summary / key findings / biomarkers / notes)
└── Experimental Metadata     (collapsible — Compound / Target / Cell / Setup / Refs)
```

## 5. Layout (desktop ≥ 1440)
```
┌─────────────────────────────────────────────────────┐
│ Global Header  (Drug · KPIs · Target pills)        │
├─────────────────────────────────────────────────────┤
│ Tab bar       Overview / Phenotype / Network / …   │
├──────────────────────────────────┬──────────────────┤
│ Main analysis area               │ Insight sidebar  │
│ (visualizations, charts)         │ (findings/notes) │
├──────────────────────────────────┴──────────────────┤
│ Experimental metadata (accordion)                  │
└─────────────────────────────────────────────────────┘
```

## 6. Global header
- **Compound Identity**: name + class + mechanism type
- **Primary KPI strip**:
  | Metric | Example |
  |---|---|
  | Phenotype Shift | +72% |
  | Cell Viability | 84% |
  | Target Confidence | 0.91 |
  | Toxicity | Low |
- **Active Target pills** (interactive — switch dashboard target)

## 7. Main analysis workspace
- **Left**: PPI Graph · Heatmaps · Cell Trajectory · 3D Embeddings · Temporal Imaging
- **Right**: Insight sidebar — Mechanism summary · Key findings · Statistical significance · Biomarkers · Experimental notes

## 8. Navigation system
**Top-level tabs** within Dashboard:
- Overview (KPIs + insight summary)
- Phenotype (Time-lapse + GR + Phenome)
- Network (PPI + Landscape + Enrichment)
- Mechanism (MoA + Localization + Decay)
- Transcriptomics *(future)*
- Raw Data *(future)*

## 9. PPI graph
- **Node size** ∝ influence (degree)
- **Node color** = role (Primary target = Purple · Activated = Green · Suppressed = Red · Informational = Blue · Unknown = Gray)
- **Node border** = selection
- **Node glow** = active focus
- **Hover** reveals: target confidence · pathways · interactions · phenotype relevance
- **Click** updates: charts · imaging · annotations · side panel
- Required features: zoom · filter · pathway clustering · export · search

## 10. Time-lapse imaging
- Frame-accurate timeline scrubbing
- Event markers: nuclear collapse · cell fragmentation · morphology drift
- Linked: timeline updates phenotype chart · graph highlights · annotations

## 11. Chart system
Each chart card includes:
```
┌────────────────────────────┐
│ Cell Viability             │
│ Large Visualization        │
│ Δ -32% vs control          │ ← conclusion line
└────────────────────────────┘
```
Required: zoom · hover · threshold indicators · CIs · annotation layers.

## 12. Scientific metadata
Use accordion groups: **Compound · Target Profile · Cell Line · Experimental Setup · References.** Avoid persistent dense metadata.

## 13. Typography
Inter / IBM Plex Sans / Geist. **Line-height ≥ 1.5.** Type scale:

| Role | Size |
|---|---|
| Hero Title | 28 |
| Section Title | 20 |
| Card Title | 16 |
| Body | 14 |
| Metadata | 12 |

Avoid low-contrast grays and thin weights.

## 14. Spacing
Tokens **4 / 8 / 12 / 16 / 24 / 32 / 48 / 64**.

| Element | Spacing |
|---|---|
| Card padding | 24 |
| Section gap | 32 |
| Component gap | 16 |

## 15. Color system

### Neutral (dark)
- `--color-surface-base` `#0F1115`
- `--color-surface-elevated` `#161B22`
- `--color-surface-card` `#21262D`
- `--color-surface-overlay` `#30363D`

### Semantic
| Meaning | Color |
|---|---|
| Primary (brand) | Purple |
| Success / Activated | Green |
| Warning | Orange |
| Error / Suppressed | Red |
| Info | Blue |

## 16. Accessibility
- WCAG contrast ≥ 4.5:1
- Keyboard navigable; focus rings required
- Accessible chart labeling
- Colorblind-safe palettes; scalable graphs

## 17. Interaction
States: default · hover · active · selected · disabled · loading.
Motion duration 150–250 ms; subtle fades, graph transitions, panel reveals. Avoid decorative animation.

## 18. Responsive
- ≥ 1440 — primary target (multi-column)
- Tablet — collapse insight sidebar + metadata
- Mobile — stacked tabs + full-screen views; avoid multi-panel.

## 19. Technical recommendations
React 18 · Next.js *(future)* · Tailwind CSS + CSS Variables · shadcn/ui · Radix UI.
Visualization: ECharts (charts) · Cytoscape.js (graphs) · Three.js (3D) · D3 (heatmaps).

> Implementation note: this repo uses Plotly.js (charts) and Cytoscape.js (PPI) already. ECharts/Three.js/D3 are future migrations gated by need; Plotly is functionally equivalent for the v1 chart set.

## 20. Token naming `category.role.variant`
Examples:
- `color.surface.primary`
- `space.layout.lg`
- `radius.card.md`
- `font.heading.hero`

CSS var equivalents: `--color-surface-primary`, `--space-layout-lg`, `--radius-card-md`, `--font-heading-hero`.

## 21. Empty states
Every module supports: no data · loading · partial data · error. Example:
> No phenotype changes detected. Try adjusting target filters.

## 22. Error handling
Errors must explain what failed · why · how to recover. Example:
> Protein interaction data unavailable for selected assay. Retry or change target filter.

## 23. Performance
- Initial load < 2.5 s
- Graph interaction < 100 ms
- Chart update < 150 ms

## 24. Success metrics
Time-to-insight · task completion · navigation efficiency · error recovery · analysis completion.

## 25. Final UX vision
From **Static Data Dashboard** → **Interactive Scientific Insight Workspace.**

---

## Out of v1 (gated for v2+)
- Transcriptomics tab + Raw Data tab (require new data pipelines; PRD F-PROV-DIFF / F-E10 territory).
- 3D / Three.js volumetric panels (current Plotly 3D Landscape covers the visual requirement).
- D3 heatmaps (no source data in `sample_data` yet — placeholder accordion in Mechanism tab is acceptable).
- shadcn/ui migration (current `panel-card` shell already encapsulates the contract; can migrate when CTRL needs it).
