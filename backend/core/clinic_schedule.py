"""
Clinic working-days / working-hours configuration.

This is the backend source of truth for the doctor's schedule — it mirrors
the values previously hard-coded in the frontend (`CLINIC.hours` /
`layout.tsx` JSON-LD) so the queue system, availability checks and the
"mark as entered" business rule all read from one place.

To change the clinic's schedule, edit WORKING_HOURS below (or wire this up
to a database-backed settings table later — the rest of the app only talks
to the helper functions in this module, not the raw dict).
"""

from datetime import date, datetime, time

# Python's date.weekday(): Monday=0 ... Sunday=6
# Clinic is open Saturday - Thursday, closed Friday (matches lib/constants.ts CLINIC.hours).
WORKING_HOURS: dict[int, tuple[time, time] | None] = {
    0: (time(10, 0), time(21, 0)),  # Monday
    1: (time(10, 0), time(21, 0)),  # Tuesday
    2: (time(10, 0), time(21, 0)),  # Wednesday
    3: (time(10, 0), time(21, 0)),  # Thursday
    4: None,                        # Friday - closed
    5: (time(10, 0), time(21, 0)),  # Saturday
    6: (time(10, 0), time(21, 0)),  # Sunday
}


def get_working_hours(d: date) -> tuple[time, time] | None:
    """Return (open, close) for the given date's weekday, or None if closed."""
    return WORKING_HOURS.get(d.weekday())


def is_working_day(d: date) -> bool:
    return get_working_hours(d) is not None


def is_within_working_hours(dt: datetime) -> bool:
    """True if `dt` falls within the clinic's open/close window for its own day."""
    hours = get_working_hours(dt.date())
    if hours is None:
        return False
    opens, closes = hours
    return opens <= dt.time() <= closes
