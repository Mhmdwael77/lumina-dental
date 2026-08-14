"""
Booking business logic – validation, creation, status transitions.
"""

from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from datetime import date

from core.crud.booking import (
    create_booking as crud_create,
    get_booking as crud_get,
    get_all_bookings as crud_all,
    update_booking_status as crud_update_status,
    delete_booking as crud_delete,
)
from core.database import BookingStatus
from schemas.booking import BookingCreate, BookingStatusUpdate

# Treatments must match the frontend constants
VALID_TREATMENTS = {
    "Cosmetic Dentistry",
    "Dental Implants",
    "Teeth Whitening",
    "Orthodontics",
    "General Dentistry",
    "Pediatric Dentistry",
}


def validate_and_create_booking(db: Session, data: BookingCreate):
    """Validate business rules then persist a new booking."""
    # Treatment must be recognised
    if data.treatment not in VALID_TREATMENTS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unknown treatment '{data.treatment}'. Choose from: {', '.join(sorted(VALID_TREATMENTS))}",
        )

    # Date must be today or in the future
    try:
        booking_date = date.fromisoformat(data.date)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date must be in YYYY-MM-DD format.",
        )
    if booking_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Booking date cannot be in the past.",
        )

    return crud_create(
        db,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        treatment=data.treatment,
        date=data.date,
        time=data.time,
        message=data.message,
    )


def change_booking_status(db: Session, booking_id: int, update: BookingStatusUpdate):
    booking = crud_update_status(db, booking_id, BookingStatus(update.status.value))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def remove_booking(db: Session, booking_id: int):
    if not crud_delete(db, booking_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return True


def list_bookings(db: Session, skip: int = 0, limit: int = 50, status_filter: str | None = None):
    bs = BookingStatus(status_filter) if status_filter else None
    return crud_all(db, skip=skip, limit=limit, status=bs)


def get_single_booking(db: Session, booking_id: int):
    booking = crud_get(db, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking
