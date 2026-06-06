"""Phenome-tracking transform — derives a compact deviation track from the REAL
GR drug-vs-DMSO curves (no fabrication). Extracted from the former synthesize.py
(whose fake PPI/landscape/GO generators were removed) so a real-data transform no
longer lives in a module named "synthesize"."""

from __future__ import annotations

from typing import Any


def phenome_track_from_gr(gr_values: list[float], dmso_values: list[float]) -> list[dict[str, Any]]:
    """Compress the real GR drug-vs-DMSO curves into an 11-step deviation track."""
    if not gr_values:
        return []
    n_target = 10
    n = len(gr_values)
    out: list[dict[str, Any]] = []
    for step in range(n_target + 1):
        idx = int(round(step * (n - 1) / n_target)) if n > 1 else 0
        dmso = dmso_values[idx] if idx < len(dmso_values) and dmso_values else 1.0
        drug = gr_values[idx] if idx < len(gr_values) else 0.0
        deviation = float(dmso - drug)
        out.append({"t_step": step, "deviation": deviation})
    return out
