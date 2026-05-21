interface Props {
  label?: string | null;
  growth_class?: string | null;
}

export function StatusBadge({ label, growth_class }: Props) {
  const text = label ?? growth_class ?? null;
  if (!text) return null;
  const v = text.toLowerCase();
  let cls = "badge badge--neutral";
  if (v.includes("strong") && v.includes("cytotoxic")) cls = "badge badge--cytotoxic-strong";
  else if (v.includes("cytotoxic")) cls = "badge badge--cytotoxic-moderate";
  else if (v.includes("cytostatic")) cls = "badge badge--warning";
  else if (v.includes("growth")) cls = "badge badge--success";
  else if (v.includes("pass")) cls = "badge badge--success";
  else if (v.includes("fail") || v.includes("suppressed")) cls = "badge badge--error";
  else if (v.includes("review") || v.includes("warning")) cls = "badge badge--warning";
  else if (v.includes("info")) cls = "badge badge--info";
  return <span className={cls}>{text}</span>;
}
