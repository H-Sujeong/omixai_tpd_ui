# Scientific Research Platform — Unified Design System Prompt & Style Guide

Version: 1.0  
Design Language: Dark Scientific Intelligence UI  
Compatible With:
- Figma AI
- v0.dev
- Lovable
- Claude
- GPT
- Midjourney
- Cursor
- Frontend Copilot
- Uizard

---

# 1. Design Philosophy

This design system is built for:

- scientific analysis
- biotech platforms
- drug discovery
- AI-assisted research
- molecular exploration
- omics analysis
- experimental workflows

The interface should feel:

```txt
high precision
high trust
high density
high intelligence
```

Avoid:
- consumer SaaS feeling
- playful UI
- generic startup dashboard aesthetics

The design should communicate:

```txt
scientific authority
clarity
deep analytical capability
```

---

# 2. Core Visual Identity

## Visual Keywords

```txt
Scientific
Futuristic
Minimal
High-precision
Analytical
Cinematic dark mode
Laboratory-grade UI
```

---

# 3. Global Design Prompt (MASTER PROMPT)

Use this prompt for generating any new page.

---

## MASTER PROMPT

```txt
Design a high-end dark-mode scientific research platform UI for biotech and drug discovery workflows.

Style:
- cinematic dark interface
- deep navy and black backgrounds
- neon scientific accents
- glassmorphism used minimally
- highly structured grid system
- precision-focused typography
- high information density with strong hierarchy
- enterprise-grade scientific dashboard aesthetics
- modern biotech AI platform feel

Visual language:
- dark navy gradients
- subtle glow effects
- thin borders
- layered analytical cards
- molecular visualization inspired graphics
- scientific plotting aesthetics
- advanced data visualization system
- clean modular layout

Use:
- purple for primary targets
- cyan for informational metrics
- green for positive biological signals
- red for toxicity or suppression
- orange for warnings

Typography:
- Inter or IBM Plex Sans
- large section headers
- compact metadata labels
- high readability

Layout:
- left sidebar navigation
- top scientific context header
- modular analytical cards
- linked visualization areas
- insight-first hierarchy

The UI should resemble:
- next-generation biotech operating system
- AI-assisted scientific analysis workspace
- molecular intelligence platform

Avoid:
- rounded playful SaaS UI
- excessive gradients
- cartoonish visuals
- generic admin dashboards
- bright white backgrounds
- marketing landing page aesthetics
```

---

# 4. Layout Rules

---

## 4.1 Application Layout

```txt
┌──────────────────────────────────┐
│ Top Scientific Context Header    │
├──────────────┬───────────────────┤
│ Left Sidebar │ Main Workspace    │
│              │                   │
│              │                   │
├──────────────┴───────────────────┤
│ Optional Bottom Analysis Panel   │
└──────────────────────────────────┘
```

---

## 4.2 Sidebar

### Width

```css
220px–260px
```

---

## Sidebar Style

```txt
- dark navy background
- thin separators
- active purple glow
- monochrome icons
- compact navigation density
```

---

## Sidebar Sections

```txt
Overview
Experiments
Phenotype
Network
Mechanism
Transcriptomics
Cell Imaging
Biomarkers
Reports
Raw Data
Settings
```

---

# 5. Color System

---

## Background Colors

| Token | Value |
|---|---|
| bg.primary | #070B14 |
| bg.secondary | #0D1320 |
| bg.card | #101826 |
| bg.elevated | #131D2C |

---

## Border Colors

| Token | Value |
|---|---|
| border.default | #243246 |
| border.active | #7C3AED |

---

## Accent Colors

| Purpose | Color |
|---|---|
| Primary | #A855F7 |
| Info | #4AA8FF |
| Success | #4ADE80 |
| Warning | #FB923C |
| Danger | #F87171 |

---

# 6. Typography System

---

## Fonts

```txt
Inter
IBM Plex Sans
Geist
```

---

## Typography Scale

| Usage | Size |
|---|---|
| Hero | 32 |
| Section | 24 |
| Card Title | 18 |
| Body | 14 |
| Metadata | 12 |

---

## Typography Rules

```txt
- avoid thin font weights
- use high contrast text
- compact metadata labels
- scientific readability prioritized
```

---

# 7. Card System

---

## Card Style

```css
background:
linear-gradient(180deg,#131D2C,#101826);

border:
1px solid #243246;

border-radius:
14px;

box-shadow:
0 10px 30px rgba(0,0,0,0.35);
```

---

## Card Structure

```txt
Header
Main Visualization
Metrics
Annotations
Footer Actions
```

---

# 8. Chart & Visualization Style

---

## General Rules

