"""Single-copy in-place migration: arrived real assets onto the original plates.

timelapse is large (~164 MB/drug, ~11 GB/plate), so it is NEVER duplicated.
The ORIGINAL plate folder stays in place and becomes the REAL plate (keeps its
timelapse + GR). The MOCK plate is a lightweight sibling holding only the old
(superseded) landscape/on_target JSON — no timelapse.

Per plate (plate_<id>, in place):
  1. Build lite `plate_<id>_mock`: copy plate-level metadata files + every
     un-nested <drug>/<TARGET_WELL>/{landscape,on_target}.json (the old/seeded
     dashboard assets). No timelapse, no time subfolders. (Empty mock when the
     plate never had dashboard assets — e.g. D3_3.)
  2. In the real plate, delete those un-nested old JSON (keep timelapse/GR).
  3. Overlay arrived REAL assets at <drug>/<TARGET>_<WELL>/<4h|24h>/, resolving
     the drug folder via  well -> plate.py well_condition_map -> drug_name -> slug.

All drug folders (incl. no-asset drugs) keep their timelapse in the real plate.
Only arrived drugs gain dashboard assets; the backend loads 24h by default.

Usage:
    python scripts/migrate_v2.py --dry-run
    python scripts/migrate_v2.py [--only D3_3]
"""

from __future__ import annotations

import argparse
import ast
import re
import shutil
from pathlib import Path

PLATES = [("exp_10uM", "D3_10"), ("exp_3uM", "D3_3")]
WELL_RE = re.compile(r"^(.*)_([A-H]\d{2})$")
TW_RE = re.compile(r".+_[A-H]\d{2}$")          # <TARGET>_<WELL> dir
ASSET_NAMES = ("landscape.json", "on_target.json")


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


def migrate(arr_dir: Path, db: Path, plate_id: str, dry: bool) -> None:
    real = db / f"plate_{plate_id}"
    mock = db / f"plate_{plate_id}_mock"
    if not real.is_dir():
        print(f"[{plate_id}] real plate missing: {real} — skip")
        return
    if mock.exists():
        print(f"[{plate_id}] {mock.name} already exists — remove it first to re-run; skip")
        return

    drug_dirs = [d for d in real.iterdir() if d.is_dir() and not d.name.startswith("mosaic")]
    meta_files = [f for f in real.iterdir() if f.is_file()]

    # 1) lite mock: metadata + un-nested old assets (json only)
    print(f"[{plate_id}] build lite mock {mock.name}: "
          f"{len(meta_files)} metadata file(s) + old assets (no timelapse)")
    moved_assets = 0
    for d in drug_dirs:
        for tw in d.iterdir():
            if not (tw.is_dir() and TW_RE.match(tw.name)):
                continue
            for name in ASSET_NAMES:
                f = tw / name
                if f.exists():
                    if not dry:
                        dest = mock / d.name / tw.name
                        dest.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, dest / name)
                    moved_assets += 1
    if not dry:
        mock.mkdir(parents=True, exist_ok=True)
        for f in meta_files:
            shutil.copy2(f, mock / f.name)
    print(f"[{plate_id}]   copied {moved_assets} old asset json -> mock")

    # 2) strip old un-nested assets from the real plate
    stripped = 0
    for d in drug_dirs:
        for tw in d.iterdir():
            if not (tw.is_dir() and TW_RE.match(tw.name)):
                continue
            for name in ASSET_NAMES:
                f = tw / name
                if f.exists():
                    if not dry:
                        f.unlink()
                    stripped += 1
            # drop the now-empty <TARGET_WELL> dir (no 24h/4h yet)
            if not dry and tw.exists() and not any(tw.iterdir()):
                tw.rmdir()
    print(f"[{plate_id}]   stripped {stripped} old asset json from real")

    # 3) overlay arrived real assets
    wm = well_condition_map(real / "plate.py")
    mock_dirs = {slug(d.name): d.name for d in drug_dirs}
    copied = 0
    unresolved: list[str] = []
    if not arr_dir.is_dir():
        print(f"[{plate_id}]   arrived dir missing: {arr_dir}")
    else:
        for dw in sorted(p for p in arr_dir.iterdir() if p.is_dir()):
            m = WELL_RE.match(dw.name)
            if not m:
                unresolved.append(f"{dw.name} (bad name)")
                continue
            well = m.group(2)
            rec = wm.get(well_to_id(well))
            dn = rec.get("drug_name") if rec else None
            folder = mock_dirs.get(slug(dn)) if dn else None
            if not folder:
                unresolved.append(f"{dw.name} (well={well} -> {dn!r})")
                continue
            for tgt_dir in sorted(p for p in dw.iterdir() if p.is_dir()):
                for time_dir in sorted(p for p in tgt_dir.iterdir() if p.is_dir()):
                    dest = real / folder / f"{tgt_dir.name}_{well}" / time_dir.name
                    if not dry:
                        dest.mkdir(parents=True, exist_ok=True)
                    for jf in time_dir.glob("*.json"):
                        if not dry:
                            shutil.copy2(jf, dest / jf.name)
                        copied += 1
    print(f"[{plate_id}]   overlaid {copied} arrived json into real")
    if unresolved:
        print(f"[{plate_id}]   UNRESOLVED {len(unresolved)}: {unresolved}")


def main() -> None:
    ap = argparse.ArgumentParser()
    root = Path(__file__).resolve().parents[2]
    ap.add_argument("--arrived", type=Path, default=root.parent / "omixai_tpd")
    ap.add_argument("--db", type=Path, default=root / "TPD_UI_DB")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--only")
    args = ap.parse_args()
    print(f"arrived={args.arrived}\ndb={args.db}\ndry_run={args.dry_run}\n")
    for arr_name, plate_id in PLATES:
        if args.only and plate_id != args.only:
            continue
        migrate(args.arrived / arr_name, args.db, plate_id, args.dry_run)
        print()


if __name__ == "__main__":
    main()
