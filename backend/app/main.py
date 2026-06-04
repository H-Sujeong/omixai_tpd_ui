from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.v1 import drugs as drugs_router
from .api.v1 import files as files_router
from .api.v1 import plates as plates_router
from .api.v1 import proteins as proteins_router
from .config import get_settings
from .data_loader import get_registry

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
    app.include_router(plates_router.router)
    app.include_router(drugs_router.router)
    app.include_router(files_router.router)
    app.include_router(proteins_router.router)

    @app.on_event("startup")
    def _warm() -> None:
        n = len(get_registry().list_plates())
        logging.info("plate registry warmed (%d plates from %s)", n, settings.data_root)

    @app.get("/health")
    def _health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
