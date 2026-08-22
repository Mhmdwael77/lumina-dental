"""
Booking business logic – validation, queue assignment, arrival & payment
state transitions.

All queue numbers, waiting-time estimates, payment state and arrival state
are computed/validated here on the backend — the frontend only ever
displays what these functions return.
"""

from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from core.crud.booking import (
    create_booking_with_queue_number,
    find_active_booking_for_phone,
    count_active_bookings_for_date,
    count_patients_ahead,
    get_currently_serving,
    get_booking as crud_get,
    get_all_bookings as crud_all,
    get_bookings_for_date,
    update_booking_status as crud_update_status,
    set_arrival as crud_set_arrival,
    set_consultation_hint_dismissed as crud_set_hint,
    set_payment_paid as crud_set_payment_paid,
    set_extra_charge as crud_set_extra_charge,
    set_medical_record as crud_set_medical_record,
    get_bookings_by_phone as crud_get_by_phone,
    delete_booking as crud_delete,
)
from core.crud.setting import get_consultation_fee
from core.crud.branch import get_branch
from core.database import Booking, BookingStatus, PaymentMethod, PaymentStatus, ServiceType, User
from core.clinic_schedule import get_working_hours, is_working_day, is_within_working_hours, branch_working_hours
from core.config import settings
from schemas.booking import BookingCreate, BookingStatusUpdate, ExtraChargeUpdate, MedicalRecordUpdate, ServiceTypeEnum

# Treatments must match the frontend constants
VALID_TREATMENTS = {
    "Cosmetic Dentistry",
    "Dental Implants",
    "Teeth Whitening",
    "Orthodontics",
    "General Dentistry",
    "Pediatric Dentistry",
}

# The `treatment` label stored for consultation bookings (they reuse the same
# form and queue system — the service type is what distinguishes them).
CONSULTATION_LABEL = "Consultation"

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _parse_date(raw: str) -> date:
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Date must be in YYYY-MM-DD format.",
        )


def _estimate_window(booking_date: date, patients_ahead: int, now: datetime | None = None, schedule=None):
    """(start, end) estimate for reaching the front of the queue.

    Baselines off clinic opening time, except for same-day bookings made
    after opening — those baseline off "now" so the estimate reflects
    today's actual queue progress instead of a time that's already passed.

    `schedule` scopes this to one branch's working hours (see
    core/clinic_schedule.py's branch_working_hours()); omit it for the
    clinic-wide default.
    """
    hours = get_working_hours(booking_date, schedule)
    if hours is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The clinic is closed on {WEEKDAY_NAMES[booking_date.weekday()]}s. Please choose a working day.",
        )
    opens, _closes = hours
    open_dt = datetime.combine(booking_date, opens)
    baseline = open_dt
    if now is not None and booking_date == now.date() and now > open_dt:
        baseline = now
    start = baseline + timedelta(minutes=patients_ahead * settings.MIN_CONSULTATION_MINUTES)
    end = baseline + timedelta(minutes=patients_ahead * settings.MAX_CONSULTATION_MINUTES)
    return start, end


def get_availability(db: Session, date_str: str, branch_id: int | None = None):
    booking_date = _parse_date(date_str)
    schedule = branch_working_hours(get_branch(db, branch_id)) if branch_id is not None else None
    hours = get_working_hours(booking_date, schedule)
    today = date.today()

    if hours is None:
        return {
            "date": date_str,
            "is_working_day": False,
            "opens": None,
            "closes": None,
            "patients_booked": 0,
            "next_queue_number": None,
            "reason": f"The clinic is closed on {WEEKDAY_NAMES[booking_date.weekday()]}s.",
        }

    if booking_date < today:
        return {
            "date": date_str,
            "is_working_day": True,
            "opens": hours[0].strftime("%H:%M"),
            "closes": hours[1].strftime("%H:%M"),
            "patients_booked": 0,
            "next_queue_number": None,
            "reason": "This date is in the past.",
        }

    if (booking_date - today).days > settings.BOOKING_WINDOW_DAYS:
        return {
            "date": date_str,
            "is_working_day": True,
            "opens": hours[0].strftime("%H:%M"),
            "closes": hours[1].strftime("%H:%M"),
            "patients_booked": 0,
            "next_queue_number": None,
            "reason": f"Bookings can only be made up to {settings.BOOKING_WINDOW_DAYS} days in advance.",
        }

    patients_booked = count_active_bookings_for_date(db, date_str)
    return {
        "date": date_str,
        "is_working_day": True,
        "opens": hours[0].strftime("%H:%M"),
        "closes": hours[1].strftime("%H:%M"),
        "patients_booked": patients_booked,
        "next_queue_number": patients_booked + 1,
        "reason": None,
    }


