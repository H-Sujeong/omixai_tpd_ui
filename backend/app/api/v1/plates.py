"""Plate-level endpoints (analysis selector + drug summary table)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ...data_loader import PlateRegistry, get_registry
from ...schemas import DrugSummaryRow, DrugTargetEntry, PlateSummary

router = APIRouter(prefix="/api/v1", tags=["plates"])


def _registry() -> PlateRegistry:
    return get_registry()


@router.get("/plates", response_model=list[PlateSummary])
def list_plates() -> list[PlateSummary]:
    reg = _registry()
    out: list[PlateSummary] = []
    for plate in reg.list_plates():
        n_drugs = len(plate.drugs)
        n_wells = sum(len(d.wells) for d in plate.drugs.values())
        any_assets = any(d.has_dashboard_assets for d in plate.drugs.values())
        out.append(PlateSummary(
            plate_id=plate.plate_id,
            plate_code=plate.plate_code,
            dose_um=plate.dose_um,
            treatment_hours=48.0,
            cell_line="U2OS",
            n_wells=n_wells,
            n_drugs=n_drugs,
            generated_at=None,
            pipeline_version="demo-0.1",
            has_dashboard_assets=any_assets,
        ))
    out.sort(key=lambda p: p.plate_id)
    return out


@router.get("/plates/{plate_id}/drugs", response_model=list[DrugSummaryRow])
def list_drugs(plate_id: str) -> list[DrugSummaryRow]:
    plate = _registry().get_plate(plate_id)
    if not plate:
        raise HTTPException(status_code=404, detail=f"plate {plate_id} not found")
    rows: list[DrugSummaryRow] = []
    for drug in plate.drugs.values():
        wells = [w.well_label for w in drug.wells]
        # Best single (representative) effect class + GR score for the summary row
        gr_scores = [w.gr_score for w in drug.wells if w.gr_score is not None]
        gr_score = float(sum(gr_scores) / len(gr_scores)) if gr_scores else None
        effect_classes = [w.effect_class for w in drug.wells if w.effect_class and w.effect_class != "invalid"]
        effect_class = max(set(effect_classes), key=effect_classes.count) if effect_classes else None
        rows.append(DrugSummaryRow(
            drug_id=drug.drug_id,
            drug_name=drug.drug_name,
            hy_code=drug.hy_code,
            wells=wells,
            targets=[
                DrugTargetEntry(target=t.target, if_g=t.if_g, e3_ligase=t.e3_ligase)
                for t in drug.targets
            ],
            target_class=drug.target_class,
            drug_group=drug.drug_group,
            gr_score=gr_score,
            growth_class=_growth_label(gr_score, effect_class),
            effect_class=effect_class,
            smiles=drug.smiles,
            has_dashboard_assets=drug.has_dashboard_assets,
        ))
    rows.sort(key=lambda r: r.drug_name.lower())
    return rows


def _growth_label(gr_score: float | None, effect_class: str | None) -> str | None:
    if effect_class is None:
        return None
    if gr_score is None:
        return effect_class
    if gr_score < -0.05:
        return "Strong cytotoxic"
    if gr_score < 0.2:
        return "Cytotoxic"
    if gr_score < 0.6:
        return "Cytostatic"
    return "Growth-permissive"
