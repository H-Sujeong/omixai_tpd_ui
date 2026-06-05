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
from ...schemas import DrugSummaryRow, DrugTargetEntry, PlateSummary

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
        if plate.plate_id not in owned:
            continue
        # Real plates expose only drugs that actually have dashboard assets
        # (partial data arrivals hide the not-yet-arrived drugs); mock plates
        # show everything.
        visible = [d for d in plate.drugs.values() if plate.is_mock or d.has_dashboard_assets]
        n_drugs = len(visible)
        n_wells = sum(len(d.wells) for d in visible)
        any_assets = any(d.has_dashboard_assets for d in visible)
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
    plate = _registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    rows: list[DrugSummaryRow] = []
    for drug in plate.drugs.values():
        # Real plates: hide drugs without dashboard assets (not-yet-arrived).
        if not plate.is_mock and not drug.has_dashboard_assets:
            continue
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
