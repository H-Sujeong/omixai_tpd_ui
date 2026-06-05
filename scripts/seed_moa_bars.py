"""Dev-only seed: inject PLACEHOLDER `moa_bars` into existing on_target.json.

Why: the UI's Mechanistic Signatures panel now reads `on_target["moa_bars"]`
(the pipeline's real 4-axis MoA block). The currently-assetized files predate
that field, so this script fills them with *placeholder* values purely so the
display can be built/tuned ahead of real production data.

- Schema mirrors tpd_export/moa_bars.py `build_moa_bars` EXACTLY, so when real
  data arrives the same parser consumes it unchanged.
- `_meta.placeholder = true` marks the block as fake (the UI shows a warning
  badge). Real exports omit this flag.
- Deterministic per (drug, target, axis) — reproducible, varied per card,
  includes some zeros. PAC is biased high (every degrader degrades its target).
- Idempotent + safe: skips any file whose moa_bars is REAL (placeholder absent).
  Re-running only refreshes placeholder blocks.

Usage:
    python scripts/seed_moa_bars.py            # seed under ../TPD_UI_DB
    python scripts/seed_moa_bars.py --db /path/to/TPD_UI_DB
    python scripts/seed_moa_bars.py --clear    # remove placeholder blocks
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

AXES = ("pac", "cytostatic", "transcriptional_stress", "dna_damage_response")
LABELS = {
    "pac": "Protein Abundance Control",
    "cytostatic": "Cytostatic Effect",
    "transcriptional_stress": "Transcriptional Stress",
    "dna_damage_response": "DNA Damage Response",
}
THRESHOLDS = {
    "pac": [0.5, 1.0, 1.5, 2.0, 3.0],
    "cytostatic": [0.5, 1.0, 1.5, 2.0, 2.5],
    "transcriptional_stress": [0.5, 1.0, 1.5, 2.0, 2.5],
    "dna_damage_response": [0.5, 1.0, 1.5, 2.0, 2.5],
}


def _h(*parts: str) -> int:
    """Stable, cross-run hash → non-negative int (avoids Python hash seed)."""
    return int(hashlib.md5("|".join(parts).encode()).hexdigest()[:8], 16)


def _score(drug: str, target: str, axis: str) -> int:
    h = _h(drug, target, axis)
    if axis == "pac":
        return 2 + (h % 4)        # 2..5 — degrader's primary axis runs high
    return h % 6 if (h % 6) <= 5 else 5   # 0..5, naturally includes zeros


def _value(score: int, th: list[float]) -> float:
    if score <= 0:
        return round(th[0] * 0.3, 3)      # below the first threshold
    if score >= 5:
        return round(th[4] + 0.5, 3)
    return round((th[score - 1] + th[score]) / 2, 3)


def build_placeholder_moa_bars(drug: str, target: str) -> dict:
    out: dict = {
        "_meta": {
            "max": 5,
            "axes": list(AXES),
            "labels": dict(LABELS),
            "placeholder": True,
        }
    }
    for axis in AXES:
        th = THRESHOLDS[axis]
        s = _score(drug, target, axis)
        entry = {"score": s, "value": _value(s, th), "thresholds": list(th)}
        if axis == "pac":
            entry["source"] = "placeholder_seed"
            entry["n_target_measured"] = 1
        out[axis] = entry
    return out


def _is_placeholder(mb: object) -> bool:
    return (
        isinstance(mb, dict)
        and isinstance(mb.get("_meta"), dict)
        and bool(mb["_meta"].get("placeholder"))
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    default_db = Path(__file__).resolve().parents[2] / "TPD_UI_DB"
    ap.add_argument("--db", type=Path, default=default_db)
    ap.add_argument("--clear", action="store_true",
                    help="remove placeholder moa_bars instead of seeding")
    args = ap.parse_args()

    files = sorted(args.db.glob("plate_*/*/*/on_target.json"))
    if not files:
        print(f"no on_target.json under {args.db}")
        return

    seeded = skipped_real = cleared = 0
    for p in files:
        d = json.loads(p.read_text(encoding="utf-8"))
        existing = d.get("moa_bars")
        if args.clear:
            if _is_placeholder(existing):
                d.pop("moa_bars", None)
                p.write_text(json.dumps(d, ensure_ascii=False, allow_nan=False),
                             encoding="utf-8")
                cleared += 1
            continue
        if existing is not None and not _is_placeholder(existing):
            skipped_real += 1            # real data already present — never clobber
            continue
        d["moa_bars"] = build_placeholder_moa_bars(
            str(d.get("drug_id", p.parts[-3])), str(d.get("target", p.parts[-2])))
        p.write_text(json.dumps(d, ensure_ascii=False, allow_nan=False),
                     encoding="utf-8")
        seeded += 1

    if args.clear:
        print(f"cleared placeholder moa_bars from {cleared} file(s)")
    else:
        print(f"seeded {seeded} file(s); skipped {skipped_real} with real moa_bars")


if __name__ == "__main__":
    main()
