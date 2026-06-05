"""Migrate arrived real plate data into TPD_UI_DB, preserving the old mock plates.

Source (arrived, partial):
    <ARR>/exp_10uM/<DRUG>_<WELL>/<TARGET>/<4h|24h>/{landscape,on_target}.json   -> D3_10
    <ARR>/exp_3uM/ ...                                                          -> D3_3

What it does (per plate):
  1. Preserve the current (mock/seeded) plate as `plate_<id>_mock` — renamed
     once, kept intact (mock JSON + metadata + timelapse). Becomes "D3_X (Mock)".
  2. Rebuild a fresh `plate_<id>` from the mock SKELETON + arrived REAL assets:
       - copy plate-level metadata files (gr/slope/target csv, plate.py,
         target_map_clean.json, drug_group_summary.json) from the mock,
       - for each arrived asset, resolve the canonical drug folder via
         well -> plate.py well_condition_map -> drug_name -> slug, and drop
         the real json at  <drug>/<TARGET>_<WELL>/<4h|24h>/ ,
       - copy that drug's timelapse/ from the mock (metadata reused as-is).
  Only drugs that actually arrived appear in the new plate (real-only); the
  4h/24h time folders are preserved (the backend loads 24h by default).

Safe + idempotent: the new plate_<id> is only removed when plate_<id>_mock
already exists, so the mock copy is never lost. Re-running rebuilds cleanly.

Usage:
    python scripts/migrate_arrived_data.py --dry-run     # report only
    python scripts/migrate_arrived_data.py               # apply
"""

from __future__ import annotations

import argparse
import ast
import re
import shutil
import time
from pathlib import Path


def robust_rename(src: Path, dst: Path, attempts: int = 6) -> None:
    """os.rename on DrvFs (WSL→Windows) can throw a transient PermissionError
    when an indexer/AV briefly holds the dir. Retry, then fall back to copy+rm."""
    for i in range(attempts):
        try:
            src.rename(dst)
            return
        except PermissionError:
            if i < attempts - 1:
                time.sleep(1.5)
    shutil.copytree(src, dst)
    shutil.rmtree(src)

PLATES = [("exp_10uM", "D3_10"), ("exp_3uM", "D3_3")]
WELL_RE = re.compile(r"^(.*)_([A-H]\d{2})$")


def slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", s).strip("-").lower()


def well_to_id(w: str) -> str:
    """'C05' -> '305' (row letter * 100 + col), matching plate.py well_ids."""
    row = ord(w[0].upper()) - ord("A") + 1
    return f"{row}{int(w[1:]):02d}"


def parse_well_condition_map(plate_py: Path) -> dict:
    src = plate_py.read_text(encoding="utf-8", errors="replace")
    for node in ast.parse(src).body:
        if isinstance(node, ast.Assign) and any(
            getattr(t, "id", None) == "well_condition_map" for t in node.targets
        ):
            return ast.literal_eval(node.value)
    return {}


def migrate_plate(arr_dir: Path, db: Path, plate_id: str, dry: bool) -> None:
    plate = db / f"plate_{plate_id}"
    mock = db / f"plate_{plate_id}_mock"
    src = arr_dir
    if not src.is_dir():
        print(f"[{plate_id}] arrived dir missing: {src} — skip")
        return

    # 1) preserve mock (rename once)
    if not mock.exists():
        if not plate.exists():
            print(f"[{plate_id}] neither plate nor mock exists — skip")
            return
        print(f"[{plate_id}] preserve mock: {plate.name} -> {mock.name}")
        if not dry:
            robust_rename(plate, mock)
    else:
        print(f"[{plate_id}] mock already exists: {mock.name} (kept)")

    # canonical drug folders + plate.py live in the mock (after rename); during
    # --dry-run the rename hasn't happened, so read from the live plate instead.
    source = mock if mock.exists() else plate
    mock_dirs = {slug(p.name): p for p in source.iterdir() if p.is_dir()}
    wm = parse_well_condition_map(source / "plate.py")

    # 2) rebuild fresh plate_<id>
    if plate.exists():
        print(f"[{plate_id}] remove stale real plate: {plate.name}")
        if not dry:
            shutil.rmtree(plate)
    if not dry:
        plate.mkdir(parents=True)

    # 2a) plate-level metadata from mock (top-level files only)
    meta_files = [p for p in source.iterdir() if p.is_file()]
    print(f"[{plate_id}] copy {len(meta_files)} metadata file(s): "
          f"{', '.join(p.name for p in meta_files)}")
    if not dry:
        for f in meta_files:
            shutil.copy2(f, plate / f.name)

    # 2b) arrived assets
    copied = 0
    timelapse_done: set[str] = set()
    unresolved: list[str] = []
    for dw in sorted(p for p in src.iterdir() if p.is_dir()):
        m = WELL_RE.match(dw.name)
        if not m:
            unresolved.append(f"{dw.name} (bad name)")
            continue
        well = m.group(2)
        rec = wm.get(well_to_id(well))
        drug_name = rec.get("drug_name") if rec else None
        folder = mock_dirs.get(slug(drug_name)) if drug_name else None
        if not folder:
            unresolved.append(f"{dw.name} (well={well} -> {drug_name!r} unresolved)")
            continue
        for tgt_dir in sorted(p for p in dw.iterdir() if p.is_dir()):
            target = tgt_dir.name
            for time_dir in sorted(p for p in tgt_dir.iterdir() if p.is_dir()):
                time = time_dir.name  # 4h / 24h
                dest = plate / folder.name / f"{target}_{well}" / time
                if not dry:
                    dest.mkdir(parents=True, exist_ok=True)
                for jf in time_dir.glob("*.json"):
                    if not dry:
                        shutil.copy2(jf, dest / jf.name)
                    copied += 1
        # timelapse (once per drug) from mock
        if folder.name not in timelapse_done:
            tl = folder / "timelapse"
            if tl.is_dir():
                if not dry:
                    shutil.copytree(tl, plate / folder.name / "timelapse",
                                    dirs_exist_ok=True)
                timelapse_done.add(folder.name)

    print(f"[{plate_id}] copied {copied} json into "
          f"{len(timelapse_done)} drug(s) (+timelapse)")
    if unresolved:
        print(f"[{plate_id}] UNRESOLVED {len(unresolved)}:")
        for u in unresolved:
            print("    -", u)


def main() -> None:
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[2]            # .../ui_workspace
    ap.add_argument("--arrived", type=Path,
                    default=root.parent / "omixai_tpd")    # Documents/omixai_tpd
    ap.add_argument("--db", type=Path, default=root / "TPD_UI_DB")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only", help="restrict to one plate id (e.g. D3_3)")
    args = ap.parse_args()
    print(f"arrived={args.arrived}\ndb={args.db}\ndry_run={args.dry_run}\n")
    for arr_name, plate_id in PLATES:
        if args.only and plate_id != args.only:
            continue
        migrate_plate(args.arrived / arr_name, args.db, plate_id, args.dry_run)
        print()


if __name__ == "__main__":
    main()
