"""Protein metadata for a gene symbol, from UniProt (human) + external DB links.

Looked up on demand (when a PPI node is clicked) and cached write-through to
``var/protein_info_cache.json`` so repeat clicks are instant and we don't hammer
UniProt. Network/parse failures degrade gracefully to ``found=False`` with
search links — never raise.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from ..config import get_settings

log = logging.getLogger(__name__)

_UA = "omixai-tpd-ui/1.0 (protein-info)"
_TIMEOUT = 8.0
_UNIPROT_URL = "https://rest.uniprot.org/uniprotkb/search"
_FIELDS = (
    "accession,id,protein_name,gene_names,cc_function,cc_subcellular_location,"
    "length,mass,xref_pdb,xref_string,protein_families,keyword,organism_name"
)

# In-memory write-through cache (loaded once from disk).
_cache: dict[str, dict[str, Any]] | None = None


def _cache_path() -> Path:
    return get_settings().protein_info_cache


def _load() -> dict[str, dict[str, Any]]:
    global _cache
    if _cache is not None:
        return _cache
    p = _cache_path()
    if p.exists():
        try:
            _cache = json.loads(p.read_text(encoding="utf-8"))
        except Exception as exc:                                  # noqa: BLE001
            log.warning("protein_info_cache load failed: %s", exc)
            _cache = {}
    else:
        _cache = {}
    return _cache


def _persist() -> None:
    try:
        _cache_path().write_text(
            json.dumps(_cache, ensure_ascii=False, indent=0), encoding="utf-8"
        )
    except Exception as exc:                                      # noqa: BLE001
        log.warning("protein_info_cache write failed: %s", exc)


# --- UniProt entry parsing ----------------------------------------------------

def _function(entry: dict[str, Any]) -> str | None:
    for c in entry.get("comments", []):
        if c.get("commentType") == "FUNCTION":
            for txt in c.get("texts", []):
                if txt.get("value"):
                    return txt["value"][:600]
    return None


def _subcellular(entry: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for c in entry.get("comments", []):
        if c.get("commentType") == "SUBCELLULAR LOCATION":
            for loc in c.get("subcellularLocations", []):
                v = loc.get("location", {}).get("value")
                if v and v not in out:
                    out.append(v)
    return out


def _families(entry: dict[str, Any]) -> list[str]:
    out: list[str] = []
    # "Belongs to the ... family." similarity comments are the cleanest source.
    for c in entry.get("comments", []):
        if c.get("commentType") == "SIMILARITY":
            for txt in c.get("texts", []):
                v = txt.get("value")
                if v and v not in out:
                    out.append(v.rstrip("."))
    # Fall back to domain/family keywords.
    if not out:
        for kw in entry.get("keywords", []):
            if kw.get("category") in ("Domain", "Molecular function") and kw.get("name"):
                out.append(kw["name"])
    return out[:4]


def _xrefs(entry: dict[str, Any]) -> tuple[list[str], str | None]:
    pdb: list[str] = []
    string_id: str | None = None
    for x in entry.get("uniProtKBCrossReferences", []):
        db = x.get("database")
        if db == "PDB":
            if x.get("id"):
                pdb.append(x["id"])
        elif db == "STRING" and string_id is None:
            string_id = x.get("id")
    return pdb, string_id


def _search_links(gene: str) -> dict[str, str]:
    g = quote(gene)
    return {
        "uniprot": f"https://www.uniprot.org/uniprotkb?query=gene:{g}+AND+organism_id:9606",
        "string": f"https://string-db.org/cgi/network?identifiers={g}&species=9606",
        "pdb": f"https://www.rcsb.org/search?q={g}",
    }


def _empty(gene: str) -> dict[str, Any]:
    return {
        "gene": gene,
        "found": False,
        "accession": None,
        "protein_name": None,
        "function": None,
        "families": [],
        "length": None,
        "mass_kda": None,
        "subcellular": [],
        "pdb_ids": [],
        "pdb_count": 0,
        "links": _search_links(gene),
    }


def get_protein_info(gene: str) -> dict[str, Any]:
    """Return protein info dict for a human gene symbol (cached, never raises)."""
    gene = (gene or "").strip()
    if not gene:
        return _empty(gene)
    cache = _load()
    key = gene.upper()
    if key in cache:
        return cache[key]

    result = _empty(gene)
    try:
        def _query(extra: str) -> list[dict[str, Any]]:
            r = httpx.get(
                _UNIPROT_URL,
                params={"query": f"gene_exact:{gene} AND organism_id:9606{extra}",
                        "format": "json", "size": 1, "fields": _FIELDS},
                headers={"User-Agent": _UA},
                timeout=_TIMEOUT,
            )
            r.raise_for_status()
            return r.json().get("results", [])

        # Prefer the reviewed (SwissProt) canonical entry — it carries the real
        # name / function / PDB xrefs. Fall back to any entry if none reviewed.
        results = _query(" AND reviewed:true") or _query("")
        if results:
            e = results[0]
            acc = e.get("primaryAccession")
            pname = (
                e.get("proteinDescription", {})
                .get("recommendedName", {})
                .get("fullName", {})
                .get("value")
            )
            seq = e.get("sequence", {}) or {}
            length = seq.get("length")
            mol = seq.get("molWeight")
            pdb, string_id = _xrefs(e)
            links = _search_links(gene)
            if acc:
                links["uniprot"] = f"https://www.uniprot.org/uniprotkb/{acc}/entry"
            if string_id:
                links["string"] = f"https://string-db.org/network/{string_id}"
            if pdb:
                links["pdb"] = f"https://www.rcsb.org/structure/{pdb[0]}"
            result = {
                "gene": gene,
                "found": True,
                "accession": acc,
                "protein_name": pname,
                "function": _function(e),
                "families": _families(e),
                "length": length,
                "mass_kda": round(mol / 1000.0, 1) if mol else None,
                "subcellular": _subcellular(e),
                "pdb_ids": pdb[:8],
                "pdb_count": len(pdb),
                "links": links,
            }
    except Exception as exc:                                      # noqa: BLE001
        log.warning("UniProt lookup failed for %s: %s", gene, exc)
        # keep graceful empty result (do NOT cache failures so we retry later)
        return result

    cache[key] = result
    _persist()
    return result
