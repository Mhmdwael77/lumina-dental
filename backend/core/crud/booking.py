"""
Database query helpers for bookings.
"""

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import datetime

from core.database import Booking, BookingStatus


# A booking counts against the day's queue total unless it was cancelled —
# this is what "Patients already booked: N" and the assigned queue_number
# are based on, so numbers never get reused within a day.
ACTIVE_STATUSES = (BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED)

# A booking still occupies a place *ahead* of others only while it hasn't
# been completed (served) or cancelled (no-show/skip) yet.
STILL_WAITING_STATUSES = (BookingStatus.PENDING, BookingStatus.CONFIRMED)

MAX_QUEUE_ASSIGN_ATTEMPTS = 8


def count_active_bookings_for_date(db: Session, date: str) -> int:
    return (
        db.query(func.count(Booking.id))
        .filter(Booking.date == date, Booking.status.in_(ACTIVE_STATUSES))
        .scalar()
        or 0
    )


def count_patients_ahead(db: Session, date: str, queue_number: int) -> int:
    """How many bookings before `queue_number` on `date` still haven't been
    served or cancelled — i.e. actually still ahead in line right now."""
    return (
        db.query(func.count(Booking.id))
        .filter(
            Booking.date == date,
            Booking.queue_number < queue_number,
            Booking.status.in_(STILL_WAITING_STATUSES),
        )
        .scalar()
        or 0
    )


def get_currently_serving(db: Session, date: str) -> Booking | None:
    """The lowest-queue-number booking that has arrived and not yet been
    completed or cancelled — i.e. whoever is in the chair right now."""
    return (
        db.query(Booking)
        .filter(
            Booking.date == date,
            Booking.status.in_(STILL_WAITING_STATUSES),
            Booking.patient_arrived.is_(True),
        )
        .order_by(Booking.queue_number.asc())
        .first()
    )


def create_booking_with_queue_number(db: Session, estimate_fn, **kwargs) -> Booking:
    """Assign the next queue number for `date` and persist the booking.

    Two patients booking at the same moment could both read the same
    "current max" queue number before either commits. We guard against that
    with a retry-on-conflict loop backed by the DB-level unique constraint
    on (date, queue_number) — whichever request commits first wins that
    number, the loser recomputes the next number and retries.

    `estimate_fn(patients_ahead) -> (start, end)` is recomputed on every
    attempt so the stored estimate always matches the queue number that
    actually ends up persisted, even if a race forced a retry.
    """
    date = kwargs["date"]
    last_error: Exception | None = None

    for _ in range(MAX_QUEUE_ASSIGN_ATTEMPTS):
        patients_ahead = count_active_bookings_for_date(db, date)
        next_number = patients_ahead + 1
        estimated_start, estimated_end = estimate_fn(patients_ahead)
        booking = Booking(
            **kwargs,
            queue_number=next_number,
            estimated_arrival_start=estimated_start,
            estimated_arrival_end=estimated_end,
        )
        db.add(booking)
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            last_error = exc
            continue
        db.refresh(booking)
        return booking

    raise RuntimeError("Could not assign a unique queue number after several attempts") from last_error


def get_booking(db: Session, booking_id: int) -> Booking | None:
    return db.query(Booking).filter(Booking.id == booking_id).first()


def get_all_bookings(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    status: BookingStatus | None = None,
    date: str | None = None,
) -> list[Booking]:
    q = db.query(Booking)
    if status is not None:
        q = q.filter(Booking.status == status)
    if date is not None:
        q = q.filter(Booking.date == date)
    return q.order_by(Booking.date.asc(), Booking.queue_number.asc()).offset(skip).limit(limit).all()


def get_bookings_for_date(db: Session, date: str) -> list[Booking]:
    return (
        db.query(Booking)
        .filter(Booking.date == date, Booking.status.in_(ACTIVE_STATUSES))
        .order_by(Booking.queue_number.asc())
        .all()
    )


def update_booking_status(db: Session, booking_id: int, new_status: BookingStatus) -> Booking | None:
    booking = get_booking(db, booking_id)
    if booking is None:
        return None
    booking.status = new_status
    db.commit()
    db.refresh(booking)
    return booking


def set_arrival(db: Session, booking_id: int, arrived: bool) -> Booking | None:
    booking = get_booking(db, booking_id)
    if booking is None:
        return None
    booking.patient_arrived = arrived
    booking.arrived_at = datetime.utcnow() if arrived else None
    db.commit()
    db.refresh(booking)
    return booking


def set_payment_paid(db: Session, booking_id: int) -> Booking | None:
    from core.database import PaymentStatus

    booking = get_booking(db, booking_id)
    if booking is None:
        return None
    booking.payment_status = PaymentStatus.PAID
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
