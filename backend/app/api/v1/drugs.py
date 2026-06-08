"""Drug-level endpoints (dashboard, community switch, interactome node)."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from ...data_loader import get_registry
from ...domain.dashboard import build_dashboard, build_timecourse, interactome_node, switch_community
from ...ownership import require_owned_plate
from ...schemas import (
    CommunitySwitchResponse,
    DashboardResponse,
    InteractomeNodeResponse,
    PpiPanel,
    TimecourseResponse,
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
    _owned: str = Depends(require_owned_plate),
    target: str | None = Query(default=None, description="Target gene (default = first)"),
    dose: str | None = Query(default=None, description="Dose label (multi-dose plates only, e.g. '10uM', '3uM')"),
    time: str | None = Query(default=None, description="Timepoint label ('0h'/'4h'/'24h'); ppi/landscape only — KPIs/GR stay at primary"),
) -> DashboardResponse:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found in plate {plate_id}")
    return build_dashboard(plate, drug, target, _FILE_PREFIX, dose=dose, time=time)


@router.get(
    "/plates/{plate_id}/drugs/{drug_id}/timecourse",
    response_model=TimecourseResponse,
)
def get_timecourse(
    plate_id: str,
    drug_id: str,
    _owned: str = Depends(require_owned_plate),
    target: str | None = Query(default=None, description="Target gene (default = drug's first)"),
    dose: str | None = Query(default=None, description="Dose label (multi-dose plates, '10uM'/'3uM')"),
    threshold: float = Query(default=0.2, ge=0.0, le=1.0,
                              description="|corr| cutoff for the participation rate"),
) -> TimecourseResponse:
    """Module × time heatmap (Tier 1 / opt-in v2) — see §3.5 of the design doc.
    Lazy-fetched only when the user opens the '⊕ 시간축 분석' drawer."""
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    drug = plate.drugs.get(drug_id)
    if not drug:
        raise HTTPException(status_code=404, detail=f"drug {drug_id} not found in plate {plate_id}")
    tgt = target or (drug.targets[0].target if drug.targets else None)
    if not tgt:
        raise HTTPException(status_code=400, detail="no target available for this drug")
    return build_timecourse(plate, drug, tgt, dose=dose, participation_threshold=threshold)


@router.get(
    "/plates/{plate_id}/drugs/{drug_id}/communities/{community_id}",
    response_model=PpiPanel,
)
def get_community(
    plate_id: str,
    drug_id: str,
    community_id: int,
    _owned: str = Depends(require_owned_plate),
    target: str | None = Query(default=None),
    dose: str | None = Query(default=None, description="Dose label (multi-dose plates only, e.g. '10uM'/'3uM')"),
) -> PpiPanel:
    plate = get_registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")

    # Dose-scoped plate/drug — mirrors build_dashboard so multi-dose plates
    # (e.g. D3) load the right on_target.json for the requested community.
    # Without this the virtual plate falls back to the default dose's assets
    # and any community id present only in the OTHER dose returns 404.
    from ...domain.dashboard import _resolve_dose, _dose_label_for
    try:
        effective_dose = _resolve_dose(plate, dose)
        plate_for_dose = plate
        if plate.kind == "multi_dose" and effective_dose:
            for mid, dv in plate.member_doses.items():
                if _dose_label_for(dv) == effective_dose:
                    m = get_registry().get_plate(mid)
                    if m is not None:
                        plate_for_dose = m
                    break
        drug = plate_for_dose.drugs.get(drug_id) or plate.drugs.get(drug_id)
        if not drug:
            raise HTTPException(status_code=404, detail=f"drug {drug_id} not found in plate {plate_id}")
        available = [t.target for t in drug.targets] or ["unknown"]
        if target is None or target not in available:
            target = available[0]
        panel = switch_community(plate_for_dose, drug, target, community_id)
        if panel is None:
            raise HTTPException(status_code=404, detail=f"drug {drug_id} has no PPI asset")
        return PpiPanel.model_validate(panel)
    except HTTPException:
        raise
    except Exception as exc:
        import logging, traceback
        logging.getLogger(__name__).exception("get_community failed plate=%s drug=%s comm=%s target=%s dose=%s",
                                              plate_id, drug_id, community_id, target, dose)
        # Surface the trace in the response detail so the UI can show it during
        # development (will be tightened later — see follow-up).
        raise HTTPException(
            status_code=500,
            detail=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-800:]}",
        )


@router.post(
    "/plates/{plate_id}/drugs/{drug_id}/communities/switch",
    response_model=CommunitySwitchResponse,
)
def post_switch_community(
    plate_id: str,
    drug_id: str,
    _owned: str = Depends(require_owned_plate),
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
    _owned: str = Depends(require_owned_plate),
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
