import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabDef {
  id: string;
  label: string;
  icon?: ReactNode;
  badge?: string;
  disabled?: boolean;
  hint?: string;
}

interface Props {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  /** Screen-reader label for the tablist. */
  ariaLabel?: string;
  /** Optional extra classes appended to the container. */
  className?: string;
}

/**
 * Horizontal tab strip (Step 2, 2026-05-21).
 *
 * WAI-ARIA "tabs with automatic activation" pattern:
 * - role=tablist on container, role=tab on each button
 * - aria-selected + aria-controls=tabpanel-${id}
 * - Only the active tab is in the tab sequence (tabIndex=0); the others
 *   are tabIndex=-1. Arrow keys move focus AND change selection (automatic
 *   activation is appropriate because tab panels are already rendered —
 *   no remote fetch penalty for hovering).
 * - Home / End jump to first / last enabled tab.
 *
 * Style: underline accent on active, brand-tinted hover on others.
 * Mobile: container is overflow-x-auto with snap so narrow viewports can
 * scroll horizontally if N tabs ever exceed width (current N=3 fits easily).
 *
 * Step 3 wires this into DashboardPage (replacing the sidebar drug-section
 * sub-tabs). Until then this component is exported but not mounted.
 */
export function TabBar({
  tabs,
  active,
  onChange,
  ariaLabel = "Dashboard sections",
  className,
}: Props) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndices = tabs.reduce<number[]>((acc, t, i) => {
    if (!t.disabled) acc.push(i);
    return acc;
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
    const curr = enabledIndices.indexOf(idx);
    if (curr === -1) return;
    let nextIdx = -1;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIdx = enabledIndices[(curr + 1) % enabledIndices.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIdx =
          enabledIndices[(curr - 1 + enabledIndices.length) % enabledIndices.length];
        break;
      case "Home":
        nextIdx = enabledIndices[0];
        break;
      case "End":
        nextIdx = enabledIndices[enabledIndices.length - 1];
        break;
      default:
        return;
    }
    e.preventDefault();
    if (nextIdx >= 0) {
      onChange(tabs[nextIdx].id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`tabbar ${className ?? ""}`}
    >
      {tabs.map((t, i) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={t.disabled}
            title={t.hint}
            onClick={() => !t.disabled && onChange(t.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            className={`tabbar__tab ${isActive ? "tabbar__tab--active" : ""}`}
          >
            {t.icon && (
              <span aria-hidden className="inline-flex">
                {t.icon}
              </span>
            )}
            <span>{t.label}</span>
            {t.badge && (
              <span
                className="ml-1 text-meta px-1.5 py-0.5 rounded-pill bg-surface-overlay text-ink-muted"
                aria-hidden
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
