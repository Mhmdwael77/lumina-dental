"""
Database query helpers for bookings.
"""

from sqlalchemy.orm import Session
from core.database import Booking, BookingStatus


def create_booking(db: Session, **kwargs) -> Booking:
    booking = Booking(**kwargs)
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking


def get_booking(db: Session, booking_id: int) -> Booking | None:
    return db.query(Booking).filter(Booking.id == booking_id).first()


def get_all_bookings(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    status: BookingStatus | None = None,
) -> list[Booking]:
    q = db.query(Booking)
    if status is not None:
        q = q.filter(Booking.status == status)
    return q.order_by(Booking.created_at.desc()).offset(skip).limit(limit).all()


def update_booking_status(db: Session, booking_id: int, new_status: BookingStatus) -> Booking | None:
    booking = get_booking(db, booking_id)
    if booking is None:
        return None
    booking.status = new_status
    db.commit()
    db.refresh(booking)
    return booking


def delete_booking(db: Session, booking_id: int) -> bool:
    booking = get_booking(db, booking_id)
    if booking is None:
        return False
    db.delete(booking)
    db.commit()
    return True
