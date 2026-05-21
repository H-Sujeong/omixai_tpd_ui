import { Link, useLocation, useParams } from "react-router-dom";

/**
 * Left sidebar nav (design_02 + style_guide §4.2).
 *
 * App-level navigation only:
 *   - Workspace: Plates (active when on /plates index)
 *   - System (placeholder): Help / Settings
 *
 * Step 3 (2026-05-21): drug-context section removed (now in TabBar).
 * Step 7 (2026-05-21): on <lg the sidebar becomes an off-canvas drawer
 * controlled by AppShell's mobileOpen state. On lg+ it falls back to
 * the original sticky-left position with no transform.
 */

interface Props {
  /** Off-canvas drawer open state on <lg. Ignored on lg+. */
  isMobileOpen?: boolean;
  /** Called when a Link inside the drawer is clicked, so the drawer
   *  closes after navigation. */
  onCloseMobile?: () => void;
}

const ICON = {
  plates: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
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

export function Sidebar({ isMobileOpen = false, onCloseMobile }: Props) {
  const location = useLocation();
  const onPlatesIndex = location.pathname === "/plates";

  return (
    <aside
      className={`
        app-sidebar
        max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50
        max-lg:transition-transform max-lg:duration-base
        ${isMobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}
      `}
      aria-hidden={!isMobileOpen && typeof window !== "undefined" && window.innerWidth < 1024 ? true : undefined}
    >
      <Link to="/plates" className="sidebar-brand" onClick={onCloseMobile}>
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
          onClick={onCloseMobile}
        >
          <span className="sidebar-item__icon">{ICON.plates}</span>
          <span>Plates</span>
        </Link>
      </div>

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

// Helper for routes outside Dashboard to use the params hook safely.
export function usePlateContext() {
  const params = useParams<{ plateId?: string; drugId?: string }>();
  return params;
}
