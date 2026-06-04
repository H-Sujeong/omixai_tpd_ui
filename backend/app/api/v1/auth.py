"""Auth endpoints — login / logout / me (HTTP-only cookie session)."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ...auth import (
    clear_session_cookie,
    create_reset_token,
    create_session,
    hash_password,
    require_user,
    set_session_cookie,
    validate_reset_token,
    verify_password,
    SESSION_COOKIE,
    delete_session,
)
from ...config import get_settings
from ...db import get_db
from ...email_util import send_email
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
    is_admin: bool = False
    must_change_password: bool = False


def _to_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name,
                   is_demo=u.is_demo, is_admin=u.is_admin,
                   must_change_password=u.must_change_password)


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


class ChangePasswordIn(BaseModel):
    new_password: str


@router.post("/change-password")
def change_password(body: ChangePasswordIn, db: DbSession = Depends(get_db),
                    user: User = Depends(require_user)) -> dict:
    """Set a new password for the logged-in user (used for the forced first-login
    change). Clears the must_change_password flag."""
    if len(body.new_password) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password too short")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    return {"ok": True}


class ForgotIn(BaseModel):
    email: str


class ResetIn(BaseModel):
    token: str
    password: str


@router.post("/forgot")
def forgot_password(body: ForgotIn, db: DbSession = Depends(get_db)) -> dict:
    """Email a reset link if the account exists. Always 200 (no user enumeration)."""
    email = str(body.email).strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if user and user.is_active:
        token = create_reset_token(db, user)
        url = f"{get_settings().app_base_url}/reset?token={token}"
        send_email(
            user.email,
            "OmixAI-TPD 비밀번호 재설정 / Password reset",
            "아래 링크에서 비밀번호를 재설정하세요 (1시간 유효).\n"
            "Reset your password using the link below (valid for 1 hour).\n\n"
            f"{url}\n",
        )
    return {"ok": True}


@router.post("/reset")
def reset_password(body: ResetIn, db: DbSession = Depends(get_db)) -> dict:
    row = validate_reset_token(db, body.token)
    if not row:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid or expired reset link")
    if len(body.password) < 4:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="password too short")
    row.user.password_hash = hash_password(body.password)
    row.used = True
    db.commit()
    return {"ok": True}
