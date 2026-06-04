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
    # Local LLM (Ollama) for protein function summaries. Per language: EXAONE is
    # Korean-native (good ko, but tends to answer in Korean even when asked for
    # English), so English summaries use a separate English-strong model (Qwen).
    # If unreachable/uncooperative, the panel falls back to extractive English
    # bullets / the raw UniProt text.
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "exaone3.5:7.8b"       # ko summaries
    ollama_model_en: str = "qwen2.5:3b"        # en summaries
    # Time-lapse image scale. Operetta CLS 10x: one field = 1292 µm across
    # (2160 px native). Images are served as a 3×3 stitched montage downscaled
    # to 1024 px → 3×1292 / 1024 ≈ 3.785 µm/pixel. Adjust if the stitch layout
    # or export size changes.
    um_per_pixel: float = 3.785
    # GR time axis. The GR curve is already restricted to the drug-effect
    # observation window (the slope / gr_score is computed over it), so the whole
    # curve IS the window — there is no separate sub-window. Rows are spaced
    # gr_step_h hours starting at gr_window_start_h (e.g. 10h, 10.5h, …). The end
    # is derived from the row count. A hyperparameter.
    gr_window_start_h: float = 10.0
    gr_step_h: float = 0.5
    # Seed demo account (created on first startup if no users exist). The demo
    # account owns the bundled TPD_UI_DB plates so reviewers can log straight in.
    demo_email: str = "demo@omixai.local"
    demo_password: str = "demo1234"
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
