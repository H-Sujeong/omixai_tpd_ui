from __future__ import annotations

import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import admin as admin_router
from .api.v1 import auth as auth_router
from .api.v1 import drugs as drugs_router
from .api.v1 import files as files_router
from .api.v1 import plates as plates_router
from .api.v1 import proteins as proteins_router
from .auth import ensure_admin_user, ensure_demo_user, require_user
from .config import get_settings
from .data_loader import get_registry
from .db import SessionLocal, init_db
from .models import Plate

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s — %(message)s")


def create_app() -> FastAPI:
    app = FastAPI(
        title="OmixAI-TPD",
        version="0.1.0",
        description="Comprehensive Target Protein Degradation platform — plate viewer.",
    )
    settings = get_settings()
    app.add_middleware(
        CORSMiddleware,
        # Demo platform (no auth) — accept any origin so LAN clients on different
        # NICs / hostnames still load. Lock this down once auth lands.
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+):\d+",
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )
    # Auth is open; all data routers require a logged-in session.
    gated = [Depends(require_user)]
    app.include_router(auth_router.router)
    app.include_router(admin_router.router)  # admin-gated internally
    app.include_router(plates_router.router, dependencies=gated)
    app.include_router(drugs_router.router, dependencies=gated)
    app.include_router(files_router.router, dependencies=gated)
    app.include_router(proteins_router.router, dependencies=gated)

    @app.on_event("startup")
    def _warm() -> None:
        init_db()
        demo = ensure_demo_user()
        admin = ensure_admin_user()
        n = len(get_registry().list_plates())
        _seed_demo_plates(demo.id)
        logging.info("db ready; demo %s owns %d plates; admin %s", demo.email, n, admin.email)

    @app.get("/health")
    def _health() -> dict[str, str]:
        return {"status": "ok"}

    return app


def _seed_demo_plates(owner_id: int) -> None:
    """Register the bundled folder plates as owned by the demo account (once)."""
    reg = get_registry()
    db = SessionLocal()
    try:
        owned = {pid for (pid,) in db.query(Plate.plate_id).filter(Plate.owner_id == owner_id)}
        for plate in reg.list_plates():
            if plate.plate_id in owned:
                continue
            db.add(Plate(
                owner_id=owner_id,
                plate_id=plate.plate_id,
                plate_code=plate.plate_code,
                dose_um=plate.dose_um,
                treatment_hours=48.0,
                cell_line="U2OS",
                data_dir=str(plate.data_dir),
            ))
        db.commit()
    finally:
        db.close()


app = create_app()
