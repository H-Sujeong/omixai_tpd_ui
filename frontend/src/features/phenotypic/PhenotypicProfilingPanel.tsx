import Plot from "react-plotly.js";
import type { PhenotypicProfiling } from "@/types/api";
import { EmptyBlock } from "@/components/LoadingBlock";
import { useT } from "@/store/uiLang";

interface Props {
  data: PhenotypicProfiling | null;
}

export function PhenotypicProfilingPanel({ data }: Props) {
  const t = useT();
  if (!data) return <EmptyBlock label={t("Growth-rate 데이터가 없습니다.", "No growth-rate data.")} />;

  const sharedLayout = {
    paper_bgcolor: "transparent",
    plot_bgcolor: "transparent",
    margin: { l: 36, r: 8, t: 8, b: 28 },
    showlegend: false,
    font: { family: "Inter, IBM Plex Sans, Pretendard, sans-serif", size: 10, color: "#B1BAC4" },
    height: 200,
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <div className="text-body font-semibold mb-1">Growth Rate</div>
        <Plot
          data={[
            {
              type: "scatter",
              mode: "lines",
              x: data.gr_curve_dmso.map((p) => p.t_hours),
              y: data.gr_curve_dmso.map((p) => p.grv),
              line: { color: "#7D8590", width: 1.5, dash: "dash" },
              name: "DMSO",
              hovertemplate: "DMSO<br>%{x}h · %{y:.2f}<extra></extra>",
            },
            {
              type: "scatter",
              mode: "lines+markers",
              x: data.gr_curve.map((p) => p.t_hours),
              y: data.gr_curve.map((p) => p.grv),
              line: { color: "#A871FF", width: 2 },
              marker: { size: 4 },
              name: "Drug",
              hovertemplate: "Drug<br>%{x}h · %{y:.2f}<extra></extra>",
            },
            {
              type: "scatter",
              mode: "lines",
              x: [
                data.gr_curve[0]?.t_hours ?? 0,
                data.gr_curve[data.gr_curve.length - 1]?.t_hours ?? 0,
              ],
              y: [1, 1],
              line: { color: "#7D8590", dash: "dot", width: 1 },
              hoverinfo: "skip",
              name: "guideline",
            },
          ]}
          layout={{
            ...sharedLayout,
            // The curve already spans exactly the drug-effect window (e.g.
            // 10–23.5h at 0.5h steps), so the x-axis range itself conveys the
            // window — no separate shaded sub-region is drawn.
            xaxis: { title: { text: "Time (h)" }, zeroline: false },
            yaxis: { title: { text: "GR(t)" }, zeroline: false, range: [-0.5, 1.5] },
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
        />
        <div className="mt-1 text-caption text-ink-secondary">
          <span className="font-semibold">GR score</span>
          {data.gr_window && (
            <span className="text-ink-muted"> ({data.gr_window[0]}–{data.gr_window[1]}h)</span>
          )}
          :{" "}
          <span className="tabular">{data.gr_score !== null ? data.gr_score.toFixed(4) : "—"}</span>
          {data.growth_class && <span className="ml-3 chip">{data.growth_class}</span>}
        </div>
      </div>
      <div>
        <div className="text-body font-semibold mb-1">Phenome Tracking</div>
        <Plot
          data={[
            {
              type: "scatter",
              mode: "lines+markers",
              x: data.phenome_dmso.map((p) => p.t_step),
              y: data.phenome_dmso.map((p) => p.deviation),
              line: { color: "#7D8590", width: 1.5 },
              marker: { size: 6, color: "#7D8590" },
              name: "DMSO",
              hovertemplate: "DMSO<br>step %{x} · %{y:.2f}<extra></extra>",
            },
            {
              type: "scatter",
              mode: "lines+markers",
              x: data.phenome_drug.map((p) => p.t_step),
              y: data.phenome_drug.map((p) => p.deviation),
              line: { color: "#A871FF", width: 2 },
              marker: { size: 7, color: "#A871FF" },
              name: "Drug",
              hovertemplate: "Drug<br>step %{x} · %{y:.2f}<extra></extra>",
            },
          ]}
          layout={{
            ...sharedLayout,
            xaxis: { title: { text: "Vehicle trajectory axis (normalized)" }, zeroline: false },
            yaxis: { title: { text: "Deviation from vehicle axis" }, zeroline: true },
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: "100%" }}
        />
      </div>
    </div>
  );
}
