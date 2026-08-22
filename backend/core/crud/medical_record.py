"""
Database query helpers for standalone medical records (patient profiles),
their dated visit entries, and the images attached to each entry.
"""

from sqlalchemy import or_
from sqlalchemy.orm import Session

from core.database import MedicalRecord, MedicalRecordEntry, MedicalImage


def create_record(db: Session, **fields) -> MedicalRecord:
    record = MedicalRecord(**fields)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_records(db: Session, search: str | None = None) -> list[MedicalRecord]:
    q = db.query(MedicalRecord)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(
            or_(
                MedicalRecord.patient_name.ilike(like),
                MedicalRecord.phone.ilike(like),
                MedicalRecord.entries.any(MedicalRecordEntry.diagnosis.ilike(like)),
                MedicalRecord.entries.any(MedicalRecordEntry.symptoms.ilike(like)),
            )
        )
    return q.order_by(MedicalRecord.updated_at.desc(), MedicalRecord.id.desc()).all()


def get_record(db: Session, record_id: int) -> MedicalRecord | None:
    return db.query(MedicalRecord).filter(MedicalRecord.id == record_id).first()


def update_record(db: Session, record_id: int, **fields) -> MedicalRecord | None:
    record = get_record(db, record_id)
    if record is None:
        return None
    for key, value in fields.items():
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return record


def delete_record(db: Session, record_id: int) -> bool:
    record = get_record(db, record_id)
    if record is None:
        return False
    db.delete(record)  # cascade removes entries + their image rows
    db.commit()
    return True


# ── Visit entries ────────────────────────────────────────────────────────────
def create_entry(db: Session, record_id: int, **fields) -> MedicalRecordEntry:
    entry = MedicalRecordEntry(record_id=record_id, **fields)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_entry(db: Session, entry_id: int) -> MedicalRecordEntry | None:
    return db.query(MedicalRecordEntry).filter(MedicalRecordEntry.id == entry_id).first()


def update_entry(db: Session, entry_id: int, **fields) -> MedicalRecordEntry | None:
    entry = get_entry(db, entry_id)
    if entry is None:
        return None
    for key, value in fields.items():
        setattr(entry, key, value)
    db.commit()
    db.refresh(entry)
    return entry


def delete_entry(db: Session, entry_id: int) -> bool:
    entry = get_entry(db, entry_id)
    if entry is None:
        return False
    db.delete(entry)  # cascade removes image rows
    db.commit()
    return True


# ── Images (attached to a visit entry) ──────────────────────────────────────
def add_image(db: Session, entry_id: int, *, filename: str, original_name: str | None, content_type: str | None) -> MedicalImage:
    image = MedicalImage(
        entry_id=entry_id,
        filename=filename,
        original_name=original_name,
        content_type=content_type,
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


def get_image(db: Session, image_id: int) -> MedicalImage | None:
    return db.query(MedicalImage).filter(MedicalImage.id == image_id).first()


def delete_image(db: Session, image_id: int) -> bool:
    image = get_image(db, image_id)
    if image is None:
        return False
    db.delete(image)
    db.commit()
    return True
