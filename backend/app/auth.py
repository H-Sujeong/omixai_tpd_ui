"""Authentication — pbkdf2 password hashing (stdlib, no external deps),
server-side sessions stored in the DB, and an HTTP-only session cookie.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session as DbSession

from .db import get_db
from .models import Session as SessionRow
from .models import User

SESSION_COOKIE = "omixai_session"
SESSION_TTL = timedelta(days=14)
_PBKDF2_ITERS = 200_000


# --- password hashing (pbkdf2_sha256, stdlib) --------------------------------

def hash_password(password: str, iterations: int = _PBKDF2_ITERS) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)
    return f"pbkdf2_sha256${iterations}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, iters, salt_b64, hash_b64 = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iters))
        return hmac.compare_digest(dk, expected)
    except Exception:  # noqa: BLE001
        return False


# --- sessions ----------------------------------------------------------------

def create_session(db: DbSession, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(SessionRow(token=token, user_id=user.id, expires_at=datetime.now(timezone.utc) + SESSION_TTL))
    db.commit()
    return token


def delete_session(db: DbSession, token: str | None) -> None:
    if not token:
        return
    row = db.get(SessionRow, token)
    if row:
        db.delete(row)
        db.commit()


def _user_from_token(db: DbSession, token: str | None) -> User | None:
    if not token:
        return None
    row = db.get(SessionRow, token)
    if not row:
        return None
    exp = row.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp < datetime.now(timezone.utc):
        db.delete(row)
        db.commit()
        return None
    user = row.user
    return user if user and user.is_active else None


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,
        samesite="lax",
        secure=False,  # dev over http; flip to True behind HTTPS
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")


# --- FastAPI dependencies ----------------------------------------------------

def current_user_optional(request: Request, db: DbSession = Depends(get_db)) -> User | None:
    return _user_from_token(db, request.cookies.get(SESSION_COOKIE))


def require_user(request: Request, db: DbSession = Depends(get_db)) -> User:
    user = _user_from_token(db, request.cookies.get(SESSION_COOKIE))
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="not authenticated")
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin only")
    return user


# --- seeding -----------------------------------------------------------------

def ensure_demo_user() -> User:
    """Create the seed demo account on first run (idempotent). Returns it."""
    from .config import get_settings
    from .db import SessionLocal

    s = get_settings()
    email = s.demo_email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password(s.demo_password),
                display_name="Demo",
                is_demo=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not verify_password(s.demo_password, user.password_hash):
            # keep the demo password in sync with config (reset on change).
            user.password_hash = hash_password(s.demo_password)
            db.commit()
        return user
    finally:
        db.close()


def ensure_admin_user() -> User:
    """Create the seed admin account on first run (idempotent)."""
    from .config import get_settings
    from .db import SessionLocal

    s = get_settings()
    email = s.admin_email.strip().lower()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            user = User(
                email=email,
                password_hash=hash_password(s.admin_password),
                display_name="Admin",
                is_admin=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        elif not user.is_admin:
            user.is_admin = True
            db.commit()
        return user
    finally:
        db.close()
