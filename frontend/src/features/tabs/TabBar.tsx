import type { ReactNode } from "react";

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
}

export function TabBar({ tabs, active, onChange }: Props) {
  return (
    <nav className="tabbar" role="tablist" aria-label="Dashboard modules">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${t.id}`}
            disabled={t.disabled}
            title={t.hint}
            onClick={() => !t.disabled && onChange(t.id)}
            className={`tabbar__tab ${isActive ? "tabbar__tab--active" : ""} ${
              t.disabled ? "opacity-40 cursor-not-allowed" : ""
            }`}
          >
            {t.icon && <span aria-hidden>{t.icon}</span>}
            <span>{t.label}</span>
            {t.badge && <span className="chip">{t.badge}</span>}
          </button>
        );
      })}
    </nav>
  );
}
