"""Drug metadata enrichment.

Reads the crawler cache (var/drug_info_cache.json) if present and falls back to
deterministic placeholder text so the UI never blanks out.
"""

from __future__ import annotations

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings

log = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def _load_cache() -> dict[str, dict[str, Any]]:
    p: Path = get_settings().drug_info_cache
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as exc:                                    # noqa: BLE001
        log.warning("drug_info_cache load failed: %s", exc)
        return {}


def _stable_choice(seed: str, options: list[str]) -> str:
    h = int(hashlib.md5(seed.encode("utf-8")).hexdigest(), 16)
    return options[h % len(options)]


# ---------- Heuristics by drug-group --------------------------------------

_PATHWAY_BY_GROUP = {
    "Epigenetic_chromatin": "Chromatin / Transcriptional regulation",
    "CDK_cell_cycle": "Cell cycle / Transcriptional regulation",
    "RTK_signaling": "RTK / RAS-MAPK signaling",
    "MAPK_signaling": "MAPK signaling",
    "Nuclear_receptor": "Nuclear receptor signaling",
    "DNA_damage_survival": "DNA damage / Apoptosis",
    "Metabolism_hypoxia": "Cell metabolism / Hypoxia",
    "Immune_stress": "Innate immunity / Stress response",
    "Other_kinase_misc": "Mixed kinase signaling",
}

# Shown when there is no curated MoA annotation for this compound. We do NOT
# fabricate a generic "PROTAC degrader" sentence (it was asserted for every drug,
# including non-PROTAC compounds) — flag the absence honestly instead.
_MOA_NOT_RECEIVED = "MoA 데이터 미수신 (no curated MoA annotation received)"


def get_drug_info(
    drug_id: str,
    drug_name: str,
    hy_code: str | None,
    targets: list[str],
    drug_group: str | None,
    smiles: str | None,
) -> dict[str, Any]:
    cache = _load_cache()
    cached = cache.get(hy_code or drug_name)
    pathway = (cached or {}).get("pathway") or _PATHWAY_BY_GROUP.get(drug_group or "", "Targeted protein degradation")
    moa = (cached or {}).get("moa") or _MOA_NOT_RECEIVED
    references_url = (cached or {}).get("references") or {}
    return {
        "pathway": pathway,
        "moa": moa,
        "structure_image_url": (cached or {}).get("structure_image_url"),
        "references": references_url,
        "synonyms": (cached or {}).get("synonyms", []),
        "source": cached.get("source", "placeholder") if cached else "placeholder",
    }


def reload_cache() -> None:
    _load_cache.cache_clear()