def validate_and_create_booking(db: Session, data: BookingCreate) -> Booking:
    """Validate business rules then persist a new booking with a
    backend-assigned, per-day-unique queue number."""
    # One active booking per patient (matched by phone): block a new booking
    # while this phone still has a pending/confirmed one — this is what stops a
    # patient going back to the home page and booking over and over. Completed
    # or cancelled bookings don't count, so they can book again afterwards.
    existing = find_active_booking_for_phone(db, data.phone)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This phone number already has an active booking "
                f"(queue #{existing.queue_number} on {existing.date}). "
                f"You can only have one active booking at a time — please wait "
                f"until it's completed, or cancel it, before booking again."
            ),
        )

    # A consultation reuses the whole booking flow — only its service type and
    # its stored `treatment` label differ. For treatment appointments we keep
    # enforcing the existing allow-list unchanged.
    is_consultation = data.service_type == ServiceTypeEnum.CONSULTATION
    if is_consultation:
        treatment_value = CONSULTATION_LABEL
        service_type = ServiceType.CONSULTATION
    else:
        if data.treatment not in VALID_TREATMENTS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown treatment '{data.treatment}'. Choose from: {', '.join(sorted(VALID_TREATMENTS))}",
            )
        treatment_value = data.treatment
        service_type = ServiceType.TREATMENT

    # A branch picked at booking time is stamped straight onto the booking —
    # its own working days/hours (if it's set any) gate which dates can be
    # picked, and its exam fee (or, for a consultation, its consultation
    # price) replaces the clinic-wide default whenever the branch has one set.
    branch = None
    if data.branch_id is not None:
        branch = get_branch(db, data.branch_id)
        if branch is None or not branch.is_active:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Selected branch was not found or is no longer active.",
            )
    schedule = branch_working_hours(branch)

    booking_date = _parse_date(data.date)
    today = date.today()

    if booking_date < today:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Booking date cannot be in the past.",
        )

    if not is_working_day(booking_date, schedule):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The clinic is closed on {WEEKDAY_NAMES[booking_date.weekday()]}s. Please choose a working day.",
        )

    if (booking_date - today).days > settings.BOOKING_WINDOW_DAYS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Bookings can only be made up to {settings.BOOKING_WINDOW_DAYS} days in advance.",
        )

    # Best-effort capacity check (soft — the authoritative uniqueness
    # guarantee is the retry loop + DB constraint in the CRUD layer).
    hours = get_working_hours(booking_date, schedule)
    close_dt = datetime.combine(booking_date, hours[1])
    now = datetime.now()
    projected_ahead = count_active_bookings_for_date(db, data.date)
    projected_start, _ = _estimate_window(booking_date, projected_ahead, now, schedule)
    if projected_start >= close_dt:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{data.date} is fully booked for the day. Please choose another date.",
        )

    def estimate_fn(patients_ahead: int):
        return _estimate_window(booking_date, patients_ahead, now, schedule)

    fee = get_consultation_fee(db)
    if branch is not None:
        branch_fee = branch.consultation_price if is_consultation else branch.consultation_fee
        if branch_fee is not None:
            fee = branch_fee

    return create_booking_with_queue_number(
        db,
        estimate_fn,
        full_name=data.full_name,
        phone=data.phone,
        email=data.email,
        treatment=treatment_value,
        service_type=service_type,
        date=data.date,
        time=None,
        message=data.message,
        consultation_fee=fee,
        branch_id=data.branch_id,
        payment_method=PaymentMethod(data.payment_method.value),
        payment_status=PaymentStatus.PENDING,
    )


def booking_to_public_response(db: Session, booking: Booking) -> dict:
    patients_ahead = count_patients_ahead(db, booking.date, booking.queue_number)
    return {
        "id": booking.id,
        "full_name": booking.full_name,
        "treatment": booking.treatment,
        "service_type": booking.service_type,
        "date": booking.date,
        "status": booking.status,
        "queue_number": booking.queue_number,
        "patients_ahead": patients_ahead,
        "estimated_arrival_start": booking.estimated_arrival_start,
        "estimated_arrival_end": booking.estimated_arrival_end,
        "consultation_fee": booking.consultation_fee,
        "branch_name": booking.branch_name,
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
    }


