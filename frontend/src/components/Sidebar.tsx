import { Link, useLocation, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Left sidebar nav (design_02 + style_guide §4.2).
 *
 * Structure:
 *   - Brand (top)
 *   - Workspace: Plates (active when on /plates index)
 *   - Footer (mt-auto): Theme slide toggle
 *
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
      <Link to="/plates" className="sidebar-brand" onClick={onCloseMobile} title="OmixAI-TPD · Molecular intelligence">
        <div className="sidebar-brand__logo">TPD</div>
        <div className="sidebar-brand__name">OmixAI</div>
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

      <div className="sidebar-footer mt-auto">
        <div className="sidebar-section__label">Theme</div>
        <ThemeToggle />
      </div>
    </aside>
  );
}

// Helper for routes outside Dashboard to use the params hook safely.
export function usePlateContext() {
  const params = useParams<{ plateId?: string; drugId?: string }>();
  return params;
}
