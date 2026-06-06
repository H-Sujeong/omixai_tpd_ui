"""Reads sample_data files into in-memory plate/drug/target structures.

Source files (under settings.data_root, a *plate-level* directory):
  - D{N}_target.csv         : drug ↔ target ↔ SMILES per well
  - D{N}_{dose}_gr.csv      : Growth-Rate curves per well (rows=time, cols=well_id)
  - D{N}_{dose}_slope_class.csv : slope/effect_class per well_id
  - plate.py                : well_condition_map (well_id -> drug metadata)
  - drug_group_summary.json : drug-group -> targets summary
  - target_map_clean.json   : drug-group -> targets (community map)
  - mosaic_4h/r{NN}_c{NN}_{h}h0.png : mosaic timelapse images
  - <drug_name>/<TARGET>_<WELL>/on_target.json    (optional, per (drug,target) PPI detail)
  - <drug_name>/<TARGET>_<WELL>/landscape.json    (optional)
  - <drug_name>/timelapse/*.png                    (optional)

WELL is the alpha well label (e.g. "C05") and uniquely scopes a (drug,target)
pair to its plate position. See domain/dashboard._load_asset for the resolver.

Plates are inferred from filenames: e.g. D3_10_gr.csv → plate_code=D3, dose=10
The plate_id is `{plate_code}_{dose}` (e.g. 'D3_10').

data_root layout (plate-unit display):
  <data_root>/<plate_*>/D{N}_*.csv + plate.py + <drug>/<TARGET>_<WELL>/*.json
or, single-plate-as-root (legacy):
  <data_root>/D{N}_*.csv + plate.py + <drug>/<TARGET>_<WELL>/*.json

For drugs that lack their own folder we still produce a Drug summary row but the
Dashboard returns partial data (phenotypic + time-lapse from plate mosaic).
"""

from __future__ import annotations

import ast
import json
import logging
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from .config import get_settings

log = logging.getLogger(__name__)

PLATE_FILE_RE = re.compile(r"^(D\d+)_(\d+)_(gr|slope_class)\.csv$", re.IGNORECASE)
MOSAIC_FRAME_RE = re.compile(r"^r(\d+)_c(\d+)_(\d+)h(\d+)\.png$", re.IGNORECASE)


# -----------------------------------------------------------------------------
# In-memory schema
# -----------------------------------------------------------------------------


@dataclass
class TargetInfo:
    target: str
    e3_ligase: str | None = None
    if_g: bool = False


@dataclass
class WellRecord:
    well_id: str                    # numeric, e.g. "403"
    well_label: str                  # alpha, e.g. "D03"
    row: str
    column: int
    drug_name: str
    hy_code: str | None = None
    raw_label: str | None = None
    targets: list[TargetInfo] = field(default_factory=list)
    smiles: str | None = None
    gr_curve: list[tuple[float, float]] = field(default_factory=list)
    gr_score: float | None = None
    effect_class: str | None = None
    pattern: str | None = None
    well_type: str | None = None


@dataclass
class DrugRecord:
    drug_id: str            # = drug_name slug
    drug_name: str
    hy_code: str | None
    wells: list[WellRecord]
    targets: list[TargetInfo]
    smiles: str | None
    drug_group: str | None = None     # semantic group (Epigenetic_chromatin etc.)
    target_class: str | None = None
    has_dashboard_assets: bool = False
    asset_dir: Path | None = None     # e.g. <data_root>/<drug_name>/


