"""Protein metadata endpoint — UniProt info + external DB links for a gene."""

from __future__ import annotations

from fastapi import APIRouter

from ...domain.protein_info import get_protein_info
from ...schemas import ProteinInfo

router = APIRouter(prefix="/api/v1", tags=["proteins"])


@router.get("/proteins/{gene}", response_model=ProteinInfo)
def get_protein(gene: str) -> ProteinInfo:
    """Protein info (UniProt + Korean summary) for a human gene symbol.

    Cached; always 200s — unknown/failed lookups return found=false with search
    links. The Korean summary uses the local LLM, so this can be slow on the
    first fetch of a protein (the UI shows a loading shimmer).
    """
    return ProteinInfo.model_validate(get_protein_info(gene))
