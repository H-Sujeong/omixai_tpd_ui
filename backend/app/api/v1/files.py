"""Static file serving for mosaic + drug-specific assets."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from ...auth import require_user
from ...config import get_settings
from ...data_loader import get_registry
from ...db import get_db
from ...models import User
from ...ownership import owned_plates, require_owned_plate

router = APIRouter(prefix="/api/v1/files", tags=["files"])


def _resolve_safely(base: Path, *parts: str) -> Path:
    target = base.joinpath(*parts).resolve()
    base_resolved = base.resolve()
    if not str(target).startswith(str(base_resolved)):
        raise HTTPException(status_code=400, detail="path traversal blocked")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"file not found: {'/'.join(parts)}")
    return target


@router.get("/mosaic/{plate_id}/{filename}")
def get_mosaic(
    plate_id: str,
    filename: str,
    _owned: str = Depends(require_owned_plate),
) -> FileResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate or not plate.mosaic_dir:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} mosaic not found")
    f = _resolve_safely(plate.mosaic_dir, filename)
    return FileResponse(f)


@router.get("/drug-asset/{drug_id}/timelapse/{filename}")
def get_drug_timelapse(
    drug_id: str,
    filename: str,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> FileResponse:
    # Search only the user's owned plates (ownership scope). A drug can live in
    # several plates (e.g. D3_10 + D3_3); timelapse filenames embed the per-frame
    # cell count, so they are plate-specific — fall through to the plate that
    # actually HAS this file instead of 404-ing on the first plate we try.
    # `owned_plates` includes member single-dose plates of any owned multi-dose
    # virtual, so each plate can serve from its OWN canonical folder without
    # any cross-folder probing.
    for plate in owned_plates(db, user):
        drug = plate.drugs.get(drug_id)
        if not drug or not drug.asset_dir:
            continue
        tdir = (drug.asset_dir / "timelapse").resolve()
        cand = (tdir / filename).resolve()
        if str(cand).startswith(str(tdir)) and cand.is_file():
            return FileResponse(cand)
    raise HTTPException(status_code=404, detail=f"drug asset {drug_id} not found")


@router.get("/drug-asset/{drug_id}/{filename}")
def get_drug_asset(
    drug_id: str,
    filename: str,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> FileResponse:
    for plate in owned_plates(db, user):
        drug = plate.drugs.get(drug_id)
        if not drug or not drug.asset_dir:
            continue
        base = drug.asset_dir.resolve()
        cand = (base / filename).resolve()
        if str(cand).startswith(str(base)) and cand.is_file():
            return FileResponse(cand)
    raise HTTPException(status_code=404, detail=f"drug asset {drug_id} not found")