@dataclass
class PlateRecord:
    plate_id: str
    plate_code: str
    dose_um: float | None
    data_dir: Path
    drugs: dict[str, DrugRecord]
    gr_t_hours: list[float]
    gr_dmso: list[float]                                # GR averaged for DMSO column at each timepoint
    mosaic_dir: Path | None
    mosaic_timepoints: list[float]
    drug_group_summary: list[dict[str, Any]]
    target_map: dict[str, list[str]]                   # group -> targets
    is_mock: bool = False                              # legacy seeded/mock plate
    # === Timecourse / multi-dose extensions (2026-06-06) ===
    # `baseline_dir` is <data_dir>/_baseline/ when the pipeline ships a 0h
    # baseline for this plate (built from untreated wells, shared by all drugs
    # at this plate's dose). Per-target subfolders: {TARGET}/0h/{landscape,on_target}.json
    baseline_dir: Path | None = None
    # `normalization_group` ties together plates that were batch-normalized
    # against the same reference. Multi-dose plates (kind="multi_dose") fuse the
    # members whose group ID matches — see plate_meta.json.
    normalization_group: str | None = None
    # "single_dose" (default — has its own gr/slope csvs) vs "multi_dose"
    # (manifest-only virtual plate aggregating member plates).
    kind: str = "single_dose"
    # For multi_dose plates: member single-dose plate_ids and their doses.
    members: list[str] = field(default_factory=list)
    member_doses: dict[str, float] = field(default_factory=dict)


# -----------------------------------------------------------------------------
# Loading helpers
# -----------------------------------------------------------------------------


