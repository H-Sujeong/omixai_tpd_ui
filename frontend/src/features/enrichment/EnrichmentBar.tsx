import Plot from "react-plotly.js";
import type { GoTerm } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";

const CATEGORY_COLOR: Record<string, string> = {
  BP: "#A871FF",
  MF: "#4ADE80",
  CC: "#60A5FA",
};

interface Props {
  terms: GoTerm[];
  height?: number;
}

export function EnrichmentBar({ terms, height = 380 }: Props) {
  if (!terms.length) return <EmptyBlock label="Enrichment 결과가 없습니다." />;
  const sorted = [...terms].sort((a, b) => a.score - b.score);
  return (
    <Plot
      data={[
        {
          type: "bar",
          orientation: "h",
          x: sorted.map((g) => g.score),
          y: sorted.map((g) => g.term.length > 60 ? g.term.slice(0, 57) + "…" : g.term),
          marker: {
            color: sorted.map((g) => CATEGORY_COLOR[g.category] ?? "#94A3B8"),
          },
          text: sorted.map((g) => `${g.category} · p=${g.pvalue.toExponential(2)}`),
          hovertemplate: "%{y}<br>score=%{x:.1f}<br>%{text}<extra></extra>",
        },
      ]}
      layout={{
        margin: { l: 250, r: 10, t: 10, b: 30 },
        height,
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        xaxis: { title: { text: "Enrichment score" }, zeroline: true },
        yaxis: { automargin: true },
        font: { family: "Inter, IBM Plex Sans, Pretendard, sans-serif", size: 10, color: "#B1BAC4" },
        showlegend: false,
      }}
      config={{ responsive: true, displayModeBar: false }}
      style={{ width: "100%" }}
    />
  );
}
