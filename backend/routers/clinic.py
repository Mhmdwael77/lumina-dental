"""
Clinic schedule endpoints — the backend source of truth for working days /
hours / consultation duration, so the frontend never hard-codes or
re-derives these business rules.

Public:
  GET /clinic/schedule              – working days, hours, consultation duration config
  GET /clinic/availability?date=    – queue preview for a given date
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_staff
from core.database import User
from core.clinic_schedule import WORKING_HOURS
from core.config import settings
from core.crud.setting import get_consultation_fee, set_consultation_fee
from schemas.booking import AvailabilityResponse, ClinicScheduleResponse, ConsultationFeeUpdate
from services.booking_service import get_availability

router = APIRouter(prefix="/clinic", tags=["Clinic"])

CURRENCY = "EGP"
_DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


@router.get("/schedule", response_model=ClinicScheduleResponse, summary="Get working days, hours & fee (public)")
def get_schedule(db: Session = Depends(get_db)):
    hours_by_day = {}
    for weekday, hours in WORKING_HOURS.items():
        name = _DAY_NAMES[weekday]
        hours_by_day[name] = (
            {"opens": hours[0].strftime("%H:%M"), "closes": hours[1].strftime("%H:%M")} if hours else None
        )

    return ClinicScheduleResponse(
        working_days=[d for d, hours in WORKING_HOURS.items() if hours is not None],
        hours_by_day=hours_by_day,
        min_consultation_minutes=settings.MIN_CONSULTATION_MINUTES,
        max_consultation_minutes=settings.MAX_CONSULTATION_MINUTES,
        booking_window_days=settings.BOOKING_WINDOW_DAYS,
        consultation_fee=get_consultation_fee(db),
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


@router.get("/availability", response_model=AvailabilityResponse, summary="Queue preview for a date (public)")
def get_availability_endpoint(
    date: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"),
    db: Session = Depends(get_db),
):
    return get_availability(db, date)
