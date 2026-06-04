"""Lightweight drug-info crawler.

Strategy (low aggressiveness — sample_data is small):
  1. Collect drug_id / HY-code / target list from the registry.
  2. For each (HY-code, target) lookup:
       - MedChemExpress product URL (HTTP HEAD only — confirm URL exists)
       - UniProt search API (text/json) to get protein full name + summary
       - Ensembl REST for gene description (optional)
  3. Persist results to backend/var/drug_info_cache.json
  4. Run again to refresh; missing entries are simply re-tried.

Run:
    python -m scripts.crawl_drug_info             # all drugs in registry
    python -m scripts.crawl_drug_info --limit 5   # quick dry run
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any

import httpx

# Allow running as `python -m backend.scripts.crawl_drug_info` or directly
ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import get_settings                              # noqa: E402
from app.data_loader import get_registry                         # noqa: E402

log = logging.getLogger("crawler")
logging.basicConfig(level=logging.INFO, format="%(levelname)s — %(message)s")

USER_AGENT = "OmixAI-TPD-DrugInfoCrawler/0.1 (internal demo)"
TIMEOUT = 10.0


def fetch_uniprot(target: str) -> dict[str, Any] | None:
    url = "https://rest.uniprot.org/uniprotkb/search"
    params = {
        "query": f"gene:{target} AND organism_id:9606",
        "format": "json",
        "size": 1,
        "fields": "accession,id,protein_name,gene_names,cc_function,cc_subcellular_location,organism_name",
    }
    try:
        r = httpx.get(url, params=params, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT)
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return None
        entry = results[0]
        protein_name = (
            entry.get("proteinDescription", {})
            .get("recommendedName", {})
            .get("fullName", {})
            .get("value")
        )
        return {
            "accession": entry.get("primaryAccession"),
            "id": entry.get("uniProtkbId"),
            "protein_name": protein_name,
            "function": _uniprot_function(entry),
            "subcellular_location": _uniprot_subcellular(entry),
        }
    except Exception as exc:                                     # noqa: BLE001
        log.warning("UniProt lookup failed for %s: %s", target, exc)
        return None


def _uniprot_function(entry: dict[str, Any]) -> str | None:
    for c in entry.get("comments", []):
        if c.get("commentType") == "FUNCTION":
            for txt in c.get("texts", []):
                if txt.get("value"):
                    return txt["value"][:600]
    return None


def _uniprot_subcellular(entry: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for c in entry.get("comments", []):
        if c.get("commentType") == "SUBCELLULAR LOCATION":
            for loc in c.get("subcellularLocations", []):
                v = loc.get("location", {}).get("value")
                if v:
                    out.append(v)
    return out


def fetch_mce_link(hy_code: str | None) -> str | None:
    """Return MedChemExpress product URL if it 200s — otherwise None."""
    if not hy_code:
        return None
    url = f"https://www.medchemexpress.com/{hy_code}.html"
    try:
        r = httpx.head(url, headers={"User-Agent": USER_AGENT}, timeout=TIMEOUT, follow_redirects=True)
        return url if r.status_code < 400 else None
    except Exception as exc:                                     # noqa: BLE001
        log.warning("MCE HEAD failed for %s: %s", hy_code, exc)
        return None


def build_drug_record(drug_name: str, hy_code: str | None, targets: list[str]) -> dict[str, Any]:
    record: dict[str, Any] = {
        "drug_name": drug_name,
        "hy_code": hy_code,
        "targets": targets,
        "source": "crawled",
        "references": {},
    }
    mce_url = fetch_mce_link(hy_code)
    if mce_url:
        record.setdefault("references", {})["MedChemExpress"] = mce_url
    # Per-target UniProt info
    target_info: dict[str, dict[str, Any]] = {}
    for t in targets:
        info = fetch_uniprot(t)
        if info:
            target_info[t] = info
            record.setdefault("references", {}).setdefault(t, {})
            if info.get("accession"):
                record["references"][t]["UniProt"] = f"https://www.uniprot.org/uniprotkb/{info['accession']}"
            record["references"][t]["Ensembl"] = f"https://www.ensembl.org/Multi/Search/Results?q={t}"
            record["references"][t]["Entrez"] = f"https://www.ncbi.nlm.nih.gov/gene/?term={t}"
            record["references"][t]["HPA"] = f"https://www.proteinatlas.org/search/{t}"
        time.sleep(0.3)  # polite throttle
    record["target_info"] = target_info
    # Pathway / MoA stay as placeholder unless we add an LLM step later
    return record


def main(limit: int | None = None) -> int:
    settings = get_settings()
    cache_path = settings.drug_info_cache
    cache: dict[str, Any] = {}
    if cache_path.exists():
        try:
            cache = json.loads(cache_path.read_text(encoding="utf-8"))
        except Exception as exc:                                # noqa: BLE001
            log.warning("existing cache load failed (%s) — starting fresh", exc)
            cache = {}

    registry = get_registry()
    queue: list[tuple[str, str | None, list[str]]] = []
    for plate in registry.list_plates():
        for drug in plate.drugs.values():
            key = drug.hy_code or drug.drug_name
            if key in cache:
                continue
            queue.append((drug.drug_name, drug.hy_code, [t.target for t in drug.targets]))

    if limit:
        queue = queue[:limit]
    log.info("crawling %d drugs (cache %s)", len(queue), cache_path)
    for i, (name, hy, targets) in enumerate(queue, 1):
        key = hy or name
        log.info("[%d/%d] %s (%s)", i, len(queue), name, hy or "-")
        try:
            cache[key] = build_drug_record(name, hy, targets)
        except Exception as exc:                                # noqa: BLE001
            log.exception("failed for %s: %s", name, exc)
        # Persist progressively
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
        time.sleep(0.5)
    log.info("done. cache @ %s", cache_path)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()
    sys.exit(main(args.limit))
