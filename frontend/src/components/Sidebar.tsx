import { Link, useLocation, useParams } from "react-router-dom";
import type { ReactNode } from "react";

/**
 * Left sidebar nav (design_02 + style_guide §4.2).
 *
 * Two sections:
 *  - App nav: Plates / Help / Settings (always visible)
 *  - Workspace nav: Dashboard sub-tabs (Overview/Phenotype/Network/Mechanism/Raw)
 *    — only when on a drug dashboard route.
 */

const ICON = {
  plates: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  overview: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 12h7m0 0V5m0 7v7m0-7h11" />
    </svg>
  ),
  phenotype: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 17c2-1 3-5 5-5s3 3 5 3 4-6 6-6 2 2 2 2" />
    </svg>
  ),
  network: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8 7l8 0M7 8l4 8M17 8l-4 8" />
    </svg>
  ),
  mechanism: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2.1 2.1M16.9 16.9L19 19M5 19l2.1-2.1M16.9 7.1L19 5" />
    </svg>
  ),
  raw: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 4h16v16H4z M4 9h16 M9 4v16" />
    </svg>
  ),
  help: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4M12 17.2v0" />
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09c0-.66-.4-1.25-1-1.51a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09c.66 0 1.25-.4 1.51-1z" />
    </svg>
  ),
} as const;

export type SidebarTab =
  | "overview"
  | "phenotype"
  | "network"
  | "mechanism"
  | "raw";

interface Props {
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
  drugContext?: { drugName: string; plateId: string };
}

export function Sidebar({ activeTab, onTabChange, drugContext }: Props) {
  const location = useLocation();
  const onPlatesIndex = location.pathname === "/plates";

  return (
    <aside className="app-sidebar">
      <Link to="/plates" className="sidebar-brand">
        <div className="sidebar-brand__logo">TPD</div>
        <div className="leading-tight">
          <div className="font-semibold text-ink-primary text-sm">OmixAI-TPD</div>
          <div className="text-meta text-ink-muted">Molecular intelligence</div>
        </div>
      </Link>

      <div className="sidebar-section">
        <div className="sidebar-section__label">Workspace</div>
        <Link
          to="/plates"
          className={`sidebar-item ${onPlatesIndex ? "sidebar-item--active" : ""}`}
        >
          <span className="sidebar-item__icon">{ICON.plates}</span>
          <span>Plates</span>
        </Link>
      </div>

      {drugContext && (
        <div className="sidebar-section">
          <div className="sidebar-section__label">
            {drugContext.drugName}
            <span className="ml-2 text-ink-muted">· {drugContext.plateId}</span>
          </div>
          <SidebarTabItem
            id="overview"
            label="Overview"
            icon={ICON.overview}
            active={activeTab === "overview"}
            onClick={onTabChange}
          />
          <SidebarTabItem
            id="phenotype"
            label="Phenotype"
            icon={ICON.phenotype}
            active={activeTab === "phenotype"}
            onClick={onTabChange}
          />
          <SidebarTabItem
            id="network"
            label="Network"
            icon={ICON.network}
            active={activeTab === "network"}
            onClick={onTabChange}
          />
          <SidebarTabItem
            id="mechanism"
            label="Mechanism"
            icon={ICON.mechanism}
            active={activeTab === "mechanism"}
            onClick={onTabChange}
          />
          <SidebarTabItem
            id="raw"
            label="Raw Data"
            icon={ICON.raw}
            active={activeTab === "raw"}
            onClick={onTabChange}
            badge="v2"
            disabled
          />
        </div>
      )}

      <div className="sidebar-section mt-auto">
        <div className="sidebar-section__label">System</div>
        <a className="sidebar-item sidebar-item--disabled">
          <span className="sidebar-item__icon">{ICON.help}</span>
          <span>Help</span>
        </a>
        <a className="sidebar-item sidebar-item--disabled">
          <span className="sidebar-item__icon">{ICON.settings}</span>
          <span>Settings</span>
        </a>
      </div>
    </aside>
  );
}

function SidebarTabItem({
  id,
  label,
  icon,
  active,
  badge,
  disabled,
  onClick,
}: {
  id: SidebarTab;
  label: string;
  icon: ReactNode;
  active?: boolean;
  badge?: string;
  disabled?: boolean;
  onClick?: (tab: SidebarTab) => void;
}) {
  return (
    <button
      className={`sidebar-item w-full text-left ${active ? "sidebar-item--active" : ""} ${
        disabled ? "sidebar-item--disabled" : ""
      }`}
      onClick={() => !disabled && onClick?.(id)}
      disabled={disabled}
    >
      <span className="sidebar-item__icon">{icon}</span>
      <span>{label}</span>
      {badge && <span className="sidebar-item__count">{badge}</span>}
    </button>
  );
}

// Helper for routes outside Dashboard to use the params hook safely
export function usePlateContext() {
  const params = useParams<{ plateId?: string; drugId?: string }>();
  return params;
}
