"""
WhatsApp reminder dispatch.

Detects bookings whose estimated turn is approaching, computes their
*current* queue position (not just their original queue number — patients
ahead who've already been served or cancelled don't count), and sends a
one-time WhatsApp reminder through `whatsapp_service`.

This module only computes eligibility and message content; nothing here
talks to the network directly except via `whatsapp_service.send_whatsapp_message`,
which is a no-op until real credentials are configured.

There's no scheduler wired into this project (no Celery/APScheduler in
requirements.txt). `dispatch_due_reminders` is meant to be invoked by an
external cron (or a hosting platform's scheduled job) hitting the
staff-protected `POST /bookings/reminders/dispatch` endpoint every few
minutes — this keeps the architecture ready for a real scheduler without
adding one preemptively.
"""

from datetime import date, datetime
from sqlalchemy.orm import Session

from core.crud.booking import get_bookings_for_date, count_patients_ahead, get_currently_serving
from core.database import Booking, BookingStatus, ReminderStatus
from core.config import settings
from services.whatsapp_service import send_whatsapp_message


def _build_message(booking: Booking, patients_ahead: int, currently_serving: int | None) -> str:
    serving_line = (
        f"#{currently_serving} is currently being served." if currently_serving is not None
        else "The queue is about to start."
    )
    return (
        "Your dental clinic appointment is approaching.\n\n"
        f"Your queue number: #{booking.queue_number}\n\n"
        f"Current queue:\n{serving_line}\n\n"
        f"Patients ahead of you:\n{patients_ahead}\n\n"
        "Please start preparing to arrive at the clinic."
    )


def dispatch_due_reminders(db: Session, today: date | None = None) -> dict:
    """Scan today's still-waiting bookings and send reminders to anyone whose
    estimated wait has dropped to REMINDER_LEAD_MINUTES or below. Returns a
    summary so the caller (endpoint / cron log) can report what happened."""
    today = today or date.today()
    now = datetime.now()
    date_str = today.isoformat()

    sent, skipped, failed = 0, 0, 0

    for booking in get_bookings_for_date(db, date_str):
        if booking.status not in (BookingStatus.PENDING, BookingStatus.CONFIRMED):
            continue
        if booking.reminder_status == ReminderStatus.SENT:
            skipped += 1
            continue
        if booking.patient_arrived:
            # Already at the clinic — no reminder needed.
            booking.reminder_status = ReminderStatus.NOT_APPLICABLE
            db.commit()
            skipped += 1
            continue
        if booking.queue_number is None:
            continue

        patients_ahead = count_patients_ahead(db, date_str, booking.queue_number)
        minutes_until_turn = patients_ahead * settings.MIN_CONSULTATION_MINUTES

        if minutes_until_turn > settings.REMINDER_LEAD_MINUTES:
            continue

        serving = get_currently_serving(db, date_str)
        message = _build_message(booking, patients_ahead, serving.queue_number if serving else None)

        ok = send_whatsapp_message(booking.phone, message)
        booking.reminder_status = ReminderStatus.SENT if ok else ReminderStatus.FAILED
        booking.reminder_sent_at = now if ok else None
        db.commit()

        if ok:
            sent += 1
        else:
            failed += 1

    return {"date": date_str, "sent": sent, "skipped": skipped, "failed": failed}
