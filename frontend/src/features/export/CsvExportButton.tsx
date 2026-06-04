import { downloadText } from "./tableExports";

interface Props {
  filename: string;
  /** Builds the CSV text lazily on click. */
  build: () => string;
  label?: string;
  title?: string;
}

/** Small "CSV ⬇" chip that generates and downloads a CSV client-side. */
export function CsvExportButton({ filename, build, label = "CSV ⬇", title }: Props) {
  return (
    <button
      type="button"
      className="chip text-meta hover:text-brand-primary transition-colors duration-fast"
      title={title ?? "CSV로 내보내기"}
      onClick={() => downloadText(filename, build(), "text/csv")}
    >
      {label}
    </button>
  );
}
