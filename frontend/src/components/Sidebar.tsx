import { Link, useLocation, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangToggle } from "@/components/LangToggle";

/**
 * Global icon-rail sidebar (~64px). Carries only the brand, the
 * Plates entry, and the theme toggle — section labels removed per
 * user request to drop the "AI SaaS template" feel and give the main
 * analysis area maximum horizontal space.
 *
 * Tooltips: `title=` attributes on each control surface the role
 * since labels are gone.
 *
 * Step 7 (2026-05-21): on <lg the rail becomes an off-canvas drawer
 * controlled by AppShell's mobileOpen state.
 */

interface Props {
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

// Microplate outline with the A1-orientation chamfer (top-left corner cut on
// the diagonal) + a 3×2 grid of wells, so the rail reads as "assay plates".
const PlatesIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path
      d="M8 4 H18.5 A1.5 1.5 0 0 1 20 5.5 V18.5 A1.5 1.5 0 0 1 18.5 20 H5.5 A1.5 1.5 0 0 1 4 18.5 V8 Z"
      strokeLinejoin="round"
    />
    <circle cx="8.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="14.5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none" />
  </svg>
);

const GuideIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    <path d="M12 11.2v5" strokeLinecap="round" />
  </svg>
);

export function Sidebar({ isMobileOpen = false, onCloseMobile }: Props) {
  const location = useLocation();
  const onPlatesIndex = location.pathname === "/plates";
  const onGuide = location.pathname === "/guide";

  return (
    <aside
      className={`
        app-sidebar
        max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50
        max-lg:transition-transform max-lg:duration-base
        ${isMobileOpen ? "max-lg:translate-x-0" : "max-lg:-translate-x-full"}
      `}
      aria-hidden={
        !isMobileOpen && typeof window !== "undefined" && window.innerWidth < 1024
          ? true
          : undefined
      }
    >
      <Link
        to="/plates"
        className="sidebar-brand"
        onClick={onCloseMobile}
        title="OmixAI-TPD · Workspace"
      >
        <div className="sidebar-brand__logo">TPD</div>
      </Link>

      <nav aria-label="Primary">
        <Link
          to="/plates"
          className={`sidebar-item ${onPlatesIndex ? "sidebar-item--active" : ""}`}
          onClick={onCloseMobile}
          title="Plates"
          aria-label="Plates"
        >
          <span className="sidebar-item__icon">
            <PlatesIcon />
          </span>
        </Link>
        <Link
          to="/guide"
          className={`sidebar-item ${onGuide ? "sidebar-item--active" : ""}`}
          onClick={onCloseMobile}
          title="Guide"
          aria-label="Guide"
        >
          <span className="sidebar-item__icon">
            <GuideIcon />
          </span>
        </Link>
      </nav>

      <div className="sidebar-footer mt-auto flex flex-col items-center gap-1">
        <LangToggle />
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
