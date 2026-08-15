"""
SQLAlchemy engine, session factory, and declarative Base.
"""

from sqlalchemy import (
    create_engine,
    Column,
    Integer,
    String,
    DateTime,
    Text,
    Boolean,
    UniqueConstraint,
    Enum as SAEnum,
    inspect,
    text,
)
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime, timezone
import enum

from core.config import settings

# ── Engine ────────────────────────────────────────────────────────────────────
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Enums ─────────────────────────────────────────────────────────────────────
class BookingStatus(str, enum.Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    STAFF = "staff"


class PaymentMethod(str, enum.Enum):
    CLINIC = "clinic"
    ONLINE = "online"


class PaymentStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"


class ReminderStatus(str, enum.Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    NOT_APPLICABLE = "not_applicable"


# ── Models ────────────────────────────────────────────────────────────────────
class Booking(Base):
    __tablename__ = "bookings"
    # Note: only enforced by the DB on a freshly created table — SQLite can't
    # ALTER a table to add a composite UNIQUE constraint, so on an upgraded
    # existing database.db this is a no-op and uniqueness relies solely on
    # the retry-on-conflict assignment loop in core/crud/booking.py.
    __table_args__ = (
        UniqueConstraint("date", "queue_number", name="uq_booking_date_queue"),
    )

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    phone = Column(String(30), nullable=False)
    email = Column(String(120), nullable=True)
    treatment = Column(String(80), nullable=False)
    date = Column(String(20), nullable=False)          # e.g. "2026-08-20"
    time = Column(String(20), nullable=True)            # legacy exact-time note, no longer selected by patients
    message = Column(Text, nullable=True)
    status = Column(SAEnum(BookingStatus), default=BookingStatus.PENDING, nullable=False)

    # ── Queue-based booking ──────────────────────────────────────────────
    queue_number = Column(Integer, nullable=True)             # 1-based, unique per `date`
    estimated_arrival_start = Column(DateTime, nullable=True)
    estimated_arrival_end = Column(DateTime, nullable=True)
    patient_arrived = Column(Boolean, default=False, nullable=False)
    arrived_at = Column(DateTime, nullable=True)

    # ── Payment ───────────────────────────────────────────────────────────
    payment_method = Column(SAEnum(PaymentMethod), default=PaymentMethod.CLINIC, nullable=False)
    payment_status = Column(SAEnum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)

    # ── WhatsApp reminder ────────────────────────────────────────────────
    reminder_status = Column(SAEnum(ReminderStatus), default=ReminderStatus.PENDING, nullable=False)
    reminder_sent_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.STAFF, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Create tables ─────────────────────────────────────────────────────────────
def init_db() -> None:
    """Create all tables if they don't exist yet, and add any new columns
    to tables that already exist (lightweight migration — this project has
    no Alembic set up, so this keeps existing rows intact instead of
    requiring a dropped/recreated database.db)."""
    Base.metadata.create_all(bind=engine)
    _migrate_missing_columns()
    _seed_default_users()


def _seed_default_users() -> None:
    """Create the default admin/staff accounts on first run, matching the
    credentials already advertised on the admin login screen. Without this,
    login silently only worked through the frontend's offline-demo token
    fallback and never actually authenticated against the backend."""
    from core.security import hash_password

    db = SessionLocal()
    try:
        if db.query(User).count() > 0:
            return
        db.add_all([
            User(username="admin", hashed_password=hash_password("admin123"), role=UserRole.ADMIN),
            User(username="staff", hashed_password=hash_password("staff123"), role=UserRole.STAFF),
        ])
        db.commit()
    finally:
        db.close()


def _migrate_missing_columns() -> None:
    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()
    with engine.begin() as conn:
        for table in Base.metadata.tables.values():
            if table.name not in existing_tables:
                continue
            existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing_columns:
                    continue
                col_type = column.type.compile(dialect=engine.dialect)
                default_clause = ""
                if column.name == "patient_arrived":
                    default_clause = " DEFAULT 0"
                elif column.name == "payment_method":
                    default_clause = f" DEFAULT '{PaymentMethod.CLINIC.value}'"
                elif column.name == "payment_status":
                    default_clause = f" DEFAULT '{PaymentStatus.PENDING.value}'"
                elif column.name == "reminder_status":
                    default_clause = f" DEFAULT '{ReminderStatus.PENDING.value}'"
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_clause}')
                )
