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
        "summary": [],
        "families": [],
        "length": None,
        "mass_kda": None,
        "subcellular": [],
        "pdb_ids": [],
        "pdb_count": 0,
        "links": _search_links(gene),
    }


# Restore key biochem terms to English (the model tends to translate them).
# Ordered: compound terms before their substrings.
_TERM_MAP: list[tuple[str, str]] = [
    ("유비퀴틴 리가제", "ubiquitin ligase"),
    ("유비퀴틴화", "ubiquitination"),
    ("유비퀴틴", "ubiquitin"),
    ("프로테아좀", "proteasome"),
    ("탈인산화", "dephosphorylation"),
    ("인산화", "phosphorylation"),
    ("탈아세틸화", "deacetylation"),
    ("아세틸화", "acetylation"),
    ("메틸화", "methylation"),
    ("자가포식", "autophagy"),
    ("세포자멸사", "apoptosis"),
    ("세포자멸", "apoptosis"),
    ("세포 자멸", "apoptosis"),
    ("세포사멸", "apoptosis"),
    ("세포 사멸", "apoptosis"),
    ("아폽토시스", "apoptosis"),
    ("전사 인자", "transcription factor"),
    ("전사", "transcription"),
    ("염색질", "chromatin"),
    ("히스톤", "histone"),
    ("후성유전학적", "epigenetic"),
    ("후성유전학", "epigenetics"),
    ("에피제네틱", "epigenetic"),
    ("리가제", "ligase"),
    ("키나아제", "kinase"),
    ("키네이스", "kinase"),
]


def _anglicize_terms(text: str) -> str:
    for ko, en in _TERM_MAP:
        text = text.replace(ko, en)
    return text


def _summarize_ko(gene: str, protein_name: str | None, function_text: str) -> list[str]:
    """Summarize the English UniProt function into Korean 개조식 bullets via the
    local Ollama model. Gene/protein/domain names and technical terms stay in
    English. Returns [] on any failure (panel then shows the English text)."""
    s = get_settings()
    prompt = (
        f"다음은 인간 단백질 {gene}"
        + (f" ({protein_name})" if protein_name else "")
        + "의 기능 설명(영문)이다. 이를 한국어 개조식(불릿)으로 3~5줄로 요약하라.\n"
        "규칙:\n"
        "- 각 줄은 '- '로 시작.\n"
        "- 유전자명·단백질명·도메인명·복합체명 등 고유명사는 영어 원문 그대로.\n"
        "- 생화학/분자생물학 전문용어(예: ubiquitination, degradation, transcription, "
        "phosphorylation, chromatin, acetylation)도 번역하지 말고 영어 그대로 쓸 것 "
        "(절대 한글로 음차/혼용하지 말 것).\n"
        "- 나머지 서술은 자연스러운 한국어로.\n"
        "- 불릿 외 다른 말(머리말/맺음말)은 출력하지 말 것.\n\n"
        f"영문 설명:\n{function_text}"
    )
    try:
        r = httpx.post(
            f"{s.ollama_url}/api/generate",
            json={"model": s.ollama_model, "prompt": prompt, "stream": False,
                  "keep_alive": "30m", "options": {"temperature": 0.2}},
            timeout=120.0,
        )
        r.raise_for_status()
        text = (r.json().get("response") or "").strip()
        bullets: list[str] = []
        for ln in text.splitlines():
            ln = ln.strip()
            if ln[:1] in ("-", "•", "*"):
                ln = ln[1:].strip()
            if ln:
                bullets.append(_anglicize_terms(ln))
        return bullets[:6]
    except Exception as exc:                                      # noqa: BLE001
        log.info("Ollama summary unavailable for %s: %s", gene, exc)
        return []


def get_protein_info(gene: str) -> dict[str, Any]:
    """Return UniProt facts for a human gene symbol — FAST (no LLM).

    The Korean summary is generated separately via get_protein_summary so the
    info panel never blocks on the local model. UniProt facts are cached.
    """
    gene = (gene or "").strip()
    if not gene:
        return _empty(gene)
    cache = _load()
    key = gene.upper()
    info = cache.get(key)
    if info is not None:
        info.setdefault("summary", [])
        return info

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
            fn = _function(e)
            result = {
                "gene": gene,
                "found": True,
                "accession": acc,
                "protein_name": pname,
                "function": fn,
                "summary": [],  # generated lazily by get_protein_summary
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

    # Only cache successful UniProt lookups so failures retry next time.
    if result.get("found"):
        cache[key] = result
        _persist()
    return result


def get_protein_summary(gene: str) -> list[str]:
    """Korean 개조식 summary for a gene (slow — local LLM). Cached after first
    success; retried until the model is reachable. Returns [] if no function."""
    info = get_protein_info(gene)
    if not info.get("found") or not info.get("function"):
        return []
    if info.get("summary"):
        return info["summary"]
    bullets = _summarize_ko(gene, info.get("protein_name"), info["function"])
    if bullets:
        info["summary"] = bullets
        cache = _load()
        cache[gene.strip().upper()] = info
        _persist()
    return bullets
