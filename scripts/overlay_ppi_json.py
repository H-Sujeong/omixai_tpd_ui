"""Overlay the full PPI_JSON production set onto the existing real plates.

PPI_JSON (ui_workspace/PPI_JSON/exp_{10,3}uM/<DRUG>_<WELL>/<TARGET>/<4h|24h>/
{landscape,on_target}.json) is the complete PPI/landscape production (53 drugs ×
2 doses), superseding the earlier partial arrival (23 drugs). This overlays its
assets onto plate_D3_10 / plate_D3_3 in place — no mock changes, no timelapse
touched. Drug folder resolved via well -> plate.py well_condition_map ->
drug_name -> slug (same proven mapping as migrate_v2).

Usage:
    python scripts/overlay_ppi_json.py --dry-run
    python scripts/overlay_ppi_json.py
"""

from __future__ import annotations

import argparse
import ast
import re
import shutil
from pathlib import Path

MAP = [("exp_10uM", "D3_10"), ("exp_3uM", "D3_3")]
WELL_RE = re.compile(r"^(.*)_([A-H]\d{2})$")


def slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", s).strip("-").lower()


def well_to_id(w: str) -> str:
    return f"{ord(w[0].upper()) - ord('A') + 1}{int(w[1:]):02d}"


def well_condition_map(plate_py: Path) -> dict:
    if not plate_py.exists():
        return {}
    for node in ast.parse(plate_py.read_text(encoding="utf-8", errors="replace")).body:
        if isinstance(node, ast.Assign) and any(
            getattr(t, "id", None) == "well_condition_map" for t in node.targets
        ):
            return ast.literal_eval(node.value)
    return {}


def main() -> None:
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[2]            # ui_workspace
    ap.add_argument("--src", type=Path, default=root / "PPI_JSON")
    ap.add_argument("--db", type=Path, default=root / "TPD_UI_DB")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    print(f"src={args.src}\ndb={args.db}\ndry_run={args.dry_run}\n")

    for exp, plate_id in MAP:
        src = args.src / exp
        plate = args.db / f"plate_{plate_id}"
        if not src.is_dir() or not plate.is_dir():
            print(f"[{plate_id}] missing src or plate — skip")
            continue
        wm = well_condition_map(plate / "plate.py")
        drug_dirs = {slug(d.name): d.name for d in plate.iterdir() if d.is_dir()}
        copied = 0
        drugs_touched: set[str] = set()
        unresolved: list[str] = []
        for dw in sorted(p for p in src.iterdir() if p.is_dir()):
            m = WELL_RE.match(dw.name)
            if not m:
                unresolved.append(f"{dw.name} (bad name)")
                continue
            well = m.group(2)
            rec = wm.get(well_to_id(well))
            dn = rec.get("drug_name") if rec else None
            folder = drug_dirs.get(slug(dn)) if dn else None
            if not folder:
                unresolved.append(f"{dw.name} (well={well} -> {dn!r})")
                continue
            for tgt_dir in sorted(p for p in dw.iterdir() if p.is_dir()):
                for time_dir in sorted(p for p in tgt_dir.iterdir() if p.is_dir()):
                    dest = plate / folder / f"{tgt_dir.name}_{well}" / time_dir.name
                    if not args.dry_run:
                        dest.mkdir(parents=True, exist_ok=True)
                    for jf in time_dir.glob("*.json"):
                        if not args.dry_run:
                            shutil.copy2(jf, dest / jf.name)
                        copied += 1
                        drugs_touched.add(folder)
        print(f"[{plate_id}] {len(drugs_touched)} drugs, {copied} json overlaid")
        if unresolved:
            print(f"[{plate_id}] UNRESOLVED {len(unresolved)}: {unresolved}")
        print()


if __name__ == "__main__":
    main()
