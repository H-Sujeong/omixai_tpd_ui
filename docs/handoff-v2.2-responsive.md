# v2.2 Handoff — Responsive Layout

**Status:** in progress (branch `main`, currently on `2.2.0-dev`)
**Release trigger:** when the dashboard's primary visualization
containers stop using fixed pixel heights and respond to viewport.

---

## Goal

Make the analysis layout viewport-aware so that on larger displays
(QHD, 4K, ultrawide) the user gets bigger visualizations rather
than a fixed-size box centered in a wide column.

## Why now

The 2.0 / 2.1 cycle deliberately fixed heights to stabilize the
visual rhythm (PPI / Landscape / Time-lapse alignment). That work
is done. The remaining UX gap is that on a 3440px ultrawide the
PPI panel is still the same 520px tall as on a 1280px laptop.

## Hard constraints

- **Equal box heights** must be preserved across PPI / Landscape
  pair and across Pathway / Imaging pair. The user spent multiple
  cycles aligning these (PPI `height=520`, Landscape `height=555`).
  Any responsive scheme must keep the visual parity on resize.
- **Imaging column** stacks Time-lapse + Phenotypic Profiling. The
  imaging-column total height must match Pathway's panel height.
- **Time-lapse image** is `<img object-contain>` inside a fixed-
  height container. Image is generated externally; UI must
  letterbox gracefully when source aspect != container aspect.

## Current pin points (the files to edit)

| Component | File | Fixed value |
|---|---|---|
| PPI graph | `frontend/src/routes/DashboardPage.tsx` | `<PpiGraph height={520} />` |
| Target Landscape | `frontend/src/routes/DashboardPage.tsx` | `<Landscape height={555} />` |
| Time-lapse box | `frontend/src/features/time-lapse/TimeLapseViewerPanel.tsx` | `h-[431px]` wrapper |
| Phenotypic | inside `<PhenotypicProfilingPanel>` — check its internal sizing |
| Pathway | `<EnrichmentBar>` — flexes with content; verify behavior |

## Recommended approach

Two options — pick after a quick sizing test:

### Option A — viewport-derived heights (simpler)

Use Tailwind `lg:h-[...]` / `xl:h-[...]` breakpoints to scale fixed
heights up. e.g.:

```
h-[431px] lg:h-[500px] xl:h-[600px] 2xl:h-[680px]
```

Apply the same breakpoint set across all four primary panels so
they grow together. Match PPI/Landscape ratio numerically.

Pros: dead simple, no JS, predictable.
Cons: still pixel-locked at each breakpoint.

### Option B — container-query / aspect-driven (cleaner long-term)

Wrap each panel grid row in a `container` and have the panel use
`@container` queries or `aspect-ratio: 16/10` to size itself based
on column width. The container ends up tall on wide viewports
because the column got wider.

Pros: smooth scaling, no breakpoint discontinuities.
Cons: Plotly / Cytoscape want explicit pixel heights, so you'll
still need a ResizeObserver to feed the measured container height
into `<PpiGraph height={...}>` and `<Landscape height={...}>`.

Recommendation: start with Option A for a 1-2 hour win, then
revisit if user wants smoother scaling.

## Image source-resolution guidance

Already analyzed during 2.1. The current `h-[431px]` time-lapse
box renders square frames at 431×431 (or letterboxed for non-
square). With responsive heights up to ~700 px:

- **800×800** — minimum (current standard, 1× DPR coverage)
- **1024×1024** — sweet spot (covers QHD + 2× DPR with zoom headroom)
- **1536+** — only justified if zoom/pan inspection is added

WebP/AVIF at q=80 keeps 13-frame timelapse under 3 MB at 1024.

## Out of scope for v2.2

- Adding a zoom/pan UX on the time-lapse frame (would justify
  Tier 3 image resolution).
- Changing the column ratio (still PPI 50 / Landscape 50,
  Pathway 50 / Imaging 50). Re-balancing belongs in 2.4+.
- Touching the global Sidebar — that was finalized in 2.1.

## Release checklist

- [ ] All four primary panels grow with viewport (1280 / 1920 / 2560).
- [ ] PPI / Landscape paired heights equal at every breakpoint.
- [ ] Imaging column (Time-lapse + Phenotypic stacked) = Pathway height.
- [ ] No layout shift when resizing within a breakpoint.
- [ ] Dev server check at QHD + 4K viewport.
- [ ] Bump 2.2.0-dev → 2.2.0, annotated tag, push.
- [ ] Bump 2.3.0-dev (handoff: login screen).
