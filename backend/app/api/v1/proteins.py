"""Protein metadata endpoint — UniProt info + external DB links for a gene."""

from __future__ import annotations

from fastapi import APIRouter

from ...domain.protein_info import get_protein_info
from ...schemas import ProteinInfo

router = APIRouter(prefix="/api/v1", tags=["proteins"])


@router.get("/proteins/{gene}", response_model=ProteinInfo)
def get_protein(gene: str, lang: str = "ko") -> ProteinInfo:
    """Protein info (UniProt + optional Korean summary) for a human gene symbol.

    lang="ko" (default) includes the local-LLM Korean summary (slower; UI shows
    a shimmer). lang="en" skips the LLM and the UI shows the English UniProt
    function instead. Cached; always 200s (found=false → search links).
    """
    return ProteinInfo.model_validate(get_protein_info(gene, want_summary=lang != "en"))
