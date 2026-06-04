"""Auth endpoints — login / logout / me (HTTP-only cookie session)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ...auth import (
    clear_session_cookie,
    create_session,
    require_user,
    set_session_cookie,
    verify_password,
    SESSION_COOKIE,
    delete_session,
)
from ...db import get_db
from ...models import User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str | None = None
    is_demo: bool = False


def _to_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, is_demo=u.is_demo)


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, response: Response, db: DbSession = Depends(get_db)) -> UserOut:
    email = str(body.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid email or password")
    token = create_session(db, user)
    set_session_cookie(response, token)
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    return _to_out(user)


@router.post("/logout")
def logout(request: Request, response: Response, db: DbSession = Depends(get_db)) -> dict:
    delete_session(db, request.cookies.get(SESSION_COOKIE))
    clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(require_user)) -> UserOut:
    return _to_out(user)
