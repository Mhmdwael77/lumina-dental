"""
Financial dashboard logic.

Every figure is derived from real records — never hard-coded:
  • Revenue  = paid extra charges on non-cancelled bookings (attributed to the
               booking's date). This is the clinic's billing mechanism.
  • Pending  = extra charges that are entered but not yet marked paid.
  • Expenses = rows in the `expenses` table.
  • Net profit = revenue − expenses.
"""

import math
import re
from datetime import date, timedelta
from sqlalchemy.orm import Session

from core.crud.setting import get_consultation_fee
from core.database import Booking, BookingStatus, PaymentStatus, Expense

CURRENCY = "EGP"
MAX_BUCKETS = 30
MAX_TRANSACTIONS = 25


def _digits(phone: str | None) -> str:
    return re.sub(r"\D", "", phone or "")


def _base_fee(b: Booking, default_fee: float) -> float:
    """The visit's base fee. Bookings made before a fee was ever set have no
    snapshot (NULL) — those fall back to the current clinic fee so every visit
    is priced, not just the ones booked after the fee existed."""
    return float(b.consultation_fee) if b.consultation_fee is not None else float(default_fee)


def _fee_collected(b: Booking, default_fee: float) -> float:
    """The base visit fee becomes revenue once the visit is completed — or was
    already paid up-front online. This is the "finish the exam → money counts"
    behaviour."""
    if b.status == BookingStatus.CANCELLED:
        return 0.0
    if b.status == BookingStatus.COMPLETED or b.payment_status == PaymentStatus.PAID:
        return _base_fee(b, default_fee)
    return 0.0


def _fee_pending(b: Booking, default_fee: float) -> float:
    """Base fee for an upcoming visit that hasn't been collected yet."""
    if b.status in (BookingStatus.PENDING, BookingStatus.CONFIRMED) and b.payment_status != PaymentStatus.PAID:
        return _base_fee(b, default_fee)
    return 0.0


def _extra_collected(b: Booking) -> float:
    if b.status == BookingStatus.CANCELLED:
        return 0.0
    if b.extra_charge_paid and b.extra_charge_amount:
        return float(b.extra_charge_amount)
    return 0.0


def _extra_pending(b: Booking) -> float:
    if b.status == BookingStatus.CANCELLED:
        return 0.0
    if b.extra_charge_amount and not b.extra_charge_paid:
        return float(b.extra_charge_amount)
    return 0.0


def _revenue_of(b: Booking, default_fee: float) -> float:
    """Collected revenue = completed visit fee + paid extra charges."""
    return _fee_collected(b, default_fee) + _extra_collected(b)


def _pending_of(b: Booking, default_fee: float) -> float:
    """Money billed but not yet collected = upcoming visit fee + unpaid extras."""
    return _fee_pending(b, default_fee) + _extra_pending(b)


def _in_range(d: str, start: str, end: str) -> bool:
    # Zero-padded ISO date strings compare correctly lexicographically.
    return start <= d <= end


def _round(x: float) -> float:
    return round(x + 0.0, 2)


def _iso(d: date) -> str:
    return d.isoformat()


