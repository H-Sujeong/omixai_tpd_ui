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
              <span className="relative inline-flex items-center group shrink-0" tabIndex={0}>
                <span className="text-ink-muted text-meta cursor-help select-none" aria-label={tooltip}>
                  ⓘ
                </span>
                <span
                  role="tooltip"
                  className="pointer-events-none absolute left-0 top-full mt-1.5 z-50 w-72 max-w-[19rem] whitespace-pre-wrap rounded-md border border-line bg-surface-elevated px-3 py-2.5 text-meta text-ink-secondary leading-relaxed shadow-lg opacity-0 invisible transition-opacity duration-fast group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible"
                >
                  {tooltip}
                </span>
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
