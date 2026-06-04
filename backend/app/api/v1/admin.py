"""Admin console endpoints — user + plate-assignment management (admin only)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ...auth import hash_password, initial_password_for, require_admin
from ...data_loader import get_registry
from ...db import get_db
from ...models import Plate, User

router = APIRouter(prefix="/api/v1/admin", tags=["admin"], dependencies=[Depends(require_admin)])


class AdminUserOut(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    is_demo: bool = False
    is_admin: bool = False
    is_active: bool = True
    must_change_password: bool = False
    plate_ids: list[str] = []
    last_login_at: str | None = None


class CreateUserIn(BaseModel):
    email: str
    password: str | None = None  # blank → convention <local-part>123!@
    display_name: str | None = None
    is_admin: bool = False


class UpdateUserIn(BaseModel):
    display_name: str | None = None
    password: str | None = None
    is_admin: bool | None = None
    is_active: bool | None = None


class AssignIn(BaseModel):
    plate_id: str


class PlateOption(BaseModel):
    plate_id: str
    plate_code: str | None = None
    n_drugs: int = 0
    has_assets: bool = False


def _to_out(db: DbSession, u: User) -> AdminUserOut:
    pids = [pid for (pid,) in db.query(Plate.plate_id).filter(Plate.owner_id == u.id)]
    return AdminUserOut(
        id=u.id, email=u.email, display_name=u.display_name, is_demo=u.is_demo,
        is_admin=u.is_admin, is_active=u.is_active,
        must_change_password=u.must_change_password, plate_ids=sorted(pids),
        last_login_at=u.last_login_at.isoformat() if u.last_login_at else None,
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: DbSession = Depends(get_db)) -> list[AdminUserOut]:
    return [_to_out(db, u) for u in db.query(User).order_by(User.id).all()]


@router.post("/users", response_model=AdminUserOut)
def create_user(body: CreateUserIn, db: DbSession = Depends(get_db)) -> AdminUserOut:
    email = body.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="email already exists")
    # No password → convention <local-part>123!@. New accounts must change it at
    # first login.
    pw = body.password or initial_password_for(email)
    u = User(email=email, password_hash=hash_password(pw),
             display_name=body.display_name, is_admin=body.is_admin,
             must_change_password=True)
    db.add(u)
    db.commit()
    db.refresh(u)
    return _to_out(db, u)


@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(user_id: int, body: UpdateUserIn, db: DbSession = Depends(get_db),
                me: User = Depends(require_admin)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    if body.display_name is not None:
        u.display_name = body.display_name
    if body.password:
        u.password_hash = hash_password(body.password)
    if body.is_admin is not None:
        if u.id == me.id and not body.is_admin:
            raise HTTPException(status_code=400, detail="cannot remove your own admin role")
        u.is_admin = body.is_admin
    if body.is_active is not None:
        if u.id == me.id and not body.is_active:
            raise HTTPException(status_code=400, detail="cannot deactivate yourself")
        u.is_active = body.is_active
    db.commit()
    db.refresh(u)
    return _to_out(db, u)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: DbSession = Depends(get_db),
                me: User = Depends(require_admin)) -> dict:
    if user_id == me.id:
        raise HTTPException(status_code=400, detail="cannot delete yourself")
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    db.delete(u)
    db.commit()
    return {"ok": True}


class ResetPwOut(BaseModel):
    password: str


@router.post("/users/{user_id}/reset-password", response_model=ResetPwOut)
def reset_user_password(user_id: int, db: DbSession = Depends(get_db)) -> ResetPwOut:
    """Admin-mediated reset (no link/token): set the user's password back to the
    convention <local-part>123!@ and require a change at next login. The admin
    relays the temporary password through a trusted channel."""
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    pw = initial_password_for(u.email)
    u.password_hash = hash_password(pw)
    u.must_change_password = True
    db.commit()
    return ResetPwOut(password=pw)


@router.get("/plates", response_model=list[PlateOption])
def list_all_plates() -> list[PlateOption]:
    """All folder plates available for assignment (from the data registry)."""
    out: list[PlateOption] = []
    for p in get_registry().list_plates():
        any_assets = any(d.has_dashboard_assets for d in p.drugs.values())
        out.append(PlateOption(plate_id=p.plate_id, plate_code=p.plate_code,
                               n_drugs=len(p.drugs), has_assets=any_assets))
    out.sort(key=lambda x: x.plate_id)
    return out


@router.post("/users/{user_id}/plates", response_model=AdminUserOut)
def assign_plate(user_id: int, body: AssignIn, db: DbSession = Depends(get_db)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    plate = get_registry().get_plate(body.plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {body.plate_id} not found")
    exists = db.query(Plate).filter(Plate.owner_id == u.id, Plate.plate_id == body.plate_id).first()
    if not exists:
        db.add(Plate(owner_id=u.id, plate_id=plate.plate_id, plate_code=plate.plate_code,
                     dose_um=plate.dose_um, treatment_hours=48.0, cell_line="U2OS",
                     data_dir=str(plate.data_dir)))
        db.commit()
    return _to_out(db, u)


@router.delete("/users/{user_id}/plates/{plate_id}", response_model=AdminUserOut)
def revoke_plate(user_id: int, plate_id: str, db: DbSession = Depends(get_db)) -> AdminUserOut:
    u = db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="user not found")
    row = db.query(Plate).filter(Plate.owner_id == u.id, Plate.plate_id == plate_id).first()
    if row:
        db.delete(row)
        db.commit()
    return _to_out(db, u)