Charts must feel:

```txt
scientific
publication-grade
high precision
```

---

## Use

```txt
- thin gridlines
- neon plotting accents
- dark plotting backgrounds
- subtle hover glow
- annotation layers
```

---

## Avoid

```txt
- rainbow charts
- thick cartoon colors
- oversized labels
```

---

# 9. Interaction Style

---

## Motion

### Duration

```txt
150ms–250ms
```

---

## Interaction Effects

```txt
- soft fades
- subtle glows
- panel transitions
- chart highlight animations
```

Avoid:
- bouncy animation
- playful transitions

---

# 10. Component Prompt Templates

---

# 10.1 Experiment List Page

```txt
Design a dark-mode scientific experiment management page for a biotech platform.

Include:
- experiment table
- assay status
- target labels
- compound metadata
- filtering sidebar
- advanced search
- batch operations
- compact scientific table UI

Style must match:
high-end biotech intelligence platform aesthetics.
```

---

# 10.2 Compound Detail Page

```txt
Design a detailed compound analysis page for a molecular research platform.

Include:
- compound hero section
- target interaction network
- phenotype metrics
- cell imaging timeline
- biomarker analysis
- pathway enrichment
- scientific metadata panel

Use:
dark cinematic scientific dashboard style.
```

---

# 10.3 Imaging Analysis Page

```txt
Design a scientific cell imaging analysis interface.

Include:
- microscopy viewer
- timeline scrubber
- event annotations
- segmentation overlays
- phenotype comparison
- AI detection labels
- linked metadata panel

Style:
futuristic biotech imaging workstation.
```

---

# 10.4 Transcriptomics Page

```txt
Design a transcriptomics analysis dashboard for a biotech AI platform.

Include:
- volcano plot
- heatmap
- gene enrichment
- pathway analysis
- differential expression table
- filtering controls
- annotation side panel

Visual style:
high-density scientific analysis UI.
```

---

# 10.5 Report Builder Page

```txt
Design a scientific report generation interface.

Include:
- drag-and-drop analysis blocks
- chart insertion
- annotation editor
- export controls
- collaboration comments
- version history

Style:
enterprise biotech reporting system.
```

---

# 10.6 Settings / Admin Page

```txt
Design a dark-mode enterprise settings page for a biotech research platform.

Include:
- user roles
- API settings
- storage management
- experiment permissions
- security settings
- audit logs

Maintain:
same scientific enterprise visual language.
```

---

# 11. Iconography

Use:
- Lucide
- Phosphor
- Heroicons

Style:
```txt
thin stroke
minimal
technical
```

---

# 12. Data Table Style

---

## Table Rules

```txt
- compact rows
- sticky headers
- dark alternating rows
- inline filtering
- precision spacing
```

---

## Table Feel

Should resemble:
```txt
Bloomberg terminal meets biotech OS
```

---

# 13. Scientific UX Rules

---

## Always Prioritize

```txt
Insight
Interpretation
Scientific reasoning
```

---

## Never Prioritize

```txt
Decoration over clarity
```

---

# 14. Spacing System

| Token | Value |
|---|---|
| xs | 4 |
| sm | 8 |
| md | 16 |
| lg | 24 |
| xl | 32 |
| xxl | 48 |

---

# 15. Design Tokens Naming

```txt
color.surface.primary
color.border.active
space.layout.lg
font.heading.hero
radius.card.md
```

---

# 16. Image Generation Prompt

Use for Midjourney / DALL·E.

```txt
Futuristic biotech scientific dashboard UI, dark cinematic interface, molecular intelligence platform, high-density analytical layout, purple and cyan neon scientific accents, advanced biotech operating system, glassmorphism minimal, scientific data visualization, enterprise drug discovery platform, protein interaction networks, microscopy analysis, pathway enrichment charts, ultra detailed UI, modern UX design system
```

---

# 17. Frontend Development Prompt

Use for Cursor / GPT / Claude.

```txt
Build a React + Tailwind scientific research platform UI using a dark biotech design system.

Requirements:
- reusable modular cards
- responsive scientific dashboard
- sidebar navigation
- analytical charts
- data visualization support
- molecular interaction graph placeholders
- dark cinematic theme
- purple/cyan scientific accents
- enterprise-grade UX

Use:
- Tailwind
- shadcn/ui
- ECharts
- Cytoscape.js

Design style:
high-end biotech operating system.
```

---

# 18. Final Design Goal

The platform should feel like:

```txt
The operating system for molecular intelligence and AI-assisted scientific discovery.
```

Not:
```txt
A generic admin dashboard.
```

The experience must communicate:

```txt
precision
trust
depth
scientific power
```
