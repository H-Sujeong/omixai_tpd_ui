"""Drug-level endpoints (dashboard, community switch, interactome node)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from ...data_loader import get_registry
from ...domain.dashboard import build_dashboard, interactome_node, switch_community
from ...schemas import (
    CommunitySwitchResponse,
    DashboardResponse,
    InteractomeNodeResponse,
    PpiPanel,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["drugs"])

_FILE_PREFIX = "/api/v1/files"


@router.get(
    "/plates/{plate_id}/drugs/{drug_id}/dashboard",
    response_model=DashboardResponse,
)
def get_dashboard(
    plate_id: str,
    drug_id: str,
    target: str | None = Query(default=None, description="Target gene (default = first)"),
) -> DashboardResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found in plate {plate_id}")
    return build_dashboard(plate, drug, target, _FILE_PREFIX)


@router.get(
    "/plates/{plate_id}/drugs/{drug_id}/communities/{community_id}",
    response_model=PpiPanel,
)
def get_community(
    plate_id: str,
    drug_id: str,
    community_id: int,
    target: str | None = Query(default=None),
) -> PpiPanel:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found in plate {plate_id}")
    available = [t.target for t in drug.targets] or ["unknown"]
    if target is None or target not in available:
        target = available[0]
    panel = switch_community(plate, drug, target, community_id)
    if panel is None:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} has no PPI asset")
    return PpiPanel.model_validate(panel)


@router.post(
    "/plates/{plate_id}/drugs/{drug_id}/communities/switch",
    response_model=CommunitySwitchResponse,
)
def post_switch_community(
    plate_id: str,
    drug_id: str,
    from_community_id: int = Query(..., description="Current community id"),
    to_community_id: int = Query(..., description="Community to switch to"),
    bridging_node: str = Query(..., description="Node id clicked to trigger the switch"),
    target: str | None = Query(default=None),
) -> CommunitySwitchResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found")
    available = [t.target for t in drug.targets] or ["unknown"]
    if target is None or target not in available:
        target = available[0]
    raw = switch_community(plate, drug, target, to_community_id)
    if raw is None:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} has no PPI asset")
    panel = PpiPanel.model_validate(raw)
    landscape_point = next(
        (c.landscape for c in panel.communities if c.community_id == to_community_id and c.landscape),
        None,
    )
    return CommunitySwitchResponse(
        from_community_id=from_community_id,
        to_community_id=to_community_id,
        bridging_node=bridging_node,
        nodes=panel.nodes,
        edges=panel.edges,
        go_terms=panel.go_terms,
        landscape_point=landscape_point,
    )


@router.get(
    "/plates/{plate_id}/drugs/{drug_id}/interactome/{node_id}",
    response_model=InteractomeNodeResponse,
)
def get_interactome_node(
    plate_id: str,
    drug_id: str,
    node_id: str,
    target: str | None = Query(default=None),
) -> InteractomeNodeResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found")
    available = [t.target for t in drug.targets] or ["unknown"]
    if target is None or target not in available:
        target = available[0]
    detail = interactome_node(plate, drug, target, node_id)
    if not detail:
        raise HTTPException(status_code=404, detail=f"node {node_id} not found")
    return InteractomeNodeResponse(plate_id=plate_id, drug_id=drug_id, target_id=target, node=detail)