def get_queue_status(db: Session, booking_id: int) -> dict:
    booking = crud_get(db, booking_id)
    if booking is None or booking.queue_number is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    patients_ahead = count_patients_ahead(db, booking.date, booking.queue_number)
    serving = get_currently_serving(db, booking.date)

    return {
        "id": booking.id,
        "date": booking.date,
        "queue_number": booking.queue_number,
        "status": booking.status,
        "patient_arrived": booking.patient_arrived,
        "patients_ahead": patients_ahead,
        "currently_serving": serving.queue_number if serving else None,
        "estimated_arrival_start": booking.estimated_arrival_start,
        "estimated_arrival_end": booking.estimated_arrival_end,
        "payment_method": booking.payment_method,
        "payment_status": booking.payment_status,
    }


def confirm_online_payment(db: Session, booking_id: int, phone: str) -> Booking:
    booking = crud_get(db, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    if booking.payment_method != PaymentMethod.ONLINE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This booking was not set up for online payment.",
        )
    if booking.phone != phone:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Phone number does not match this booking.")
    if booking.payment_status == PaymentStatus.PAID:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Payment has already been confirmed for this booking.")

    # ── Simulated payment gateway ────────────────────────────────────────
    # No real payment provider is configured for this project. In
    # production this branch would be replaced by verifying a signed
    # webhook/callback from the actual gateway (Stripe, Paymob, etc.)
    # instead of trusting the client's request directly.
    updated = crud_set_payment_paid(db, booking_id)
    return updated


def _stamp_audit(db: Session, booking: Booking, current_user: User) -> Booking:
    """Record who last touched this booking and, if no branch has claimed it
    yet, which branch handled the patient (see core/database.py Booking)."""
    booking.updated_by = current_user.username
    if booking.branch_id is None and current_user.branch_id is not None:
        booking.branch_id = current_user.branch_id
    db.commit()
    db.refresh(booking)
    return booking


def mark_arrival(db: Session, booking_id: int, arrived: bool, current_user: User) -> Booking:
    booking = crud_get(db, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if arrived:
        booking_date = _parse_date(booking.date)
        today = date.today()
        if booking_date != today:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A patient can only be marked as entered on the day of their booking.",
            )
        now = datetime.now()
        if not is_within_working_hours(now, branch_working_hours(booking.branch)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A patient can only be marked as entered during the clinic's working hours.",
            )
        if booking.status == BookingStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This booking was cancelled and cannot be marked as entered.",
            )

    booking = crud_set_arrival(db, booking_id, arrived)
    return _stamp_audit(db, booking, current_user)


def set_consultation_hint(db: Session, booking_id: int, dismissed: bool, current_user: User) -> Booking:
    booking = crud_set_hint(db, booking_id, dismissed)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return _stamp_audit(db, booking, current_user)


def change_booking_status(db: Session, booking_id: int, update: BookingStatusUpdate, current_user: User):
    booking = crud_update_status(db, booking_id, BookingStatus(update.status.value))
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return _stamp_audit(db, booking, current_user)


def set_extra_charge(db: Session, booking_id: int, update: ExtraChargeUpdate, current_user: User) -> Booking:
    booking = crud_set_extra_charge(db, booking_id, update.amount, update.description, update.paid)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return _stamp_audit(db, booking, current_user)


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def set_medical_record(db: Session, booking_id: int, update: MedicalRecordUpdate, current_user: User) -> Booking:
    booking = crud_set_medical_record(
        db,
        booking_id,
        diagnosis=_clean(update.diagnosis),
        prescription=_clean(update.prescription),
        follow_up_needed=update.follow_up_needed,
        follow_up_notes=_clean(update.follow_up_notes),
        chronic_conditions=_clean(update.chronic_conditions),
        current_medications=_clean(update.current_medications),
    )
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return _stamp_audit(db, booking, current_user)


def remove_booking(db: Session, booking_id: int):
    if not crud_delete(db, booking_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return True


def list_bookings(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    status_filter: str | None = None,
    date: str | None = None,
    branch_id: int | None = None,
):
    bs = BookingStatus(status_filter) if status_filter else None
    return crud_all(db, skip=skip, limit=limit, status=bs, date=date, branch_id=branch_id)


def get_single_booking(db: Session, booking_id: int):
    booking = crud_get(db, booking_id)
    if booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return booking


def get_patient_bookings(db: Session, phone: str) -> list[Booking]:
    """A patient's full record, pulled by phone — the identity key, since
    patients have no account. Not paginated: unlike the staff list endpoint,
    this must never silently drop a patient's older visits."""
    return crud_get_by_phone(db, phone)
