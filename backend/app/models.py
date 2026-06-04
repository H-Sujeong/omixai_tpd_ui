"""ORM models — accounts, sessions, plate ownership."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(120), default=None)
    is_demo: Mapped[bool] = mapped_column(default=False)
    is_admin: Mapped[bool] = mapped_column(default=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    last_login_at: Mapped[datetime | None] = mapped_column(default=None)

    plates: Mapped[list["Plate"]] = relationship(back_populates="owner", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    token: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    expires_at: Mapped[datetime] = mapped_column()

    user: Mapped[User] = relationship()


class Plate(Base):
    """Ownership + metadata pointer for one experiment plate. The actual data
    (CSVs, json assets, time-lapse images) stays in the folder at ``data_dir``."""

    __tablename__ = "plates"
    __table_args__ = (UniqueConstraint("owner_id", "plate_id", name="uq_owner_plate"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plate_id: Mapped[str] = mapped_column(String(120), index=True)
    plate_code: Mapped[str | None] = mapped_column(String(120), default=None)
    dose_um: Mapped[float | None] = mapped_column(default=None)
    treatment_hours: Mapped[float | None] = mapped_column(default=None)
    cell_line: Mapped[str | None] = mapped_column(String(120), default=None)
    data_dir: Mapped[str] = mapped_column(String(1024))  # absolute path to the plate folder
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now)

    owner: Mapped[User] = relationship(back_populates="plates")
