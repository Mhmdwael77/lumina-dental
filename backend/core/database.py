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
    Float,
    ForeignKey,
    UniqueConstraint,
    Enum as SAEnum,
    inspect,
    text,
)
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
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


class ServiceType(str, enum.Enum):
    """What kind of appointment this booking is. `TREATMENT` is the default
    (any of the clinic's treatments); `CONSULTATION` is a request to see the
    dentist for advice/assessment, shown separately in the admin dashboard."""
    TREATMENT = "treatment"
    CONSULTATION = "consultation"


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
    # Queue numbers are scoped per branch (each branch runs its own queue for
    # the day), so the uniqueness constraint has to include branch_id too —
    # otherwise two different branches' "first booking of the day" would both
    # claim queue_number=1 and collide. See _migrate_booking_queue_constraint()
    # for how an existing database.db gets upgraded to this (SQLite can't
    # ALTER a table to change a composite UNIQUE constraint in place).
    __table_args__ = (
        UniqueConstraint("date", "branch_id", "queue_number", name="uq_booking_date_branch_queue"),
    )

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(120), nullable=False)
    phone = Column(String(30), nullable=False)
    email = Column(String(120), nullable=True)
    treatment = Column(String(80), nullable=False)
    # Distinguishes a consultation request from a normal treatment appointment.
    # Defaults to TREATMENT so every pre-existing booking stays a treatment.
    service_type = Column(SAEnum(ServiceType), default=ServiceType.TREATMENT, nullable=False)
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

    # Staff dismissed the "this patient also has a consultation" reminder that
    # is shown on a completed exam. Purely a UI hint — dismissing it never
    # touches the consultation booking itself.
    consultation_hint_dismissed = Column(Boolean, default=False, nullable=False)

    # ── Payment ───────────────────────────────────────────────────────────
    # Base visit fee quoted to the patient at booking time — a snapshot of the
    # clinic-wide consultation fee, so a later fee change never rewrites what an
    # existing patient was told to pay. NULL on bookings made before a fee was set.
    consultation_fee = Column(Float, nullable=True)
    payment_method = Column(SAEnum(PaymentMethod), default=PaymentMethod.CLINIC, nullable=False)
    payment_status = Column(SAEnum(PaymentStatus), default=PaymentStatus.PENDING, nullable=False)

    # Extra charge on top of the base appointment — e.g. the patient got a
    # crown/filling/add-on done during or after the exam. Staff-entered, so it
    # only ever exists once someone sets it; NULL/0 means no extra charge.
    extra_charge_amount = Column(Float, nullable=True)
    extra_charge_description = Column(String(200), nullable=True)
    extra_charge_paid = Column(Boolean, default=False, nullable=False)

    # ── Clinical record (the doctor fills this in during / after the visit) ──
    diagnosis = Column(Text, nullable=True)
    prescription = Column(Text, nullable=True)
    follow_up_needed = Column(Boolean, default=False, nullable=False)
    follow_up_notes = Column(String(255), nullable=True)      # when / why to follow up
    chronic_conditions = Column(Text, nullable=True)          # patient's ongoing conditions
    current_medications = Column(Text, nullable=True)         # meds the patient already takes

    # ── WhatsApp reminder ────────────────────────────────────────────────
    reminder_status = Column(SAEnum(ReminderStatus), default=ReminderStatus.PENDING, nullable=False)
    reminder_sent_at = Column(DateTime, nullable=True)

    # ── Audit trail ───────────────────────────────────────────────────────
    # Bookings are created through the public, unauthenticated endpoint (used
    # by both patients and the admin's "walk-in" form), so there's no staff
    # identity at creation time. Instead, branch_id is stamped the first time
    # an authenticated staff/admin account touches the booking (status
    # change, medical record, etc.) from that user's own branch — recording
    # which branch actually handled the patient. updated_by is refreshed on
    # every such action, regardless of branch.
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    updated_by = Column(String(60), nullable=True)  # username of the staff/admin who last touched this booking
    branch = relationship("Branch")

    @property
    def branch_name(self) -> str | None:
        return self.branch.name if self.branch else None

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(SAEnum(UserRole), default=UserRole.STAFF, nullable=False)
    # NULL = not tied to a specific branch (the seeded admin/staff accounts,
    # and any doctor/admin account managing branches). Staff created from the
    # branch settings page get this set to the branch they log in for.
    branch_id = Column(Integer, ForeignKey("branches.id"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    branch = relationship("Branch", back_populates="staff")


class Branch(Base):
    """A clinic branch/location. The doctor manages branches and, per branch,
    the staff accounts that log in for it, that branch's consultation fee
    and duration, and its own working days/hours — a patient booking at this
    branch can only pick a day it's actually open (see core/clinic_schedule.py)."""
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    address = Column(String(255), nullable=True)
    # The general exam/visit fee, charged on any appointment regardless of
    # service type.
    consultation_fee = Column(Float, nullable=True)
    # The price specifically for a "Consultation" (service_type=consultation)
    # booking — a separate figure from the general exam fee above.
    consultation_price = Column(Float, nullable=True)
    consultation_duration_minutes = Column(Integer, nullable=True)
    # How many days a completed consultation at this branch stays valid for
    # the "has consultation" follow-up reminder on a completed exam. Bookings
    # aren't branch-scoped yet, so the effective clinic-wide value used for
    # that enforcement (see core/crud/setting.py) is kept in sync with
    # whichever branch was last saved — see services/branch_service.py.
    consultation_validity_days = Column(Integer, nullable=True)
    # JSON string: {"monday": {"opens": "10:00", "closes": "21:00"}, "friday":
    # null, ...} — same shape as ClinicScheduleResponse.hours_by_day. NULL
    # means this branch hasn't set its own hours yet, so booking falls back
    # to the clinic-wide default (see core/clinic_schedule.py).
    working_hours = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    staff = relationship("User", back_populates="branch")


class Setting(Base):
    """Simple key/value store for clinic-wide settings (e.g. the base
    consultation fee). Kept generic so new settings don't need a schema change."""
    __tablename__ = "settings"

    key = Column(String(60), primary_key=True)
    value = Column(String(255), nullable=True)


class Expense(Base):
    """A clinic operating cost (rent, salaries, supplies, …). The only money
    that isn't derived from bookings — revenue comes from paid extra charges on
    bookings, expenses are entered here, and net profit is revenue − expenses."""
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    category = Column(String(60), nullable=False)
    amount = Column(Float, nullable=False)
    date = Column(String(20), nullable=False)          # e.g. "2026-08-20"
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MedicalRecord(Base):
    """A standalone patient file — not tied to a booking, so records can be
    kept for walk-ins or anyone. Holds only the patient's fixed identity
    info; the clinical picture (diagnosis, symptoms, ...) changes visit to
    visit, so it lives on dated MedicalRecordEntry rows underneath instead
    of directly on this record."""
    __tablename__ = "medical_records"

    id = Column(Integer, primary_key=True, index=True)
    patient_name = Column(String(120), nullable=False)
    gender = Column(String(20), nullable=True)          # male / female / other
    age = Column(Integer, nullable=True)
    phone = Column(String(30), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    entries = relationship(
        "MedicalRecordEntry", back_populates="record", cascade="all, delete-orphan",
        order_by="MedicalRecordEntry.date.desc(), MedicalRecordEntry.id.desc()",
    )


class MedicalRecordEntry(Base):
    """One dated visit entry under a patient's medical record — the
    diagnosis, symptoms, prescription etc. as of that date, plus any images
    taken that visit. A patient accumulates one of these per visit instead
    of the record being overwritten each time."""
    __tablename__ = "medical_record_entries"

    id = Column(Integer, primary_key=True, index=True)
    record_id = Column(Integer, ForeignKey("medical_records.id", ondelete="CASCADE"), nullable=False, index=True)
    date = Column(String(10), nullable=False)  # "YYYY-MM-DD"
    diagnosis = Column(Text, nullable=True)
    symptoms = Column(Text, nullable=True)
    prescription = Column(Text, nullable=True)
    follow_up_needed = Column(Boolean, default=False, nullable=False)
    follow_up_notes = Column(String(255), nullable=True)
    chronic_conditions = Column(Text, nullable=True)
    current_medications = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    record = relationship("MedicalRecord", back_populates="entries")
    images = relationship(
        "MedicalImage", back_populates="entry", cascade="all, delete-orphan",
        order_by="MedicalImage.id",
    )


class MedicalImage(Base):
    """An image (X-ray / photo) attached to one visit entry. The file lives
    on disk under the uploads dir; this row keeps the reference + metadata."""
    __tablename__ = "medical_images"

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("medical_record_entries.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)      # stored name on disk
    original_name = Column(String(255), nullable=True)
    content_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    entry = relationship("MedicalRecordEntry", back_populates="images")

    @property
    def url(self) -> str:
        """Path the frontend appends to the API base to load the image."""
        return f"/uploads/medical/{self.filename}"


# ── Create tables ─────────────────────────────────────────────────────────────
def init_db() -> None:
    """Create all tables if they don't exist yet, and add any new columns
    to tables that already exist (lightweight migration — this project has
    no Alembic set up, so this keeps existing rows intact instead of
    requiring a dropped/recreated database.db)."""
    Base.metadata.create_all(bind=engine)
    _migrate_missing_columns()
    _migrate_booking_queue_constraint()
    _migrate_legacy_medical_record_fields()
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
                if column.name in ("patient_arrived", "consultation_hint_dismissed", "extra_charge_paid", "follow_up_needed"):
                    default_clause = " DEFAULT 0"
                elif column.name == "service_type":
                    # SAEnum stores the member NAME (e.g. existing rows hold
                    # 'PENDING'/'CLINIC'), so the backfill default must be the
                    # uppercase name too or SQLAlchemy can't read it back.
                    default_clause = f" DEFAULT '{ServiceType.TREATMENT.name}'"
                elif column.name == "payment_method":
                    default_clause = f" DEFAULT '{PaymentMethod.CLINIC.value}'"
                elif column.name == "payment_status":
                    default_clause = f" DEFAULT '{PaymentStatus.PENDING.value}'"
                elif column.name == "reminder_status":
                    default_clause = f" DEFAULT '{ReminderStatus.PENDING.value}'"
                conn.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {col_type}{default_clause}')
                )


def _migrate_booking_queue_constraint() -> None:
    """One-time upgrade: queue numbers used to be unique per date across the
    whole clinic; now each branch runs its own queue, so the constraint has
    to be UNIQUE(date, branch_id, queue_number) instead — otherwise two
    branches' "first booking of the day" would both claim queue_number=1 and
    collide. SQLite can't ALTER a table to change a composite UNIQUE
    constraint in place, so this renames the old table aside, lets
    create_all's fresh CREATE TABLE (with the new constraint) take its place,
    copies every row over, then drops the old one."""
    inspector = inspect(engine)
    if "bookings" not in inspector.get_table_names():
        return
    with engine.begin() as conn:
        existing_sql = conn.execute(
            text("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'")
        ).scalar()
        if not existing_sql or "uq_booking_date_branch_queue" in existing_sql:
            return  # already migrated

        conn.execute(text("ALTER TABLE bookings RENAME TO bookings_old_uq_migration"))
        Booking.__table__.create(bind=conn)
        columns = ", ".join(f'"{c.name}"' for c in Booking.__table__.columns)
        conn.execute(text(f"INSERT INTO bookings ({columns}) SELECT {columns} FROM bookings_old_uq_migration"))
        conn.execute(text("DROP TABLE bookings_old_uq_migration"))


def _migrate_legacy_medical_record_fields() -> None:
    """One-time backfill: diagnosis/prescription/etc. used to live directly
    on MedicalRecord; they now live on dated MedicalRecordEntry rows instead
    so a patient's diagnosis history can hold more than one visit, and
    images now attach to an entry (entry_id) instead of the record
    (record_id). Any existing record with old clinical data gets it copied
    into a single entry (dated to when the record was created) the first
    time this runs. The two checks below are independent — each only does
    work (and only drops its own stale column) the first time it finds one,
    so this stays safe to call on every startup."""
    inspector = inspect(engine)

    if "medical_records" in inspector.get_table_names():
        legacy_columns = {
            "diagnosis", "prescription", "follow_up_needed", "follow_up_notes",
            "chronic_conditions", "current_medications", "notes",
        }
        existing_columns = {c["name"] for c in inspector.get_columns("medical_records")}
        present = legacy_columns & existing_columns
        if present:
            with engine.begin() as conn:
                already_migrated = {
                    row[0] for row in conn.execute(text("SELECT DISTINCT record_id FROM medical_record_entries"))
                }
                rows = conn.execute(text(
                    "SELECT id, diagnosis, prescription, follow_up_needed, follow_up_notes, "
                    "chronic_conditions, current_medications, notes, created_at FROM medical_records"
                )).fetchall()
                for row in rows:
                    if row.id in already_migrated:
                        continue
                    has_data = any([
                        row.diagnosis, row.prescription, row.chronic_conditions,
                        row.current_medications, row.notes, row.follow_up_notes,
                    ])
                    if not has_data:
                        continue
                    entry_date = str(row.created_at)[:10] if row.created_at else datetime.now(timezone.utc).strftime("%Y-%m-%d")
                    conn.execute(
                        text(
                            "INSERT INTO medical_record_entries "
                            "(record_id, date, diagnosis, prescription, follow_up_needed, follow_up_notes, "
                            "chronic_conditions, current_medications, notes, created_at, updated_at) "
                            "VALUES (:record_id, :date, :diagnosis, :prescription, :follow_up_needed, :follow_up_notes, "
                            ":chronic_conditions, :current_medications, :notes, :created_at, :created_at)"
                        ),
                        {
                            "record_id": row.id,
                            "date": entry_date,
                            "diagnosis": row.diagnosis,
                            "prescription": row.prescription,
                            "follow_up_needed": row.follow_up_needed,
                            "follow_up_notes": row.follow_up_notes,
                            "chronic_conditions": row.chronic_conditions,
                            "current_medications": row.current_medications,
                            "notes": row.notes,
                            "created_at": row.created_at,
                        },
                    )

                # The old columns are gone from the model now, but a couple
                # (e.g. follow_up_needed) were NOT NULL with no server-side
                # default, which breaks every future insert if left in place
                # unmigrated. Their data is safely copied above, so drop
                # them outright (SQLite 3.35+).
                for col in present:
                    conn.execute(text(f'ALTER TABLE "medical_records" DROP COLUMN "{col}"'))

    if "medical_images" in inspector.get_table_names():
        image_columns = {c["name"] for c in inspector.get_columns("medical_images")}
        if "record_id" in image_columns:
            # record_id is part of a FOREIGN KEY constraint, which SQLite
            # refuses to drop via ALTER TABLE ... DROP COLUMN. No image rows
            # existed under the old shape at the time this migration was
            # introduced, so just recreate the table fresh under the new
            # schema (entry_id) instead of attempting a column-level drop.
            with engine.begin() as conn:
                conn.execute(text('DROP TABLE "medical_images"'))
            MedicalImage.__table__.create(bind=engine)
