"""Per-account plate ownership helpers + a path-bound FastAPI dependency.

A logged-in user may only reach plates they own. `require_owned_plate` reads the
`plate_id` path param and 404s if the current user doesn't own it; `owned_plates`
returns the user's registry plates (used to scope drug-asset lookups).
"""

from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from .auth import require_user
from .data_loader import PlateRecord, get_registry
from .db import get_db
from .models import Plate, User


def owned_plate_ids(db: DbSession, user: User) -> set[str]:
    # Admins implicitly own every registered plate — saves a manual assign step
    # for new plates (incl. multi-dose virtuals like D3 that don't fit the
    # one-row-per-plate ownership model). All ownership-gated reads
    # (`list_plates`, `require_owned_plate`, `owned_plates`) flow through here,
    # so this single short-circuit covers the entire surface.
    if getattr(user, "is_admin", False):
        return {p.plate_id for p in get_registry().list_plates()}
    return {pid for (pid,) in db.query(Plate.plate_id).filter(Plate.owner_id == user.id)}


def require_owned_plate(
    plate_id: str,
    user: User = Depends(require_user),
    db: DbSession = Depends(get_db),
) -> str:
    if plate_id not in owned_plate_ids(db, user):
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    return plate_id


def owned_plates(db: DbSession, user: User) -> list[PlateRecord]:
    reg = get_registry()
    out: list[PlateRecord] = []
    for pid in owned_plate_ids(db, user):
        p = reg.get_plate(pid)
        if p is not None:
            out.append(p)
    return out
