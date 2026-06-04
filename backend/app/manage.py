"""Admin CLI for provisioning accounts (no public sign-up — accounts are handed
out by us). Run from backend/:

    python -m app.manage create-user --email a@b.com --password secret --name "Jane"
    python -m app.manage list-users
    python -m app.manage set-password --email a@b.com --password new
    python -m app.manage deactivate --email a@b.com
    python -m app.manage activate   --email a@b.com
    python -m app.manage assign-plate --email a@b.com --plate-id D3_10
    python -m app.manage revoke-plate --email a@b.com --plate-id D3_10
"""

from __future__ import annotations

import argparse
import sys

from .auth import hash_password
from .data_loader import get_registry
from .db import SessionLocal, init_db
from .models import Plate, User


def _get_user(db, email: str) -> User | None:
    return db.query(User).filter(User.email == email.strip().lower()).first()


def cmd_create_user(args) -> int:
    db = SessionLocal()
    try:
        email = args.email.strip().lower()
        if _get_user(db, email):
            print(f"user already exists: {email}", file=sys.stderr)
            return 1
        db.add(User(email=email, password_hash=hash_password(args.password),
                    display_name=args.name, is_demo=False))
        db.commit()
        print(f"created user: {email}")
        return 0
    finally:
        db.close()


def cmd_list_users(_args) -> int:
    db = SessionLocal()
    try:
        rows = db.query(User).order_by(User.id).all()
        if not rows:
            print("(no users)")
            return 0
        for u in rows:
            n_plates = db.query(Plate).filter(Plate.owner_id == u.id).count()
            flags = ",".join(f for f, on in (("admin", u.is_admin), ("demo", u.is_demo), ("inactive", not u.is_active)) if on)
            print(f"#{u.id:<3} {u.email:<32} plates={n_plates:<3} {flags}")
        return 0
    finally:
        db.close()


def cmd_set_password(args) -> int:
    db = SessionLocal()
    try:
        u = _get_user(db, args.email)
        if not u:
            print(f"no such user: {args.email}", file=sys.stderr)
            return 1
        u.password_hash = hash_password(args.password)
        db.commit()
        print(f"password updated: {u.email}")
        return 0
    finally:
        db.close()


def _set_active(email: str, active: bool) -> int:
    db = SessionLocal()
    try:
        u = _get_user(db, email)
        if not u:
            print(f"no such user: {email}", file=sys.stderr)
            return 1
        u.is_active = active
        db.commit()
        print(f"{'activated' if active else 'deactivated'}: {u.email}")
        return 0
    finally:
        db.close()


def cmd_set_admin(args) -> int:
    db = SessionLocal()
    try:
        u = _get_user(db, args.email)
        if not u:
            print(f"no such user: {args.email}", file=sys.stderr)
            return 1
        u.is_admin = not args.off
        db.commit()
        print(f"{'granted' if u.is_admin else 'revoked'} admin: {u.email}")
        return 0
    finally:
        db.close()


def cmd_assign_plate(args) -> int:
    db = SessionLocal()
    try:
        u = _get_user(db, args.email)
        if not u:
            print(f"no such user: {args.email}", file=sys.stderr)
            return 1
        plate = get_registry().get_plate(args.plate_id)
        if not plate:
            print(f"no such plate in data root: {args.plate_id}", file=sys.stderr)
            return 1
        if db.query(Plate).filter(Plate.owner_id == u.id, Plate.plate_id == args.plate_id).first():
            print(f"already owned: {u.email} → {args.plate_id}")
            return 0
        db.add(Plate(owner_id=u.id, plate_id=plate.plate_id, plate_code=plate.plate_code,
                     dose_um=plate.dose_um, treatment_hours=48.0, cell_line="U2OS",
                     data_dir=str(plate.data_dir)))
        db.commit()
        print(f"assigned: {u.email} → {args.plate_id}")
        return 0
    finally:
        db.close()


def cmd_revoke_plate(args) -> int:
    db = SessionLocal()
    try:
        u = _get_user(db, args.email)
        if not u:
            print(f"no such user: {args.email}", file=sys.stderr)
            return 1
        row = db.query(Plate).filter(Plate.owner_id == u.id, Plate.plate_id == args.plate_id).first()
        if not row:
            print(f"not owned: {u.email} → {args.plate_id}")
            return 0
        db.delete(row)
        db.commit()
        print(f"revoked: {u.email} → {args.plate_id}")
        return 0
    finally:
        db.close()


def main(argv: list[str] | None = None) -> int:
    init_db()
    p = argparse.ArgumentParser(prog="app.manage", description="Account provisioning")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("create-user"); c.add_argument("--email", required=True); c.add_argument("--password", required=True); c.add_argument("--name", default=None); c.set_defaults(fn=cmd_create_user)
    sub.add_parser("list-users").set_defaults(fn=cmd_list_users)
    c = sub.add_parser("set-password"); c.add_argument("--email", required=True); c.add_argument("--password", required=True); c.set_defaults(fn=cmd_set_password)
    c = sub.add_parser("deactivate"); c.add_argument("--email", required=True); c.set_defaults(fn=lambda a: _set_active(a.email, False))
    c = sub.add_parser("activate"); c.add_argument("--email", required=True); c.set_defaults(fn=lambda a: _set_active(a.email, True))
    c = sub.add_parser("set-admin"); c.add_argument("--email", required=True); c.add_argument("--off", action="store_true", help="revoke admin"); c.set_defaults(fn=cmd_set_admin)
    c = sub.add_parser("assign-plate"); c.add_argument("--email", required=True); c.add_argument("--plate-id", required=True); c.set_defaults(fn=cmd_assign_plate)
    c = sub.add_parser("revoke-plate"); c.add_argument("--email", required=True); c.add_argument("--plate-id", required=True); c.set_defaults(fn=cmd_revoke_plate)

    args = p.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
