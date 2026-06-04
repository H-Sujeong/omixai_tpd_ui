import type { ReactNode } from "react";

interface Props {
  title: ReactNode;
  tooltip?: string;
  accent?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
  status?: string;
  className?: string;
  children: ReactNode;
}

export function PanelCard({
  title,
  tooltip,
  accent,
  meta,
  actions,
  status,
  className,
  children,
}: Props) {
  return (
    <section className={`panel-card ${accent ? "panel-card--accent" : ""} ${className ?? ""}`}>
      <header className="panel-header">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="panel-title truncate">{title}</h3>
            {tooltip && (
              <span
                className="text-ink-muted text-meta cursor-help"
                title={tooltip}
                aria-label={tooltip}
              >
                ⓘ
              </span>
            )}
            {status === "empty" && (
              <span className="text-ink-muted text-meta" title="No data for this drug/target">
                ○
              </span>
            )}
          </div>
          {meta && <div className="panel-meta mt-0.5">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-1.5">{actions}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}
