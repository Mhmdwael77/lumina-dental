"""
Key/value clinic settings — currently just the base consultation fee.
"""

from sqlalchemy.orm import Session

from core.database import Setting

CONSULTATION_FEE_KEY = "consultation_fee"
CONSULTATION_VALIDITY_KEY = "consultation_validity_days"
DEFAULT_CONSULTATION_VALIDITY_DAYS = 14


def get_setting(db: Session, key: str) -> str | None:
    row = db.query(Setting).filter(Setting.key == key).first()
    return row.value if row else None


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.query(Setting).filter(Setting.key == key).first()
    if row is None:
        row = Setting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()


def get_consultation_fee(db: Session) -> float:
    raw = get_setting(db, CONSULTATION_FEE_KEY)
    try:
        return float(raw) if raw is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def set_consultation_fee(db: Session, fee: float) -> float:
    fee = max(0.0, float(fee))
    set_setting(db, CONSULTATION_FEE_KEY, str(fee))
    return fee


def get_consultation_validity_days(db: Session) -> int:
    raw = get_setting(db, CONSULTATION_VALIDITY_KEY)
    try:
        return int(raw) if raw is not None else DEFAULT_CONSULTATION_VALIDITY_DAYS
    except (TypeError, ValueError):
        return DEFAULT_CONSULTATION_VALIDITY_DAYS


def set_consultation_validity_days(db: Session, days: int) -> int:
    days = max(1, int(days))
    set_setting(db, CONSULTATION_VALIDITY_KEY, str(days))
    return days
