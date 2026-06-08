import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LangToggle } from "@/components/LangToggle";
import { useMe, useLogout } from "@/api/auth";
import { usePlates } from "@/api/queries";
import { useT, useUiLang } from "@/store/uiLang";
import { useTheme } from "@/hooks/useTheme";

type Flyout = "plates" | "guide" | null;
export type PinnedFlyout = "plates" | "guide" | null;

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

/**
 * Labels for the rail's footer icons — shown ONLY at the bottom of the flyout
 * when expanded (any pin active). The icons themselves stay in the rail and
 * remain the click target; these are explanatory text positioned to sit
 * horizontally beside each icon (the rail footer and the flyout footer both
 * use the same pt-2.5 / gap-2 / 38px-row layout so the rows line up visually).
 *
 * The labels ARE clickable too — convenience hit area — but the rail icons
 * stay where they are. We don't move the controls.
 */
function FlyoutFooter() {
  const t = useT();
  const { lang, setLang } = useUiLang();
  const { theme, toggleTheme } = useTheme();
  const { data: me } = useMe();
  const logout = useLogout();
  const isDark = theme === "dark";

  const signOut = async () => {
    try { await logout.mutateAsync(); } catch { /* clear client state anyway */ }
    window.location.assign("/login");
  };

  // Same padding/gap stack as the rail's `.sidebar-footer` so rows align with
  // the LangToggle / ThemeToggle / SignOutButton icons sitting in the rail.
  // Each row's height = 38px (matches .sidebar-item: padding 8 + 22 icon + 8).
  const rowCls =
    "text-left px-3 h-[38px] flex items-center text-body rounded-md transition-colors duration-fast";

  return (
    <div className="border-t border-line pt-2.5 mt-auto flex flex-col items-stretch gap-1 shrink-0">
      <button
        type="button"
        onClick={() => setLang(lang === "ko" ? "en" : "ko")}
        className={`${rowCls} text-ink-secondary hover:text-ink-primary hover:bg-surface-soft`}
        title={lang === "ko" ? "English로 전환" : "한국어로 전환"}
      >
        {lang === "ko" ? "한국어 / English" : "English / 한국어"}
      </button>
      <button
        type="button"
        onClick={toggleTheme}
        className={`${rowCls} text-ink-secondary hover:text-ink-primary hover:bg-surface-soft`}
      >
        {isDark ? t("라이트 모드", "Light mode") : t("다크 모드", "Dark mode")}
      </button>
      <button
        type="button"
        onClick={signOut}
        title={me?.email ?? undefined}
        className={`${rowCls} text-ink-secondary hover:text-status-error hover:bg-surface-soft`}
      >
        {t("로그아웃", "Sign out")}
      </button>
    </div>
  );
}

