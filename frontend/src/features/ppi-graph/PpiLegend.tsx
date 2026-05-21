import type { PpiRole } from "@/types/api";

const ROLE_ITEMS: { role: PpiRole; label: string }[] = [
  { role: "target", label: "Primary target" },
  { role: "activated", label: "Activated (corr ≥ 0.5)" },
  { role: "suppressed", label: "Suppressed (corr ≤ −0.3)" },
  { role: "info", label: "Informational" },
  { role: "unknown", label: "Unknown / weak" },
];

const ROLE_COLOR: Record<PpiRole, string> = {
  target: "var(--color-role-target)",
  activated: "var(--color-role-activated)",
  suppressed: "var(--color-role-suppressed)",
  info: "var(--color-role-info)",
  unknown: "var(--color-role-unknown)",
};

export function PpiLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-meta text-ink-secondary">
      {ROLE_ITEMS.map((i) => (
        <div key={i.role} className="flex items-center gap-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ background: ROLE_COLOR[i.role] }}
            aria-hidden
          />
          <span>{i.label}</span>
        </div>
      ))}
    </div>
  );
}
