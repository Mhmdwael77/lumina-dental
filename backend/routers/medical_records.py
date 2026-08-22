"""
Standalone medical records: a fixed patient profile (name, gender, age,
phone) with a dated history of visit entries (diagnosis, symptoms,
prescription, ...) underneath it — a patient accumulates one entry per
visit instead of the record being overwritten each time. Images attach to
a specific entry. The whole resource is ADMIN-only — clinical notes are the
doctor's call, and staff don't get the Records page in the admin UI at all
(see app/admin/page.tsx).

  GET    /medical-records                              – List patient profiles (optional ?search=) — admin
  POST   /medical-records                               – Create a patient profile — admin
  GET    /medical-records/{id}                          – Get one profile (with its entries + images) — admin
  PATCH  /medical-records/{id}                          – Update a profile's identity data — admin
  DELETE /medical-records/{id}                          – Delete a profile (and its entries/images) — admin
  POST   /medical-records/{id}/entries                  – Add a dated visit entry — admin
  PATCH  /medical-records/entries/{entry_id}             – Update a visit entry — admin
  DELETE /medical-records/entries/{entry_id}             – Delete a visit entry (and its images) — admin
  POST   /medical-records/entries/{entry_id}/images      – Upload an image to an entry (multipart) — admin
  DELETE /medical-records/images/{image_id}              – Delete one image — admin

Uploaded files live on disk under uploads/medical/ and are served statically
(mounted in main.py) at /uploads/medical/<filename>.
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_admin
from core.database import User
from core.crud.medical_record import (
    create_record,
    list_records,
    get_record,
    update_record,
    delete_record,
    create_entry,
    get_entry,
    update_entry,
    delete_entry,
    add_image,
    get_image,
    delete_image,
)
from schemas.medical_record import (
    MedicalRecordCreate,
    MedicalRecordUpdate,
    MedicalRecordResponse,
    MedicalRecordEntryCreate,
    MedicalRecordEntryUpdate,
    MedicalRecordEntryResponse,
    MedicalImageResponse,
)

router = APIRouter(prefix="/medical-records", tags=["Medical Records"])

UPLOAD_DIR = Path("uploads/medical")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _clean(v: str | None) -> str | None:
    return v.strip() if v and v.strip() else None


def _profile_fields(data: MedicalRecordCreate | MedicalRecordUpdate) -> dict:
    return dict(
        patient_name=data.patient_name.strip(),
        gender=_clean(data.gender),
        age=data.age,
        phone=_clean(data.phone),
    )


def _entry_fields(data: MedicalRecordEntryCreate | MedicalRecordEntryUpdate) -> dict:
    return dict(
        date=data.date,
        diagnosis=_clean(data.diagnosis),
        symptoms=_clean(data.symptoms),
        prescription=_clean(data.prescription),
        follow_up_needed=data.follow_up_needed,
        follow_up_notes=_clean(data.follow_up_notes),
        chronic_conditions=_clean(data.chronic_conditions),
        current_medications=_clean(data.current_medications),
        notes=_clean(data.notes),
    )


def _delete_image_files(images) -> None:
    for img in images:
        try:
            (UPLOAD_DIR / img.filename).unlink(missing_ok=True)
        except OSError:
            pass


# ── Patient profiles ─────────────────────────────────────────────────────────
@router.get("", response_model=list[MedicalRecordResponse], summary="List medical records (admin)")
def list_all(
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return list_records(db, search)


@router.post("", response_model=MedicalRecordResponse, status_code=status.HTTP_201_CREATED, summary="Create a medical record (admin)")
def create(
    data: MedicalRecordCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return create_record(db, **_profile_fields(data))


@router.get("/{record_id}", response_model=MedicalRecordResponse, summary="Get a medical record (admin)")
def get_one(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    record = get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    return record


@router.patch("/{record_id}", response_model=MedicalRecordResponse, summary="Update a medical record (admin)")
def update(
    record_id: int,
    data: MedicalRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    record = update_record(db, record_id, **_profile_fields(data))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a medical record (admin)")
def remove(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    record = get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    for entry in record.entries:
        _delete_image_files(entry.images)
    delete_record(db, record_id)


# ── Visit entries ────────────────────────────────────────────────────────────
@router.post(
    "/{record_id}/entries",
    response_model=MedicalRecordEntryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a dated visit entry to a medical record (admin)",
)
def add_entry(
    record_id: int,
    data: MedicalRecordEntryCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if get_record(db, record_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    return create_entry(db, record_id, **_entry_fields(data))


@router.patch(
    "/entries/{entry_id}",
    response_model=MedicalRecordEntryResponse,
    summary="Update a visit entry (admin)",
)
def edit_entry(
    entry_id: int,
    data: MedicalRecordEntryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = update_entry(db, entry_id, **_entry_fields(data))
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit entry not found")
    return entry


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a visit entry (admin)")
def remove_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = get_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit entry not found")
    _delete_image_files(entry.images)
    delete_entry(db, entry_id)


# ── Images (attached to a visit entry) ──────────────────────────────────────
@router.post(
    "/entries/{entry_id}/images",
    response_model=MedicalImageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Attach an image to a visit entry (admin)",
)
async def upload_image(
    entry_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = get_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Visit entry not found")
    ext = ALLOWED_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only image files (JPEG, PNG, WEBP, GIF) are allowed.",
        )
    contents = await file.read()
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Image is too large (max 10MB).")
    stored = f"{uuid.uuid4().hex}{ext}"
    (UPLOAD_DIR / stored).write_bytes(contents)
    return add_image(db, entry_id, filename=stored, original_name=file.filename, content_type=file.content_type)


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an image (admin)")
def remove_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    image = get_image(db, image_id)
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    fname = image.filename
    delete_image(db, image_id)
    try:
        (UPLOAD_DIR / fname).unlink(missing_ok=True)
    except OSError:
        pass
