"""Protein metadata endpoint — UniProt info + external DB links for a gene."""

from __future__ import annotations

from fastapi import APIRouter

from ...domain.protein_info import get_protein_info
from ...schemas import ProteinInfo

router = APIRouter(prefix="/api/v1", tags=["proteins"])


@router.get("/proteins/{gene}", response_model=ProteinInfo)
def get_protein(gene: str) -> ProteinInfo:
    """Protein info for a human gene symbol (UniProt-backed, cached).

    Always 200s — unknown/failed lookups return found=false with search links.
    """
    return ProteinInfo.model_validate(get_protein_info(gene))
