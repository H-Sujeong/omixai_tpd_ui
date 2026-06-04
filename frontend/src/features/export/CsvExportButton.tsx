import { downloadText } from "./tableExports";
import { useT } from "@/store/uiLang";

interface Props {
  filename: string;
  /** Builds the CSV text lazily on click. */
  build: () => string;
  label?: string;
  title?: string;
}

/** Small "CSV ⬇" chip that generates and downloads a CSV client-side. */
export function CsvExportButton({ filename, build, label = "CSV ⬇", title }: Props) {
  const t = useT();
  return (
    <button
      type="button"
      className="chip text-meta hover:text-brand-primary transition-colors duration-fast"
      title={title ?? t("CSV로 내보내기", "Export as CSV")}
      onClick={() => downloadText(filename, build(), "text/csv")}
    >
      {label}
    </button>
  );
}
