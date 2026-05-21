import { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import { useInteractomeNode } from "@/api/queries";
import { PpiGraph } from "@/features/ppi-graph/PpiGraph";
import { EmptyBlock, ErrorBlock, LoadingBlock } from "@/components/LoadingBlock";

interface Props {
  plateId: string;
  drugId: string;
  target: string;
  nodeId: string | null;
  onClose: () => void;
}

/**
 * E12 Interactome slide panel — fixed 520px width, z-index 60.
 * Level 1: ego graph for clicked node.
 * Level 2: per-concentration decay (꺾은선) + GO BP/MF/CC bar chart.
 * Back nav: Level 2 → Level 1 → close.
 */
export function InteractomeSlide({ plateId, drugId, target, nodeId, onClose }: Props) {
  const [level, setLevel] = useState<1 | 2>(1);

  // Escape key: L2 → L1 → close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (level === 2) setLevel(1);
        else onClose();
      } else if (e.key === "Backspace" && level === 2) {
        setLevel(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [level, onClose]);

  const open = nodeId !== null;
  const { data, isLoading, error } = useInteractomeNode(
    plateId,
    open ? drugId : undefined,
    open ? target : undefined,
    nodeId,
  );

  // Reset to L1 when node changes
  useEffect(() => {
    setLevel(1);
  }, [nodeId]);

  return (
    <aside
      className={`fixed right-0 bottom-0 bg-surface-panel border-l border-line shadow-lg transition-transform duration-200 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
      style={{ top: "var(--height-topbar)", width: 520, maxWidth: "100vw", zIndex: 60 }}
      aria-hidden={!open}
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          {level === 2 && (
            <button className="btn btn--ghost text-caption" onClick={() => setLevel(1)}>
              ←
            </button>
          )}
          <h2 className="text-h3 font-semibold">
            Interactome · <span className="font-mono">{nodeId ?? "—"}</span>
            <span className="ml-2 text-caption text-ink-muted">
              L{level} / target {target}
            </span>
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {level === 1 && (
            <button className="btn text-caption" onClick={() => setLevel(2)}>
              Decay + GO →
            </button>
          )}
          <button className="btn btn--ghost text-caption" onClick={onClose} title="Close (Esc)">
            ✕
          </button>
        </div>
      </header>

      <div
        className="overflow-y-auto p-3"
        style={{ height: "calc(100vh - var(--height-topbar) - 3.5rem)" }}
      >
        {!open && <EmptyBlock label="PPI 노드를 클릭하면 ego network가 열립니다." />}
        {open && isLoading && <LoadingBlock />}
        {open && error && <ErrorBlock error={error} />}
        {open && data && level === 1 && <InteractomeLevel1 data={data} />}
        {open && data && level === 2 && <InteractomeLevel2 data={data} />}
      </div>
    </aside>
  );
}

function InteractomeLevel1({ data }: { data: any }) {
  const { node } = data;
  return (
    <div className="space-y-3">
      <div className="text-caption text-ink-secondary">
        Ego (1-hop) — nodes: {node.ego.nodes.length} · edges: {node.ego.edges.length}
      </div>
      <PpiGraph nodes={node.ego.nodes} edges={node.ego.edges} height={360} />
      <div className="text-caption text-ink-secondary">
        클릭한 노드가 속한 community 전환은 좌측 PPI 패널의 노드 메뉴를 사용하세요.
      </div>
    </div>
  );
}

function InteractomeLevel2({ data }: { data: any }) {
  const { node } = data;
  const decay = node.decay as Array<{ concentration_um: number; t_hours: number; remaining: number }>;
  const byConc = useMemo(() => {
    const m = new Map<number, { t: number[]; v: number[] }>();
    decay.forEach((p) => {
      const e = m.get(p.concentration_um) ?? { t: [], v: [] };
      e.t.push(p.t_hours);
      e.v.push(p.remaining);
      m.set(p.concentration_um, e);
    });
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0]);
  }, [decay]);

  const traces = byConc.map(([conc, e], i) => ({
    type: "scatter" as const,
    mode: "lines+markers" as const,
    x: e.t,
    y: e.v,
    name: `${conc} µM`,
    line: { width: 2, color: ["#94A3B8", "#2663EB", "#BE185D", "#0D9488"][i % 4] },
    marker: { size: 6 },
    hovertemplate: `${conc} µM<br>%{x}h · remaining %{y:.2f}<extra></extra>`,
  }));

  return (
    <div className="space-y-4">
      <section>
        <div className="text-body font-semibold mb-1">Proteome decay (concentration × time)</div>
        {traces.length === 0 ? (
          <EmptyBlock label="Decay 데이터가 아직 계산되지 않았습니다 (합성 fallback 사용 가능)." />
        ) : (
          <Plot
            data={traces as any}
            layout={{
              height: 230,
              margin: { l: 36, r: 8, t: 8, b: 28 },
              paper_bgcolor: "transparent",
              plot_bgcolor: "transparent",
              xaxis: { title: { text: "Time (hr)" } },
              yaxis: { title: { text: "Remaining" }, range: [0, 1.1] },
              shapes: [
                {
                  type: "line",
                  xref: "paper",
                  x0: 0,
                  x1: 1,
                  yref: "y",
                  y0: 0.5,
                  y1: 0.5,
                  line: { color: "#94A3B8", dash: "dot", width: 1 },
                },
              ],
              legend: { orientation: "h", y: -0.2 },
              font: { family: "Inter, Pretendard, sans-serif", size: 10, color: "#475569" },
            }}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: "100%" }}
          />
        )}
      </section>
      <section className="space-y-3">
        <div className="text-body font-semibold mb-1">GO enrichment (BP / MF / CC)</div>
        {(["BP", "MF", "CC"] as const).map((cat) => {
          const items = (node.go_terms?.[cat] ?? []) as Array<{ term: string; score: number; pvalue: number }>;
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="text-caption text-ink-secondary mb-1">{cat}</div>
              <div className="space-y-1">
                {items.slice(0, 5).map((g) => (
                  <div key={g.term} className="flex items-center gap-2 text-caption">
                    <div
                      className="h-3 rounded-sm"
                      style={{
                        width: `${Math.min(140, g.score / 5)}px`,
                        background:
                          cat === "BP" ? "#2663EB" : cat === "MF" ? "#0D9488" : "#BE185D",
                      }}
                    />
                    <span className="truncate" title={g.term}>
                      {g.term}
                    </span>
                    <span className="ml-auto text-ink-muted tabular">
                      p={g.pvalue.toExponential(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
