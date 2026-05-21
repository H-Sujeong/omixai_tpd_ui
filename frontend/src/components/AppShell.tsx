import { useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";

/**
 * AppShell: deep-navy app frame with a 240px sidebar (design_02) on the left
 * and a workspace column on the right.
 *
 * Step 3 (2026-05-21): SidebarContext removed — pure layout.
 * Step 7 (2026-05-21): added mobile drawer state. On <lg screens the sidebar
 * collapses behind a hamburger button (fixed, top-left, z-30). Backdrop is
 * z-40, sidebar drawer z-50. Esc closes; body scroll locks while open.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Esc closes the drawer.
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileOpen]);

  // Prevent body scroll while drawer is open (avoids the page scrolling
  // behind the overlay on mobile).
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
      {/* Mobile hamburger — fixed, visible only <lg. Sits above topbar. */}
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

      {/* Backdrop — clicks close the drawer. Visible only when open + <lg. */}
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
      />

      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