def _slugify(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", name).strip("-")


def _row_letter(row_idx: int) -> str:
    """Numeric well_id rows: '1' -> 'A', '2' -> 'B', ... matches 8-row plates."""
    return chr(ord("A") + row_idx - 1) if 1 <= row_idx <= 26 else str(row_idx)


def _parse_well_id(well_id: str) -> tuple[str, int]:
    """Convert '403' -> ('D', 3). well_ids are 3-digit: row*100+col."""
    n = int(well_id)
    row_idx = n // 100
    col = n % 100
    return _row_letter(row_idx), col


def _parse_well_condition_map(plate_py: Path) -> dict[str, dict[str, str | None]]:
    """Extract well_condition_map dict from plate.py via ast."""
    src = plate_py.read_text(encoding="utf-8", errors="replace")
    tree = ast.parse(src)
    out: dict[str, dict[str, str | None]] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "well_condition_map":
                    try:
                        out = ast.literal_eval(node.value)
                    except Exception as exc:                  # noqa: BLE001
                        log.warning("failed to parse well_condition_map: %s", exc)
                    break
    return out


def _read_csv_lenient(path: Path) -> pd.DataFrame:
    """Try utf-8 → cp949 → latin-1 in order; return the first that succeeds."""
    last_exc: Exception | None = None
    for enc in ("utf-8", "cp949", "latin-1"):
        try:
            return pd.read_csv(path, encoding=enc)
        except UnicodeDecodeError as exc:
            last_exc = exc
    raise last_exc or RuntimeError(f"cannot decode {path}")


def _read_target_csv(path: Path) -> pd.DataFrame:
    # Try common encodings — the source file may be cp949 (Korean) or latin-1.
    last_exc: Exception | None = None
    for enc in ("utf-8", "cp949", "latin-1"):
        try:
            df = pd.read_csv(path, encoding=enc)
            break
        except UnicodeDecodeError as exc:
            last_exc = exc
    else:                                                       # pragma: no cover
        raise last_exc or RuntimeError(f"cannot decode {path}")
    # Normalize column names — one column has Korean header
    rename = {c: c.strip() for c in df.columns}
    df = df.rename(columns=rename)
    if "Target Type" in df.columns:
        df["target_type"] = df["Target Type"]
    if "Target" in df.columns:
        df["target_name"] = df["Target"]
    if "If = G" in df.columns:
        df["if_g"] = df["If = G"]
    if "E3 ligase" in df.columns:
        df["e3_ligase"] = df["E3 ligase"]
    return df


def _well_id_from_alpha(row: str, col: int) -> str:
    return f"{ord(row.upper()) - ord('A') + 1}{col:02d}"


def _build_target_lookup(df_target: pd.DataFrame) -> dict[tuple[str, int], dict[str, Any]]:
    """Return {(row_letter, col): {target_name, smiles, e3_ligase, drug, if_g}}."""
    out: dict[tuple[str, int], dict[str, Any]] = {}
    for _, row in df_target.iterrows():
        try:
            r = str(row["row"]).strip()
            c = int(row["column"])
        except (KeyError, TypeError, ValueError):
            continue
        out[(r, c)] = {
            "target_name": row.get("target_name"),
            "smiles": row.get("SMILES"),
            "e3_ligase": row.get("e3_ligase"),
            "drug": row.get("drug"),
            "if_g": str(row.get("if_g", "0")).strip() not in ("0", "nan", "", "NaN"),
        }
    return out


# -----------------------------------------------------------------------------
# Plate discovery
# -----------------------------------------------------------------------------


@dataclass(frozen=True)
class PlateFileSet:
    plate_id: str
    plate_code: str
    dose_um: float
    gr_csv: Path
    slope_csv: Path
    target_csv: Path
    plate_py: Path
    mosaic_dir: Path | None
    drug_dirs: list[Path]
    drug_group_summary: Path | None
    target_map: Path | None
    is_mock: bool = False


@dataclass(frozen=True)
class MultiDoseFileSet:
    """Manifest-only plate that aggregates several single-dose plates batch-
    normalized against the same reference. No GR/slope/target CSVs of its own
    (those come from the member plates)."""
    plate_id: str
    data_dir: Path
    plate_meta: dict[str, Any]


def _discover_multi_dose_plates(data_root: Path) -> list[MultiDoseFileSet]:
    """Find virtual multi-dose plates — directories that carry only a
    `plate_meta.json` with `kind: "multi_dose"` (no D{N}_{dose}_gr.csv of their
    own). They aggregate member single-dose plates that share a normalization
    group, exposing a dose toggle in the UI."""
    out: list[MultiDoseFileSet] = []
    if not data_root.is_dir():
        return out
    for child in data_root.iterdir():
        if not child.is_dir():
            continue
        meta_path = child / "plate_meta.json"
        if not meta_path.exists():
            continue
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
        except Exception as exc:                                    # noqa: BLE001
            log.warning("plate_meta.json load failed (%s): %s", meta_path, exc)
            continue
        if meta.get("kind") != "multi_dose":
            continue
        folder = child.name
        plate_id = folder[len("plate_"):] if folder.startswith("plate_") else folder
        out.append(MultiDoseFileSet(plate_id=plate_id, data_dir=child, plate_meta=meta))
    return out


def _discover_plate_filesets(data_root: Path) -> list[PlateFileSet]:
    """Walk data_root looking for D{N}_{dose}_gr.csv pairs.

    sample_data may be the plate dir itself (case 1) or contain multiple plate
    subdirs (case 2). We support both.
    """
    candidates: list[Path] = [data_root]
    # depth-1 plate subdirs
    if data_root.is_dir():
        for child in data_root.iterdir():
            if child.is_dir() and any(re.match(PLATE_FILE_RE, p.name) for p in child.glob("*.csv")):
                candidates.append(child)

    seen: set[Path] = set()
    out: list[PlateFileSet] = []
    for plate_dir in candidates:
        if plate_dir in seen or not plate_dir.is_dir():
            continue
        gr_files = list(plate_dir.glob("D*_gr.csv"))
        if not gr_files:
            continue
        seen.add(plate_dir)
        for gr in gr_files:
            m = PLATE_FILE_RE.match(gr.name)
            if not m:
                continue
            code, dose, _ = m.group(1), int(m.group(2)), m.group(3)
            # plate_id is folder-unique (so a "plate_D3_10_mock" copy coexists
            # with the real "plate_D3_10" even though both carry D3_10_gr.csv).
            # Derive it from the `plate_<id>` folder name; fall back to code_dose.
            folder = plate_dir.name
            plate_id = folder[len("plate_"):] if folder.startswith("plate_") else f"{code}_{dose}"
            is_mock = plate_id.endswith("_mock")
            slope = plate_dir / f"{code}_{dose}_slope_class.csv"
            tgt = plate_dir / f"{code}_target.csv"
            plate_py = plate_dir / "plate.py"
            if not (slope.exists() and tgt.exists() and plate_py.exists()):
                log.warning("plate %s_%s missing companions in %s", code, dose, plate_dir)
                continue
            mosaic_dir = next(
                (p for p in plate_dir.iterdir() if p.is_dir() and p.name.startswith("mosaic")),
                None,
            )
            drug_dirs = [
                p for p in plate_dir.iterdir()
                if p.is_dir() and p != mosaic_dir
                and not p.name.startswith(".")
            ]
            out.append(PlateFileSet(
                plate_id=plate_id,
                plate_code=code,
                dose_um=float(dose),
                gr_csv=gr,
                slope_csv=slope,
                target_csv=tgt,
                plate_py=plate_py,
                mosaic_dir=mosaic_dir,
                drug_dirs=drug_dirs,
                drug_group_summary=plate_dir / "drug_group_summary.json"
                    if (plate_dir / "drug_group_summary.json").exists() else None,
                target_map=plate_dir / "target_map_clean.json"
                    if (plate_dir / "target_map_clean.json").exists() else None,
                is_mock=is_mock,
            ))
    return out


# -----------------------------------------------------------------------------
# Per-plate loading
# -----------------------------------------------------------------------------


def _load_plate(fs: PlateFileSet) -> PlateRecord:
    plate_py_map = _parse_well_condition_map(fs.plate_py)

    df_target = _read_target_csv(fs.target_csv)
    target_lookup = _build_target_lookup(df_target)

    # GR curve CSV (brightfield_gr `gr_curve_table.csv`). Two formats supported:
    #   • New pipeline: first column = "frame_time_hr" (real frame times, the
    #     index of build_gr_curve_table — window [early_hr_ignore, late_hr_ignore)),
    #     then "DMSO", then well-id columns.
    #   • Legacy export (current TPD_UI_DB): the time index was dropped, so the
    #     first column is "DMSO" and there is no time column → synthesize the axis
    #     from gr_window_start_h / gr_step_h.
    df_gr = _read_csv_lenient(fs.gr_csv)
    real_times: list[float] | None = None
    col0 = str(df_gr.columns[0]).strip().lower()
    if col0 in ("frame_time_hr", "time_hr", "t_hr", "frame_time", "time", "hour", "hr"):
        try:
            real_times = [float(v) for v in df_gr.iloc[:, 0].tolist()]
        except (TypeError, ValueError):
            real_times = None
        df_gr = df_gr.iloc[:, 1:]  # drop the time column; rest = DMSO + wells

    if str(df_gr.columns[0]).upper() == "DMSO":
        gr_dmso = df_gr.iloc[:, 0].tolist()
        well_cols = df_gr.columns[1:].astype(str).tolist()
        gr_curves: dict[str, list[float]] = {str(c): df_gr[c].tolist() for c in well_cols}
    else:
        gr_dmso = []
        gr_curves = {c: df_gr[c].tolist() for c in df_gr.columns}
        well_cols = list(df_gr.columns)

    n_points = len(next(iter(gr_curves.values()))) if gr_curves else 0
    s = get_settings()
    if real_times is not None and len(real_times) == n_points:
        # Real frame times from the pipeline — the honest axis (no guessing).
        gr_t_hours = real_times
    else:
        # Legacy file w/o a time column: synthesize start + i*step.
        gr_start_h, gr_step_h = s.gr_window_start_h, s.gr_step_h
        gr_t_hours = [gr_start_h + i * gr_step_h for i in range(n_points)]

    df_slope = _read_csv_lenient(fs.slope_csv)
    slope_by_well: dict[str, dict[str, Any]] = {}
    if "well_id" in df_slope.columns:
        for _, r in df_slope.iterrows():
            slope_by_well[str(r["well_id"])] = {
                "effect_class": r.get("effect_class"),
                "pattern": r.get("pattern"),
                "qc": r.get("qc"),
                "type": r.get("type"),
                "relative_slope": r.get("relative_slope"),
                "well_slope_norm": r.get("well_slope_norm"),
            }

    # Build well records
    wells: dict[str, WellRecord] = {}
    for well_id_str, meta in plate_py_map.items():
        try:
            row_letter, col = _parse_well_id(str(well_id_str))
        except ValueError:
            continue
        well_label = f"{row_letter}{col:02d}"
        tgt = target_lookup.get((row_letter, col), {})
        targets: list[TargetInfo] = []
        raw_target = tgt.get("target_name")
        e3 = tgt.get("e3_ligase") or None
        if raw_target and str(raw_target) not in ("NaN", "nan", "0"):
            for t in re.split(r"[,\s]+", str(raw_target)):
                t = t.strip()
                if t:
                    targets.append(TargetInfo(target=t, e3_ligase=e3, if_g=bool(tgt.get("if_g"))))
        slope = slope_by_well.get(str(well_id_str), {})
        gr_curve = []
        for i, val in enumerate(gr_curves.get(str(well_id_str), [])):
            th = gr_t_hours[i] if i < len(gr_t_hours) else float(i)
            gr_curve.append((th, float(val) if pd.notna(val) else 0.0))
        wells[str(well_id_str)] = WellRecord(
            well_id=str(well_id_str),
            well_label=well_label,
            row=row_letter,
            column=col,
            drug_name=meta.get("drug_name", "Unknown"),
            hy_code=meta.get("hy_code"),
            raw_label=meta.get("raw"),
            targets=targets,
            smiles=str(tgt.get("smiles")) if tgt.get("smiles") and str(tgt.get("smiles")) != "nan" else None,
            gr_curve=gr_curve,
            gr_score=slope.get("relative_slope"),
            effect_class=slope.get("effect_class"),
            pattern=slope.get("pattern"),
            well_type=slope.get("type"),
        )

    # Aggregate drugs (group by drug_name, ignore DMSO)
    drug_groups: dict[str, list[WellRecord]] = {}
    for w in wells.values():
        if w.drug_name.upper() == "DMSO":
            continue
        drug_groups.setdefault(w.drug_name, []).append(w)

    # Drug folders → `asset_dir`: any matching folder serves per-drug files
    # (e.g. timelapse), so index ALL drug folders. `has_dashboard_assets` is
    # tracked separately and is true only when the folder actually contains
    # landscape/on_target JSON (the PPI/landscape dashboard data).
    drug_asset_index: dict[str, Path] = {}
    drug_json_slugs: set[str] = set()
    for d in fs.drug_dirs:
        slug = _slugify(d.name).lower()
        drug_asset_index[slug] = d
        # Real plates nest assets under a time folder (<TARGET_WELL>/24h/...),
        # so check both the 2-deep (mock) and 3-deep (real) layouts.
        if (any(d.glob("*/on_target.json")) or any(d.glob("*/landscape.json"))
                or any(d.glob("*/*/on_target.json")) or any(d.glob("*/*/landscape.json"))
                or any(d.glob("on_target.json")) or any(d.glob("landscape.json"))):
            drug_json_slugs.add(slug)

    # drug_group_summary + target_map
    dg_summary: list[dict[str, Any]] = []
    if fs.drug_group_summary:
        try:
            dg_summary = json.loads(fs.drug_group_summary.read_text(encoding="utf-8"))
        except Exception as exc:                                # noqa: BLE001
            log.warning("drug_group_summary load failed: %s", exc)
    target_map: dict[str, list[str]] = {}
    if fs.target_map:
        try:
            target_map = json.loads(fs.target_map.read_text(encoding="utf-8"))
        except Exception as exc:                                # noqa: BLE001
            log.warning("target_map load failed: %s", exc)
    # Build target -> group lookup
    target_to_group: dict[str, str] = {}
    for grp, gene_list in target_map.items():
        for g in gene_list:
            target_to_group.setdefault(g, grp)

    drugs: dict[str, DrugRecord] = {}
    for name, ws in drug_groups.items():
        # Collect targets (dedup, keep order)
        seen = set()
        targets: list[TargetInfo] = []
        for w in ws:
            for t in w.targets:
                if t.target not in seen:
                    targets.append(t)
                    seen.add(t.target)
        smiles = next((w.smiles for w in ws if w.smiles), None)
        drug_group = next((target_to_group.get(t.target) for t in targets if target_to_group.get(t.target)), None)
        slug = _slugify(name).lower()
        asset_dir = drug_asset_index.get(slug)
        drugs[slug] = DrugRecord(
            drug_id=slug,
            drug_name=name,
            hy_code=ws[0].hy_code,
            wells=ws,
            targets=targets,
            smiles=smiles,
            drug_group=drug_group,
            target_class=_infer_target_class(targets, drug_group),
            has_dashboard_assets=slug in drug_json_slugs,
            asset_dir=asset_dir,
        )

    # Mosaic timepoints
    mosaic_timepoints: list[float] = []
    if fs.mosaic_dir and fs.mosaic_dir.exists():
        tps: set[int] = set()
        for png in fs.mosaic_dir.glob("*.png"):
            m = MOSAIC_FRAME_RE.match(png.name)
            if m:
                tps.add(int(m.group(3)))
        mosaic_timepoints = sorted(tps)

    # Optional plate-level metadata (normalization group, pipeline version, etc.)
    # Falls back to None silently if the file isn't shipped yet.
    plate_dir = fs.gr_csv.parent
    norm_group: str | None = None
    meta_path = plate_dir / "plate_meta.json"
    if meta_path.exists():
        try:
            pm = json.loads(meta_path.read_text(encoding="utf-8"))
            norm_group = pm.get("normalization_group")
        except Exception as exc:                                # noqa: BLE001
            log.warning("plate_meta load failed (%s): %s", meta_path, exc)

    baseline_dir = plate_dir / "_baseline"
    if not baseline_dir.exists():
        baseline_dir = None

    return PlateRecord(
        plate_id=fs.plate_id,
        plate_code=fs.plate_code,
        dose_um=fs.dose_um,
        data_dir=plate_dir,
        drugs=drugs,
        gr_t_hours=gr_t_hours,
        gr_dmso=[float(v) for v in gr_dmso] if gr_dmso else [],
        mosaic_dir=fs.mosaic_dir,
        mosaic_timepoints=[float(t) for t in mosaic_timepoints],
        drug_group_summary=dg_summary,
        target_map=target_map,
        is_mock=fs.is_mock,
        baseline_dir=baseline_dir,
        normalization_group=norm_group,
        kind="single_dose",
    )


def _load_multi_dose_plate(fs: MultiDoseFileSet,
                            single_plates: dict[str, PlateRecord]) -> PlateRecord | None:
    """Build a virtual multi-dose PlateRecord from member single-dose plates.

    The manifest names the members and their doses. All members must share the
    same normalization_group (the whole point — they were normalized together).
    drugs/target_map/drug_group_summary are taken from the first available
    member (members are batch-normalized siblings, so they share the layout);
    per-dose data is resolved at request time via PlateRecord.members.
    """
    meta = fs.plate_meta
    members = list(meta.get("members") or [])
    member_doses = dict(meta.get("member_doses") or {})
    norm_group = meta.get("normalization_group")

    resolved = [single_plates[mid] for mid in members if mid in single_plates]
    if not resolved:
        log.warning("multi-dose %s: no member plates loaded (%s)", fs.plate_id, members)
        return None
    if norm_group:
        bad = [p.plate_id for p in resolved
               if p.normalization_group and p.normalization_group != norm_group]
        if bad:
            log.warning("multi-dose %s: members %s have a different normalization_group",
                        fs.plate_id, bad)

    base = resolved[0]
    # GR/mosaic from the first member as a placeholder — the UI's dose toggle
    # will pick the appropriate member's per-drug data; aggregate panels (GR
    # curves, mosaic) currently follow the primary member.
    return PlateRecord(
        plate_id=fs.plate_id,
        plate_code=base.plate_code,
        dose_um=None,                             # multi-dose has no single dose
        data_dir=fs.data_dir,
        drugs=base.drugs,
        gr_t_hours=base.gr_t_hours,
        gr_dmso=base.gr_dmso,
        mosaic_dir=base.mosaic_dir,
        mosaic_timepoints=base.mosaic_timepoints,
        drug_group_summary=base.drug_group_summary,
        target_map=base.target_map,
        is_mock=False,
        baseline_dir=base.baseline_dir,
        normalization_group=norm_group,
        kind="multi_dose",
        members=members,
        member_doses=member_doses,
    )


# Naive target-class mapping (lightweight heuristic until crawler runs).
_TARGET_CLASS_BY_GROUP = {
    "RTK_signaling": "Receptor tyrosine kinases",
    "MAPK_signaling": "MAPK signaling kinases",
    "CDK_cell_cycle": "Cyclin-dependent kinases (CDKs)",
    "Epigenetic_chromatin": "Epigenetic / chromatin regulators",
    "Nuclear_receptor": "Nuclear receptors",
    "DNA_damage_survival": "DNA damage / survival",
    "Metabolism_hypoxia": "Metabolic / hypoxia regulators",
    "Immune_stress": "Immune / stress sensors",
    "Other_kinase_misc": "Misc kinases / targets",
}


def _infer_target_class(targets: list[TargetInfo], drug_group: str | None) -> str | None:
    if drug_group and drug_group in _TARGET_CLASS_BY_GROUP:
        return _TARGET_CLASS_BY_GROUP[drug_group]
    if not targets:
        return None
    return None


# -----------------------------------------------------------------------------
# Public registry
# -----------------------------------------------------------------------------


@dataclass
class PlateRegistry:
    plates: dict[str, PlateRecord]

    def get_plate(self, plate_id: str) -> PlateRecord | None:
        return self.plates.get(plate_id)

    def list_plates(self) -> list[PlateRecord]:
        return list(self.plates.values())

    def plates_in_group(self, normalization_group: str | None) -> list[PlateRecord]:
        """All single-dose plates that share a normalization_group. Empty when
        the group is None (no batch-norm signal — nothing safe to fuse)."""
        if not normalization_group:
            return []
        return [p for p in self.plates.values()
                if p.kind == "single_dose" and p.normalization_group == normalization_group]


@lru_cache(maxsize=1)
def get_registry() -> PlateRegistry:
    s = get_settings()
    if not s.data_root.exists():
        log.warning("data_root %s does not exist", s.data_root)
        return PlateRegistry(plates={})
    plates: dict[str, PlateRecord] = {}
    # Single-dose plates first — multi-dose virtuals reference these by id.
    for fs in _discover_plate_filesets(s.data_root):
        try:
            rec = _load_plate(fs)
            plates[rec.plate_id] = rec
            log.info("loaded plate %s (%d drugs)", rec.plate_id, len(rec.drugs))
        except Exception as exc:                                # noqa: BLE001
            log.exception("failed to load plate %s: %s", fs.plate_id, exc)
    # Multi-dose virtuals (manifest-only, aggregate members above).
    for mfs in _discover_multi_dose_plates(s.data_root):
        try:
            rec = _load_multi_dose_plate(mfs, plates)
            if rec is not None:
                plates[rec.plate_id] = rec
                log.info("loaded multi-dose plate %s (members=%s)", rec.plate_id, rec.members)
        except Exception as exc:                                # noqa: BLE001
            log.exception("failed to load multi-dose plate %s: %s", mfs.plate_id, exc)
    return PlateRegistry(plates=plates)


def reload_registry() -> PlateRegistry:
    get_registry.cache_clear()
    return get_registry()
