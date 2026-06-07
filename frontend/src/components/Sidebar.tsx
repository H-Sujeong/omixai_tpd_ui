import { useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangToggle } from "@/components/LangToggle";
import { useMe, useLogout } from "@/api/auth";
import { usePlates } from "@/api/queries";
import { useT } from "@/store/uiLang";

type Flyout = "plates" | "guide" | null;

interface GuideEntry {
  id: string;
  ko: string;
  en: string;
  indent?: boolean;        // sub-section under Dashboard
}

const GUIDE_SECTIONS: GuideEntry[] = [
  { id: "sidebar",            ko: "사이드바",        en: "Sidebar" },
  { id: "plate",              ko: "플레이트 목록",   en: "Plate list" },
  { id: "drug",               ko: "약물 목록",       en: "Drug list" },
  { id: "dashboard",          ko: "대시보드",        en: "Dashboard" },
  { id: "dashboard-dynamics", ko: "Dynamics",       en: "Dynamics",   indent: true },
  { id: "dashboard-timecourse", ko: "Timecourse",   en: "Timecourse", indent: true },
  { id: "dashboard-phenome",  ko: "Phenome",        en: "Phenome",    indent: true },
];

function PlatesFlyout({ onClose }: { onClose: () => void }) {
  const t = useT();
  const plates = usePlates();
  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-line">
        <h3 className="text-body-strong text-ink-primary">
          {t("플레이트", "Plates")}
        </h3>
        <p className="text-meta text-ink-muted mt-0.5">
          {t("내가 볼 수 있는 플레이트", "Plates you can open")}
        </p>
      </header>
      <ul className="flex-1 overflow-y-auto py-1">
        {plates.isLoading && (
          <li className="px-4 py-2 text-meta text-ink-muted">
            {t("불러오는 중…", "Loading…")}
          </li>
        )}
        {!plates.isLoading && !plates.data?.length && (
          <li className="px-4 py-2 text-meta text-ink-muted">
            {t("이용 가능한 플레이트가 없습니다", "No accessible plates")}
          </li>
        )}
        {plates.data?.map((p) => (
          <li key={p.plate_id}>
            <Link
              to={`/plates/${p.plate_id}`}
              onClick={onClose}
              className="block px-4 py-2 hover:bg-surface-soft text-body text-ink-secondary"
            >
              <div className="font-medium text-ink-primary">{p.plate_id}</div>
              <div className="text-meta text-ink-muted">
                {p.dose_um != null ? `${p.dose_um} μM · ` : ""}
                {p.n_drugs} {t("약물", "drugs")}
                {p.is_mock ? " · mock" : ""}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GuideFlyout({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-line">
        <h3 className="text-body-strong text-ink-primary">
          {t("가이드", "Guide")}
        </h3>
        <p className="text-meta text-ink-muted mt-0.5">
          {t("섹션을 클릭하면 이동합니다", "Click a section to jump")}
        </p>
      </header>
      <ul className="flex-1 overflow-y-auto py-1">
        {GUIDE_SECTIONS.map((s) => (
          <li key={s.id}>
            <Link
              to={`/guide#${s.id}`}
              onClick={onClose}
              className={
                "block py-2 hover:bg-surface-soft text-body text-ink-secondary " +
                (s.indent ? "pl-9 pr-4" : "px-4")
              }
            >
              <span className="text-ink-muted mr-2">{s.indent ? "○" : "●"}</span>
              {t(s.ko, s.en)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

const SignOutButton = () => {
  const t = useT();
  const { data: me } = useMe();
  const logout = useLogout();
  // Hard redirect after logout: a full reload guarantees a clean logged-out
  // state (no stale cache / no unmount-race with the router) regardless of
  // timing. The session cookie is already cleared by the logout response.
  const signOut = async () => {
    try { await logout.mutateAsync(); } catch { /* clear client state anyway */ }
    window.location.assign("/login");
  };
  return (
    <button
      type="button"
      title={`${me?.email ?? ""} · ${t("로그아웃", "Sign out")}`}
      aria-label={t("로그아웃", "Sign out")}
      onClick={signOut}
      className="sidebar-item__icon text-ink-muted hover:text-status-error transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" strokeLinecap="round" />
        <path d="M10 12h10m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

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

const AdminIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export function Sidebar({ isMobileOpen = false, onCloseMobile }: Props) {
  const location = useLocation();
  const { data: me } = useMe();
  const onPlatesIndex = location.pathname === "/plates";
  const onGuide = location.pathname === "/guide";
  const onAdmin = location.pathname === "/admin";
  const [flyout, setFlyout] = useState<Flyout>(null);
  const close = () => setFlyout(null);

  return (
    <div
      className="relative"
      onMouseLeave={close}
    >
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
        onClick={() => { onCloseMobile?.(); close(); }}
        onMouseEnter={close}
        title="OmixAI-TPD · Workspace"
      >
        <div className="sidebar-brand__logo">TPD</div>
      </Link>

      <nav aria-label="Primary">
        <Link
          to="/plates"
          className={`sidebar-item ${onPlatesIndex ? "sidebar-item--active" : ""}`}
          onClick={() => { onCloseMobile?.(); close(); }}
          onMouseEnter={() => setFlyout("plates")}
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
          onClick={() => { onCloseMobile?.(); close(); }}
          onMouseEnter={() => setFlyout("guide")}
          title="Guide"
          aria-label="Guide"
        >
          <span className="sidebar-item__icon">
            <GuideIcon />
          </span>
        </Link>
        {me?.is_admin && (
          <Link
            to="/admin"
            className={`sidebar-item ${onAdmin ? "sidebar-item--active" : ""}`}
            onClick={() => { onCloseMobile?.(); close(); }}
            onMouseEnter={close}
            title="Admin"
            aria-label="Admin"
          >
            <span className="sidebar-item__icon">
              <AdminIcon />
            </span>
          </Link>
        )}
      </nav>

      <div className="sidebar-footer mt-auto flex flex-col items-center gap-1" onMouseEnter={close}>
        <LangToggle />
        <ThemeToggle />
        <SignOutButton />
      </div>
    </aside>
    {/* Flyout panel — sits to the right of the icon rail. The wrapper div's
        onMouseLeave (above) closes it; staying inside the rail OR the flyout
        keeps it open since both are children of the same wrapper. Hidden on
        screens narrower than lg so the mobile drawer stays simple. */}
    {flyout && (
      <div
        className="hidden lg:block absolute top-0 left-full h-screen w-[240px] z-40 bg-surface-elevated border-r border-line shadow-xl"
      >
        {flyout === "plates" ? (
          <PlatesFlyout onClose={close} />
        ) : (
          <GuideFlyout onClose={close} />
        )}
      </div>
    )}
    </div>
  );
}

// Helper for routes outside Dashboard to use the params hook safely.
export function usePlateContext() {
  const params = useParams<{ plateId?: string; drugId?: string }>();
  return params;
}