function PinButton({
  pinned,
  onToggle,
}: {
  pinned: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pinned}
      title={pinned ? t("고정 해제", "Unpin") : t("패널 고정", "Pin panel")}
      className={`shrink-0 rounded-md p-1 transition-colors duration-fast ${
        pinned
          ? "text-brand-primary bg-brand-primary/12"
          : "text-ink-muted hover:text-ink-primary hover:bg-surface-soft"
      }`}
    >
      {/* Pushpin glyph — filled head when pinned, outline when not, so the
          state reads visually at a glance. */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M9 4h6v5l3 5H6l3-5V4z" fill={pinned ? "currentColor" : "none"} strokeLinejoin="round" />
        <path d="M12 14v6" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function PlatesFlyout({
  onClose,
  pinned,
  expanded,
  onTogglePin,
}: {
  onClose: () => void;
  pinned: boolean;
  expanded: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  const plates = usePlates();
  return (
    <div className="flex flex-col h-full pb-3">
      {/* Height & vertical centering chosen so the header's bottom border lines
          up with the rail's brand bottom border (12px pad-top + 48px brand +
          1px = y=61). pb-3 on the wrapper does the same for the footer
          (rail's app-sidebar carries 12px pad-bottom, so the footer's
          border-top y matches the rail's .sidebar-footer border-top). */}
      <header
        className="px-4 border-b border-line flex items-center gap-2 shrink-0"
        style={{ height: 61 }}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-body-strong text-ink-primary leading-tight">
            {t("실험", "Experiments")}
          </h3>
          <p className="text-meta text-ink-muted leading-tight">
            {t("내가 볼 수 있는 실험", "Experiments you can open")}
          </p>
        </div>
        <PinButton pinned={pinned} onToggle={onTogglePin} />
      </header>
      <ul className="flex-1 overflow-y-auto py-1">
        {plates.isLoading && (
          <li className="px-4 py-2 text-meta text-ink-muted">
            {t("불러오는 중…", "Loading…")}
          </li>
        )}
        {!plates.isLoading && !plates.data?.length && (
          <li className="px-4 py-2 text-meta text-ink-muted">
            {t("이용 가능한 실험이 없습니다", "No accessible experiments")}
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
      {expanded && <FlyoutFooter />}
    </div>
  );
}

function GuideFlyout({
  onClose,
  pinned,
  expanded,
  onTogglePin,
}: {
  onClose: () => void;
  pinned: boolean;
  expanded: boolean;
  onTogglePin: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col h-full pb-3">
      <header
        className="px-4 border-b border-line flex items-center gap-2 shrink-0"
        style={{ height: 61 }}
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-body-strong text-ink-primary leading-tight">
            {t("가이드", "Guide")}
          </h3>
          <p className="text-meta text-ink-muted leading-tight">
            {t("섹션을 클릭하면 이동합니다", "Click a section to jump")}
          </p>
        </div>
        <PinButton pinned={pinned} onToggle={onTogglePin} />
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
      {expanded && <FlyoutFooter />}
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
      className="sidebar-item text-ink-muted hover:text-status-error transition-colors"
    >
      <span className="sidebar-item__icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M15 17v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" strokeLinecap="round" />
          <path d="M10 12h10m0 0-3-3m3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
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
  /** Notion-style pin. When set, that flyout stays visible regardless of hover
   *  state, and AppShell shifts the main column right by 240px so the flyout
   *  sits beside content. Hover still previews the other flyout temporarily. */
  pinnedFlyout?: PinnedFlyout;
  onPinnedFlyoutChange?: (next: PinnedFlyout) => void;
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

export function Sidebar({
  isMobileOpen = false,
  onCloseMobile,
  pinnedFlyout = null,
  onPinnedFlyoutChange,
}: Props) {
  const location = useLocation();
  const { data: me } = useMe();
  const onPlatesIndex = location.pathname === "/plates";
  const onGuide = location.pathname === "/guide";
  const onAdmin = location.pathname === "/admin";
  // Initial flyout follows the pinned panel so a reload-with-pin lands on the
  // open state immediately rather than a flash of icon-rail-only.
  const [flyout, setFlyout] = useState<Flyout>(pinnedFlyout);
  // When the pinned panel changes externally, mirror it into local flyout
  // state so the user sees the new pinned panel even without re-hovering.
  // (Won't fight hover updates — those drive setFlyout directly.)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setFlyout(pinnedFlyout); }, [pinnedFlyout]);
  // mouseLeave behaviour: revert to the pinned panel (if any) instead of
  // closing. If nothing is pinned, close as before.
  const close = () => setFlyout(pinnedFlyout);
  const togglePin = (which: "plates" | "guide") =>
    onPinnedFlyoutChange?.(pinnedFlyout === which ? null : which);

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
          title="Experiments"
          aria-label="Experiments"
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

      {/* Rail footer — always visible. When expanded the labels appear to the
          right (inside the flyout) at the same vertical heights, so the icons
          stay put while the names are revealed. */}
      <div className="sidebar-footer mt-auto flex flex-col items-center gap-1" onMouseEnter={close}>
        <LangToggle />
        <ThemeToggle />
        <SignOutButton />
      </div>
    </aside>
    {/* Flyout panel — viewport-fixed (NOT absolute to wrapper) so it tracks
        the rail's sticky position during page scroll. If we used `absolute`
        the panel would scroll with the wrapper and detach from the rail
        whenever the user scrolled the dashboard down.
        left = rail width (var(--space-sidebar-width)). */}
    {flyout && (
      <div
        className={`hidden lg:block fixed top-0 h-screen w-[240px] z-40 bg-surface-elevated border-r border-line ${
          pinnedFlyout === flyout ? "" : "shadow-xl"
        }`}
        style={{ left: "var(--space-sidebar-width)" }}
      >
        {flyout === "plates" ? (
          <PlatesFlyout
            onClose={close}
            pinned={pinnedFlyout === "plates"}
            expanded={pinnedFlyout !== null}
            onTogglePin={() => togglePin("plates")}
          />
        ) : (
          <GuideFlyout
            onClose={close}
            pinned={pinnedFlyout === "guide"}
            expanded={pinnedFlyout !== null}
            onTogglePin={() => togglePin("guide")}
          />
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
