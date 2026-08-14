"""
Booking endpoints.

Public:
  POST /bookings/            – Submit a new appointment request (no auth needed)

Staff / Admin (JWT required):
  GET  /bookings/            – List all bookings (with optional ?status= filter)
  GET  /bookings/{id}        – Get a single booking
  PATCH /bookings/{id}/status – Update a booking's status
  DELETE /bookings/{id}      – Remove a booking
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_staff
from core.database import User
from schemas.booking import (
    BookingCreate,
    BookingStatusUpdate,
    BookingResponse,
    BookingPublicResponse,
)
from services.booking_service import (
    validate_and_create_booking,
    list_bookings,
    get_single_booking,
    change_booking_status,
    remove_booking,
)

router = APIRouter(prefix="/bookings", tags=["Bookings"])


# ── Public ────────────────────────────────────────────────────────────────────
@router.post(
    "/",
    response_model=BookingPublicResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a booking request (public)",
)
def create_booking(data: BookingCreate, db: Session = Depends(get_db)):
    booking = validate_and_create_booking(db, data)
    return booking


# ── Staff / Admin ─────────────────────────────────────────────────────────────
@router.get(
    "/",
    response_model=list[BookingResponse],
    summary="List bookings (staff)",
)
def list_all_bookings(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    status_filter: str | None = Query(None, alias="status"),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return list_bookings(db, skip=skip, limit=limit, status_filter=status_filter)


@router.get(
    "/{booking_id}",
    response_model=BookingResponse,
    summary="Get a single booking (staff)",
)
def get_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return get_single_booking(db, booking_id)


@router.patch(
    "/{booking_id}/status",
    response_model=BookingResponse,
    summary="Update booking status (staff)",
)
def update_status(
    booking_id: int,
    body: BookingStatusUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return change_booking_status(db, booking_id, body)


@router.delete(
    "/{booking_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a booking (staff)",
)
def delete_booking_endpoint(
    booking_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    remove_booking(db, booking_id)
