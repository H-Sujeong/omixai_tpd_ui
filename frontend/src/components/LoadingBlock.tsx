import { useT } from "@/store/uiLang";

export function LoadingBlock({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-ink-muted text-body">
      <span className="animate-pulse">{label}</span>
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const t = useT();
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-md border border-status-error/40 bg-status-error/10 text-status-error px-4 py-3 text-body">
      <div className="font-semibold">{t("데이터를 불러오지 못했습니다", "Failed to load data")}</div>
      <div className="text-meta mt-1 break-all opacity-80">{msg}</div>
      <div className="text-meta mt-1 opacity-70">
        {t("Retry 또는 target 필터 변경을 시도해주세요.", "Try again or change the target filter.")}
      </div>
    </div>
  );
}

export function EmptyBlock({ label }: { label?: string }) {
  const t = useT();
  return (
    <div className="flex items-center justify-center py-8 text-ink-muted text-body italic text-center">
      {label ?? t("데이터 없음", "No data")}
    </div>
  );
}
