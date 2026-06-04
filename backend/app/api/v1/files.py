"""Static file serving for mosaic + drug-specific assets."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ...config import get_settings
from ...data_loader import get_registry

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
def get_mosaic(plate_id: str, filename: str) -> FileResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate or not plate.mosaic_dir:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} mosaic not found")
    f = _resolve_safely(plate.mosaic_dir, filename)
    return FileResponse(f)


@router.get("/drug-asset/{drug_id}/timelapse/{filename}")
def get_drug_timelapse(drug_id: str, filename: str) -> FileResponse:
    # Search across plates
    for plate in get_registry().list_plates():
        drug = plate.drugs.get(drug_id)
        if not drug or not drug.asset_dir:
            continue
        tdir = drug.asset_dir / "timelapse"
        if tdir.exists():
            f = _resolve_safely(tdir, filename)
            return FileResponse(f)
    raise HTTPException(status_code=404, detail=f"drug asset {drug_id} not found")


@router.get("/drug-asset/{drug_id}/{filename}")
def get_drug_asset(drug_id: str, filename: str) -> FileResponse:
    for plate in get_registry().list_plates():
        drug = plate.drugs.get(drug_id)
        if not drug or not drug.asset_dir:
            continue
        if (drug.asset_dir / filename).exists():
            f = _resolve_safely(drug.asset_dir, filename)
            return FileResponse(f)
    raise HTTPException(status_code=404, detail=f"drug asset {drug_id} not found")
