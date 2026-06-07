"""Plate-level endpoints (analysis selector + drug summary table)."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from ...auth import require_user
from ...config import get_settings
from ...data_loader import PlateRegistry, get_registry
from ...db import get_db
from ...models import User
from ...ownership import owned_plate_ids
from ...schemas import DrugDoseRow, DrugSummaryRow, DrugTargetEntry, PlateSummary

router = APIRouter(prefix="/api/v1", tags=["plates"])


def _registry() -> PlateRegistry:
    return get_registry()


def _today_iso() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def _file_date_range(data_dir: Path) -> tuple[str | None, str | None]:
    """(earliest, latest) mtime among the plate's metadata + asset files, as
    YYYY-MM-DD. Timelapse images are skipped (too many); metadata CSV/py +
    per-drug JSON assets are enough and cheap."""
    try:
        earliest = float("inf")
        latest = 0.0
        for pat in ("*.csv", "*.py", "*/*/*.json"):
            for f in data_dir.glob(pat):
                try:
                    m = f.stat().st_mtime
                except OSError:
                    continue
                earliest = min(earliest, m)
                latest = max(latest, m)
        if latest <= 0:
            return None, None
        iso = lambda ts: datetime.fromtimestamp(ts, tz=timezone.utc).date().isoformat()
        return iso(earliest), iso(latest)
    except Exception:  # noqa: BLE001
        return None, None


def _plate_dates_path() -> Path:
    return get_settings().protein_info_cache.parent / "plate_dates.json"


def _load_plate_dates() -> dict[str, dict[str, str]]:
    p = _plate_dates_path()
    if p.exists():
        try:
            return json.loads(p.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            return {}
    return {}


def _save_plate_dates(store: dict[str, dict[str, str]]) -> None:
    try:
        _plate_dates_path().write_text(json.dumps(store, indent=0), encoding="utf-8")
    except Exception:  # noqa: BLE001
        pass


def _resolve_dates(store: dict[str, dict[str, str]], plate_id: str, data_dir: Path) -> tuple[str, str, bool]:
    """created_at (recorded once = when the card was first registered) + updated_at
    (tracks the latest data mtime). Returns (created, updated, dirty)."""
    file_created, file_updated = _file_date_range(data_dir)
    entry = store.get(plate_id)
    if entry is None:
        created = file_created or _today_iso()
        updated = file_updated or created
        store[plate_id] = {"created_at": created, "updated_at": updated}
        return created, updated, True
    created = entry.get("created_at") or file_created or _today_iso()
    updated = file_updated or entry.get("updated_at") or created
    dirty = entry.get("created_at") != created or entry.get("updated_at") != updated
    if dirty:
        store[plate_id] = {"created_at": created, "updated_at": updated}
    return created, updated, dirty


@router.get("/plates", response_model=list[PlateSummary])
def list_plates(
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[PlateSummary]:
    owned = owned_plate_ids(db, user)
    reg = _registry()
    dates = _load_plate_dates()
    dirty = False
    out: list[PlateSummary] = []
    for plate in reg.list_plates():
        # Multi-dose virtual plates (e.g. D3) inherit access from their members:
        # if any member single-dose plate is owned, the multi-dose aggregator is
        # visible too. Saves a separate admin assignment per virtual plate.
        if plate.plate_id not in owned:
            if plate.kind == "multi_dose" and any(m in owned for m in plate.members):
                pass                # accessible via member ownership
            else:
                continue
        # Every drug in plate.py is shown (each has a folder + timelapse even
        # without dashboard assets); the PPI/landscape panels just read empty
        # for drugs whose analysis hasn't arrived yet.
        n_drugs = len(plate.drugs)
        n_wells = sum(len(d.wells) for d in plate.drugs.values())
        any_assets = any(d.has_dashboard_assets for d in plate.drugs.values())
        created, updated, d = _resolve_dates(dates, plate.plate_id, plate.data_dir)
        dirty = dirty or d
        out.append(PlateSummary(
            plate_id=plate.plate_id,
            plate_code=plate.plate_code,
            dose_um=plate.dose_um,
            treatment_hours=48.0,
            cell_line="U2OS",
            n_wells=n_wells,
            n_drugs=n_drugs,
            created_at=created,
            updated_at=updated,
            generated_at=created,
            pipeline_version="demo-0.1",
            has_dashboard_assets=any_assets,
            is_mock=plate.is_mock,
        ))
    if dirty:
        _save_plate_dates(dates)
    out.sort(key=lambda p: p.plate_id)
    return out


@router.get("/plates/{plate_id}/drugs", response_model=list[DrugSummaryRow])
def list_drugs(
    plate_id: str,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> list[DrugSummaryRow]:
    if plate_id not in owned_plate_ids(db, user):
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    reg = _registry()
    plate = reg.get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")

    # For multi-dose plates, gather per-member dose breakdown so the drug-list
    # table can show one sub-row per concentration (stacked GR/Growth cells).
    # drug_id -> [DrugDoseRow sorted by dose desc].
    dose_views: dict[str, list[DrugDoseRow]] = {}
    if plate.kind == "multi_dose":
        for mid in plate.members:
            m = reg.get_plate(mid)
            if m is None:
                continue
            mdose = plate.member_doses.get(mid, m.dose_um or 0.0)
            for md in m.drugs.values():
                m_grs = [w.gr_score for w in md.wells if w.gr_score is not None]
                m_gr = float(sum(m_grs) / len(m_grs)) if m_grs else None
                m_ecs = [w.effect_class for w in md.wells
                         if w.effect_class and w.effect_class != "invalid"]
                m_ec = max(set(m_ecs), key=m_ecs.count) if m_ecs else None
                dose_views.setdefault(md.drug_id, []).append(DrugDoseRow(
                    dose_um=float(mdose),
                    plate_id=mid,
                    gr_score=m_gr,
                    growth_class=_growth_label(m_gr, m_ec),
                    effect_class=m_ec,
                ))
        for k in dose_views:
            # Ascending — low dose first (per user spec: "저농도부터").
            dose_views[k].sort(key=lambda r: r.dose_um)

    rows: list[DrugSummaryRow] = []
    for drug in plate.drugs.values():
        # Show all drugs from plate.py; has_dashboard_assets just tells the UI
        # whether the PPI/landscape/MoA panels have data for this drug.
        wells = [w.well_label for w in drug.wells]
        # Best single (representative) effect class + GR score for the summary row
        gr_scores = [w.gr_score for w in drug.wells if w.gr_score is not None]
        gr_score = float(sum(gr_scores) / len(gr_scores)) if gr_scores else None
        effect_classes = [w.effect_class for w in drug.wells if w.effect_class and w.effect_class != "invalid"]
        effect_class = max(set(effect_classes), key=effect_classes.count) if effect_classes else None
        rows.append(DrugSummaryRow(
            drug_id=drug.drug_id,
            drug_name=drug.drug_name,
            hy_code=drug.hy_code,
            wells=wells,
            targets=[
                DrugTargetEntry(target=t.target, if_g=t.if_g, e3_ligase=t.e3_ligase)
                for t in drug.targets
            ],
            target_class=drug.target_class,
            drug_group=drug.drug_group,
            gr_score=gr_score,
            growth_class=_growth_label(gr_score, effect_class),
            effect_class=effect_class,
            smiles=drug.smiles,
            has_dashboard_assets=drug.has_dashboard_assets,
            by_dose=dose_views.get(drug.drug_id, []),
        ))
    rows.sort(key=lambda r: r.drug_name.lower())
    return rows


def _growth_label(gr_score: float | None, effect_class: str | None) -> str | None:
    if effect_class is None:
        return None
    if gr_score is None:
        return effect_class
    if gr_score < -0.05:
        return "Strong cytotoxic"
    if gr_score < 0.2:
        return "Cytotoxic"
    if gr_score < 0.6:
        return "Cytostatic"
    return "Growth-permissive"
