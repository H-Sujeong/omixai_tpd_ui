"""Protein metadata endpoint — UniProt info + external DB links for a gene."""

from __future__ import annotations

from fastapi import APIRouter

from ...domain.protein_info import get_protein_info, get_protein_summary
from ...schemas import ProteinInfo

router = APIRouter(prefix="/api/v1", tags=["proteins"])


@router.get("/proteins/{gene}", response_model=ProteinInfo)
def get_protein(gene: str) -> ProteinInfo:
    """UniProt facts for a human gene symbol (cached, FAST — no LLM).

    Always 200s — unknown/failed lookups return found=false with search links.
    The Korean summary is fetched separately (see /summary) so the panel never
    blocks on the local model.
    """
    return ProteinInfo.model_validate(get_protein_info(gene))


@router.get("/proteins/{gene}/summary")
def get_protein_summary_route(gene: str) -> dict[str, object]:
    """Korean 개조식 function summary (slow — local Ollama). Cached after first
    success. Returns {gene, summary: [...]} ([] if unavailable)."""
    return {"gene": gene, "summary": get_protein_summary(gene)}
