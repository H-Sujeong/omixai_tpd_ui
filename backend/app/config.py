from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="OMIXAI_",
        extra="ignore",
    )

    # Default: TPD_UI_DB is a sibling of omixai_tpd_ui inside Documents/
    # (parents[2] = omixai_tpd_ui repo root; .parent = Documents/.)
    data_root: Path = Path(__file__).resolve().parents[2].parent / "TPD_UI_DB"
    drug_info_cache: Path = Path(__file__).resolve().parents[1] / "var" / "drug_info_cache.json"
    protein_info_cache: Path = Path(__file__).resolve().parents[1] / "var" / "protein_info_cache.json"
    db_path: Path = Path(__file__).resolve().parents[1] / "var" / "omixai.db"
    # Local LLM (Ollama) for Korean function summaries. If unreachable, the
    # protein panel falls back to the English UniProt text.
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "exaone3.5:7.8b"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        # Allow LAN access too; production should narrow this.
        "http://192.168.0.57:5173",
        "http://192.168.0.57:5174",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    s = Settings()
    s.drug_info_cache.parent.mkdir(parents=True, exist_ok=True)
    s.protein_info_cache.parent.mkdir(parents=True, exist_ok=True)
    s.db_path.parent.mkdir(parents=True, exist_ok=True)
    return s
