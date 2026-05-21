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
        brand: {
          primary: "var(--color-brand-primary)",
          "primary-hover": "var(--color-brand-primary-hover)",
          "primary-pressed": "var(--color-brand-primary-pressed)",
          secondary: "var(--color-brand-secondary)",
        },
        // category: status
        status: {
          success: "var(--color-status-success)",
          warning: "var(--color-status-warning)",
          error: "var(--color-status-error)",
          info: "var(--color-status-info)",
          neutral: "var(--color-status-neutral)",
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
        hero: ["var(--font-heading-hero-size)", { lineHeight: "var(--font-heading-hero-lh)" }],
        section: ["var(--font-heading-section-size)", { lineHeight: "var(--font-heading-section-lh)" }],
        card: ["var(--font-card-title-size)", { lineHeight: "var(--font-card-title-lh)" }],
        body: ["var(--font-body-size)", { lineHeight: "var(--font-body-lh)" }],
        meta: ["var(--font-meta-size)", { lineHeight: "var(--font-meta-lh)" }],
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
