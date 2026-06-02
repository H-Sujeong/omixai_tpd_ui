import type { Config } from "tailwindcss";

/**
 * Tailwind config tied to tokens.css (Scientific Dashboard v1, dark + purple).
 * Token name format: category.role.variant → tailwind class `<category>-<role>-<variant>`.
 */
const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // category: surface
        surface: {
          base: "var(--color-surface-base)",
          elevated: "var(--color-surface-elevated)",
          card: "var(--color-surface-card)",
          "card-top": "var(--color-surface-card-top)",
          overlay: "var(--color-surface-overlay)",
          sidebar: "var(--color-surface-sidebar)",
          soft: "var(--color-surface-soft)",
        },
        // category: line / border
        line: {
          DEFAULT: "var(--color-border-default)",
          strong: "var(--color-border-strong)",
          accent: "var(--color-border-accent)",
        },
        // category: text
        ink: {
          primary: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          inverse: "var(--color-text-inverse)",
        },
        // category: brand
        // Format uses `rgb(var(--token-rgb) / <alpha-value>)` so Tailwind
        // opacity modifiers like `bg-brand-primary/45` compile correctly.
        // The matching RGB-triplet vars live in tokens.css. Step 8 (2026-05-21).
        brand: {
          primary: "rgb(var(--color-brand-primary-rgb) / <alpha-value>)",
          "primary-hover": "rgb(var(--color-brand-primary-hover-rgb) / <alpha-value>)",
          "primary-pressed": "rgb(var(--color-brand-primary-pressed-rgb) / <alpha-value>)",
          secondary: "rgb(var(--color-brand-secondary-rgb) / <alpha-value>)",
        },
        // category: status (same alpha-supporting pattern)
        status: {
          success: "rgb(var(--color-status-success-rgb) / <alpha-value>)",
          warning: "rgb(var(--color-status-warning-rgb) / <alpha-value>)",
          error: "rgb(var(--color-status-error-rgb) / <alpha-value>)",
          info: "rgb(var(--color-status-info-rgb) / <alpha-value>)",
          neutral: "rgb(var(--color-status-neutral-rgb) / <alpha-value>)",
        },
        // category: role (PPI node semantics)
        role: {
          target: "var(--color-role-target)",
          activated: "var(--color-role-activated)",
          suppressed: "var(--color-role-suppressed)",
          info: "var(--color-role-info)",
          unknown: "var(--color-role-unknown)",
        },
        // back-compat (Plate Summary growth class chips)
        cytotoxic: {
          strong: "var(--color-cytotoxic-strong)",
          moderate: "var(--color-cytotoxic-moderate)",
          none: "var(--color-cytotoxic-none)",
        },
      },
      fontFamily: {
        sans: ["var(--font-family-sans)"],
        mono: ["var(--font-family-mono)"],
      },
      fontSize: {
        // === 7-scale typography (2026-06-02) ============================
        display:      ["var(--font-display-size)",      { lineHeight: "var(--font-display-lh)",      fontWeight: "var(--font-display-weight)",      letterSpacing: "var(--font-display-tracking)" }],
        kpi:          ["var(--font-kpi-size)",          { lineHeight: "var(--font-kpi-lh)",          fontWeight: "var(--font-kpi-weight)",          letterSpacing: "-0.04em" }],
        title:        ["var(--font-title-size)",        { lineHeight: "var(--font-title-lh)",        fontWeight: "var(--font-title-weight)" }],
        "body-strong":["var(--font-body-strong-size)",  { lineHeight: "var(--font-body-strong-lh)",  fontWeight: "var(--font-body-strong-weight)" }],
        body:         ["var(--font-body-size)",         { lineHeight: "var(--font-body-lh)",         fontWeight: "var(--font-body-weight)" }],
        caption:      ["var(--font-caption-size)",      { lineHeight: "var(--font-caption-lh)",      fontWeight: "var(--font-caption-weight)",      letterSpacing: "0.04em" }],
        label:        ["var(--font-label-size)",        { lineHeight: "var(--font-label-lh)",        fontWeight: "var(--font-label-weight)",        letterSpacing: "0.12em" }],
        // === Legacy aliases — back-compat with existing callers =========
        hero:    ["var(--font-display-size)", { lineHeight: "var(--font-display-lh)" }],
        section: ["var(--font-title-size)",   { lineHeight: "var(--font-title-lh)" }],
        card:    ["var(--font-title-size)",   { lineHeight: "var(--font-title-lh)" }],
        meta:    ["var(--font-caption-size)", { lineHeight: "var(--font-caption-lh)" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        popover: "var(--shadow-popover)",
        glow: "var(--shadow-glow-brand)",
      },
      transitionDuration: {
        fast: "var(--motion-fast)",
        base: "var(--motion-base)",
        slow: "var(--motion-slow)",
      },
      transitionTimingFunction: {
        standard: "var(--easing-standard)",
      },
    },
  },
  plugins: [],
};

export default config;