def get_financial_summary(db: Session, start: str, end: str) -> dict:
    bookings: list[Booking] = db.query(Booking).all()
    expenses: list[Expense] = db.query(Expense).all()
    # Fee used for bookings that never captured a snapshot (booked before a fee
    # was set) — so every completed visit is priced, not just recent ones.
    default_fee = get_consultation_fee(db)

    today = date.today()
    today_s = _iso(today)
    # Full current week (Mon–Sun) and full current month, so the KPI cards match
    # the "This Week"/"This Month" range views — and a booking dated later in the
    # same period (e.g. a visit booked for a coming day) still counts.
    week_start_s = _iso(today - timedelta(days=today.weekday()))       # Monday
    week_end_s = _iso(today - timedelta(days=today.weekday()) + timedelta(days=6))  # Sunday
    month_start = today.replace(day=1)
    month_start_s = _iso(month_start)
    month_end_s = _iso((month_start.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1))

    # ── All-time / fixed-period KPIs ──────────────────────────────────────────
    total_revenue = 0.0
    today_revenue = week_revenue = month_revenue = 0.0
    pending_payments = 0.0
    cancelled_all = 0
    today_appointments = 0
    today_phones: set[str] = set()
    revenue_phones: set[str] = set()  # patients who generated revenue (ARPU base)

    for b in bookings:
        rev = _revenue_of(b, default_fee)
        total_revenue += rev
        pending_payments += _pending_of(b, default_fee)
        if b.status == BookingStatus.CANCELLED:
            cancelled_all += 1
        else:
            if b.date == today_s:
                today_appointments += 1
                if b.phone:
                    today_phones.add(_digits(b.phone))
        if rev > 0 and b.phone:
            revenue_phones.add(_digits(b.phone))
        if b.date == today_s:
            today_revenue += rev
        if week_start_s <= b.date <= week_end_s:
            week_revenue += rev
        if month_start_s <= b.date <= month_end_s:
            month_revenue += rev

    total_expenses = sum(float(e.amount) for e in expenses)
    net_profit = total_revenue - total_expenses
    avg_per_patient = total_revenue / len(revenue_phones) if revenue_phones else 0.0

    kpis = {
        "today_patients": len(today_phones),
        "today_appointments": today_appointments,
        "today_revenue": _round(today_revenue),
        "week_revenue": _round(week_revenue),
        "month_revenue": _round(month_revenue),
        "total_revenue": _round(total_revenue),
        "pending_payments": _round(pending_payments),
        "total_expenses": _round(total_expenses),
        "net_profit": _round(net_profit),
        "avg_revenue_per_patient": _round(avg_per_patient),
        "cancelled_appointments": cancelled_all,
    }

    # ── Range-scoped aggregation ──────────────────────────────────────────────
    rev_by_day: dict[str, float] = {}
    exp_by_day: dict[str, float] = {}
    appt_by_day: dict[str, int] = {}
    patients_by_day: dict[str, set] = {}

    range_revenue = range_pending = 0.0
    range_appointments = range_cancelled = 0
    range_phones: set[str] = set()
    category_totals: dict[str, float] = {}
    transactions: list[dict] = []

    for b in bookings:
        if not _in_range(b.date, start, end):
            continue
        rev = _revenue_of(b, default_fee)
        pend = _pending_of(b, default_fee)
        range_revenue += rev
        range_pending += pend
        if rev:
            rev_by_day[b.date] = rev_by_day.get(b.date, 0.0) + rev
        if b.status == BookingStatus.CANCELLED:
            range_cancelled += 1
        else:
            range_appointments += 1
            appt_by_day[b.date] = appt_by_day.get(b.date, 0) + 1
            phone_key = _digits(b.phone)
            patients_by_day.setdefault(b.date, set()).add(phone_key)
            range_phones.add(phone_key)
        # The base visit fee is a revenue line (paid once completed, else pending)
        if b.status != BookingStatus.CANCELLED and _base_fee(b, default_fee) > 0:
            transactions.append({
                "id": f"fee-{b.id}",
                "kind": "revenue",
                "date": b.date,
                "title": b.full_name,
                "subtitle": b.treatment,
                "amount": _round(_base_fee(b, default_fee)),
                "status": "paid" if _fee_collected(b, default_fee) > 0 else "pending",
            })
        # An extra charge is its own revenue line (paid or pending)
        if b.extra_charge_amount and b.status != BookingStatus.CANCELLED:
            transactions.append({
                "id": f"extra-{b.id}",
                "kind": "revenue",
                "date": b.date,
                "title": b.full_name,
                "subtitle": b.extra_charge_description or b.treatment,
                "amount": _round(float(b.extra_charge_amount)),
                "status": "paid" if b.extra_charge_paid else "pending",
            })

    range_expenses = 0.0
    for e in expenses:
        if not _in_range(e.date, start, end):
            continue
        amt = float(e.amount)
        range_expenses += amt
        exp_by_day[e.date] = exp_by_day.get(e.date, 0.0) + amt
        category_totals[e.category] = category_totals.get(e.category, 0.0) + amt
        transactions.append({
            "id": f"exp-{e.id}",
            "kind": "expense",
            "date": e.date,
            "title": e.name,
            "subtitle": e.category,
            "amount": _round(-amt),
            "status": "paid",
        })

    # ── Adaptive time buckets (≤ MAX_BUCKETS bars, whatever the range) ─────────
    try:
        start_d = date.fromisoformat(start)
        end_d = date.fromisoformat(end)
    except ValueError:
        start_d = end_d = today
    if end_d < start_d:
        start_d, end_d = end_d, start_d
    total_days = (end_d - start_d).days + 1
    bucket_days = max(1, math.ceil(total_days / MAX_BUCKETS))

    revenue_series: list[dict] = []
    appointments_series: list[dict] = []
    cursor = start_d
    while cursor <= end_d:
        b_end = min(cursor + timedelta(days=bucket_days - 1), end_d)
        label = _iso(cursor)
        rev = exp = 0.0
        appts = 0
        phones: set[str] = set()
        day = cursor
        while day <= b_end:
            ds = _iso(day)
            rev += rev_by_day.get(ds, 0.0)
            exp += exp_by_day.get(ds, 0.0)
            appts += appt_by_day.get(ds, 0)
            phones |= patients_by_day.get(ds, set())
            day += timedelta(days=1)
        revenue_series.append({"label": label, "revenue": _round(rev), "expenses": _round(exp)})
        appointments_series.append({"label": label, "appointments": appts, "patients": len(phones)})
        cursor = b_end + timedelta(days=1)

    expenses_by_category = sorted(
        ({"category": c, "amount": _round(a)} for c, a in category_totals.items()),
        key=lambda x: x["amount"],
        reverse=True,
    )

    transactions.sort(key=lambda x: (x["date"], x["id"]), reverse=True)

    return {
        "currency": CURRENCY,
        "kpis": kpis,
        "range": {
            "start": start,
            "end": end,
            "revenue": _round(range_revenue),
            "expenses": _round(range_expenses),
            "net_profit": _round(range_revenue - range_expenses),
            "pending": _round(range_pending),
            "appointments": range_appointments,
            "patients": len(range_phones),
            "cancelled": range_cancelled,
        },
        "revenue_series": revenue_series,
        "appointments_series": appointments_series,
        "payments_breakdown": {"paid": _round(range_revenue), "pending": _round(range_pending)},
        "expenses_by_category": expenses_by_category,
        "recent_transactions": transactions[:MAX_TRANSACTIONS],
    }
