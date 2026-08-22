"""
Clinic schedule endpoints — the backend source of truth for working days /
hours / consultation duration, so the frontend never hard-codes or
re-derives these business rules.

Public:
  GET /clinic/schedule?branch_id=              – working days, hours, consultation duration config
  GET /clinic/availability?date=&branch_id=    – queue preview for a given date

Pass branch_id to scope working days/hours to one branch; omit it for the
clinic-wide default (see core/clinic_schedule.py).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_staff
from core.database import User
from core.clinic_schedule import branch_working_hours, hours_by_day_json
from core.crud.branch import get_branch
from core.config import settings
from core.crud.setting import (
    get_consultation_fee,
    set_consultation_fee,
    get_consultation_validity_days,
    set_consultation_validity_days,
)
from schemas.booking import (
    AvailabilityResponse,
    ClinicScheduleResponse,
    ConsultationFeeUpdate,
    ConsultationValidityUpdate,
)
from services.booking_service import get_availability

router = APIRouter(prefix="/clinic", tags=["Clinic"])

CURRENCY = "EGP"


@router.get("/schedule", response_model=ClinicScheduleResponse, summary="Get working days, hours & fee (public)")
def get_schedule(branch_id: int | None = Query(None), db: Session = Depends(get_db)):
    branch = get_branch(db, branch_id) if branch_id is not None else None
    schedule = branch_working_hours(branch)

    return ClinicScheduleResponse(
        working_days=[d for d, hours in schedule.items() if hours is not None],
        hours_by_day=hours_by_day_json(schedule),
        min_consultation_minutes=settings.MIN_CONSULTATION_MINUTES,
        max_consultation_minutes=settings.MAX_CONSULTATION_MINUTES,
        booking_window_days=settings.BOOKING_WINDOW_DAYS,
        consultation_fee=get_consultation_fee(db),
        consultation_validity_days=get_consultation_validity_days(db),
        currency=CURRENCY,
    )


@router.patch("/consultation-fee", summary="Set the base consultation fee (staff)")
def update_consultation_fee(
    body: ConsultationFeeUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    fee = set_consultation_fee(db, body.fee)
    return {"consultation_fee": fee, "currency": CURRENCY}


@router.patch("/consultation-validity", summary="Set how many days a consultation stays valid (staff)")
def update_consultation_validity(
    body: ConsultationValidityUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    days = set_consultation_validity_days(db, body.days)
    return {"consultation_validity_days": days}


@router.get("/availability", response_model=AvailabilityResponse, summary="Queue preview for a date (public)")
def get_availability_endpoint(
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    branch_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    return get_availability(db, date, branch_id)
