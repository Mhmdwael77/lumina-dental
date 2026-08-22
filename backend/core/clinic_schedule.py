"""
Clinic working-days / working-hours configuration.

This is the backend source of truth for the doctor's default schedule — it
mirrors the values previously hard-coded in the frontend (`CLINIC.hours` /
`layout.tsx` JSON-LD) so the queue system, availability checks and the
"mark as entered" business rule all read from one place.

Individual branches can override this with their own working days/hours
(`Branch.working_hours`, set via Clinic Settings) — every function below
takes an optional `schedule` table; pass one built with
`branch_working_hours()` to check a specific branch instead of the default.

To change the clinic-wide default, edit WORKING_HOURS below (or wire this up
to a database-backed settings table later — the rest of the app only talks
to the helper functions in this module, not the raw dict).
"""

import json
from datetime import date, datetime, time

# Python's date.weekday(): Monday=0 ... Sunday=6
Schedule = dict[int, tuple[time, time] | None]

DAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# Clinic is open Saturday - Thursday, closed Friday (matches lib/constants.ts CLINIC.hours).
WORKING_HOURS: Schedule = {
    0: (time(10, 0), time(21, 0)),  # Monday
    1: (time(10, 0), time(21, 0)),  # Tuesday
    2: (time(10, 0), time(21, 0)),  # Wednesday
    3: (time(10, 0), time(21, 0)),  # Thursday
    4: None,                        # Friday - closed
    5: (time(10, 0), time(21, 0)),  # Saturday
    6: (time(10, 0), time(21, 0)),  # Sunday
}


def get_working_hours(d: date, schedule: Schedule | None = None) -> tuple[time, time] | None:
    """Return (open, close) for the given date's weekday, or None if closed.
    Pass a branch's own table (via `branch_working_hours()`) to check that
    branch specifically; omit it to check the clinic-wide default."""
    table = schedule if schedule is not None else WORKING_HOURS
    return table.get(d.weekday())


def is_working_day(d: date, schedule: Schedule | None = None) -> bool:
    return get_working_hours(d, schedule) is not None


def is_within_working_hours(dt: datetime, schedule: Schedule | None = None) -> bool:
    """True if `dt` falls within the open/close window for its own day."""
    hours = get_working_hours(dt.date(), schedule)
    if hours is None:
        return False
    opens, closes = hours
    return opens <= dt.time() <= closes


def hours_by_day_json(schedule: Schedule | None = None) -> dict[str, dict[str, str] | None]:
    """The wire shape used by ClinicScheduleResponse.hours_by_day / a
    branch's stored `working_hours` column: day name -> {opens, closes} | None."""
    table = schedule if schedule is not None else WORKING_HOURS
    return {
        DAY_NAMES[weekday]: (
            {"opens": hours[0].strftime("%H:%M"), "closes": hours[1].strftime("%H:%M")} if hours else None
        )
        for weekday, hours in table.items()
    }


def parse_working_hours_json(raw: str | None) -> Schedule | None:
    """Parse a branch's stored `working_hours` JSON (day-name keys) back into
    the weekday-indexed table the functions above use. Returns None if unset
    or malformed, meaning "no override — use the clinic-wide default"."""
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return None
    schedule: Schedule = {}
    for weekday, name in enumerate(DAY_NAMES):
        entry = data.get(name)
        if not entry:
            schedule[weekday] = None
            continue
        try:
            schedule[weekday] = (
                datetime.strptime(entry["opens"], "%H:%M").time(),
                datetime.strptime(entry["closes"], "%H:%M").time(),
            )
        except (KeyError, ValueError, TypeError):
            schedule[weekday] = None
    return schedule


def branch_working_hours(branch) -> Schedule:
    """A branch's own working-hours table, or the clinic-wide default if it
    hasn't configured one yet. Accepts None (no branch selected) too."""
    parsed = parse_working_hours_json(getattr(branch, "working_hours", None)) if branch else None
    return parsed if parsed is not None else WORKING_HOURS
