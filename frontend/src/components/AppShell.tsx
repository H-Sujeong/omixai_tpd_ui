import { useEffect, useState, type ReactNode } from "react";
import { Sidebar, type PinnedFlyout } from "@/components/Sidebar";

const PIN_STORAGE_KEY = "omixai-sidebar-pin";

function loadPinned(): PinnedFlyout {
  try {
    const v = localStorage.getItem(PIN_STORAGE_KEY);
    return v === "plates" || v === "guide" ? v : null;
  } catch {
    return null;
  }
}

/**
 * AppShell: deep-navy app frame with a 240px sidebar (design_02) on the left
 * and a workspace column on the right.
 *
 * Step 3 (2026-05-21): SidebarContext removed — pure layout.
 * Step 7 (2026-05-21): added mobile drawer state. On <lg screens the sidebar
 * collapses behind a hamburger button (fixed, top-left, z-30). Backdrop is
 * z-40, sidebar drawer z-50. Esc closes; body scroll locks while open.
 * v2.15.2 (2026-06-08): pin/unpin for the icon-rail flyouts (Plates / Guide).
 * Persisted in localStorage; when pinned the main column shifts right so the
 * flyout sits beside content rather than on top of it (Notion-style).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinnedFlyout, setPinnedFlyout] = useState<PinnedFlyout>(loadPinned);

  // Persist pin selection so it survives reload — matches the "stays open"
  // expectation users have for a pinned panel.
  useEffect(() => {
    try {
      if (pinnedFlyout) localStorage.setItem(PIN_STORAGE_KEY, pinnedFlyout);
      else localStorage.removeItem(PIN_STORAGE_KEY);
    } catch {
      /* private mode / quota — fall through; in-memory state still applies */
    }
  }, [pinnedFlyout]);

  // Esc closes the mobile drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen flex bg-surface-base text-ink-primary">
      <button
        type="button"
        className="lg:hidden fixed top-3 left-3 z-30 w-10 h-10 rounded-md border border-line bg-surface-elevated flex items-center justify-center text-ink-primary hover:border-brand-primary/45 transition-colors duration-fast"
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <Sidebar
        isMobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        pinnedFlyout={pinnedFlyout}
        onPinnedFlyoutChange={setPinnedFlyout}
      />

      {/* When a flyout is pinned (≥lg only — mobile uses the drawer), shift the
          main column right by 240px so the flyout sits beside content instead
          of covering it. Smooth transition keeps the pin/unpin act readable. */}
      <main
        className={`flex-1 min-w-0 flex flex-col transition-[margin-left] duration-base ${
          pinnedFlyout ? "lg:ml-[240px]" : ""
        }`}
      >
        {children}
      </main>
    </div>
  );
}
