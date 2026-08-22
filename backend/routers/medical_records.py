"""
Standalone medical records + image attachments (all staff/admin, JWT required).

  GET    /medical-records                    – List records (optional ?search=)
  POST   /medical-records                    – Create a record
  GET    /medical-records/{id}               – Get one record (with images)
  PATCH  /medical-records/{id}               – Update a record
  DELETE /medical-records/{id}               – Delete a record (and its images)
  POST   /medical-records/{id}/images        – Upload an image (multipart)
  DELETE /medical-records/images/{image_id}  – Delete one image

Uploaded files live on disk under uploads/medical/ and are served statically
(mounted in main.py) at /uploads/medical/<filename>.
"""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_staff
from core.database import User
from core.crud.medical_record import (
    create_record,
    list_records,
    get_record,
    update_record,
    delete_record,
    add_image,
    get_image,
    delete_image,
)
from schemas.medical_record import (
    MedicalRecordCreate,
    MedicalRecordUpdate,
    MedicalRecordResponse,
    MedicalImageResponse,
)

router = APIRouter(prefix="/medical-records", tags=["Medical Records"])

UPLOAD_DIR = Path("uploads/medical")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}
MAX_BYTES = 10 * 1024 * 1024  # 10 MB


def _clean(v: str | None) -> str | None:
    return v.strip() if v and v.strip() else None


def _record_fields(data: MedicalRecordCreate | MedicalRecordUpdate) -> dict:
    return dict(
        patient_name=data.patient_name.strip(),
        gender=_clean(data.gender),
        age=data.age,
        phone=_clean(data.phone),
        diagnosis=_clean(data.diagnosis),
        prescription=_clean(data.prescription),
        follow_up_needed=data.follow_up_needed,
        follow_up_notes=_clean(data.follow_up_notes),
        chronic_conditions=_clean(data.chronic_conditions),
        current_medications=_clean(data.current_medications),
        notes=_clean(data.notes),
    )


@router.get("", response_model=list[MedicalRecordResponse], summary="List medical records (staff)")
def list_all(
    search: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return list_records(db, search)


@router.post("", response_model=MedicalRecordResponse, status_code=status.HTTP_201_CREATED, summary="Create a medical record (staff)")
def create(
    data: MedicalRecordCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return create_record(db, **_record_fields(data))


@router.get("/{record_id}", response_model=MedicalRecordResponse, summary="Get a medical record (staff)")
def get_one(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    record = get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    return record


@router.patch("/{record_id}", response_model=MedicalRecordResponse, summary="Update a medical record (staff)")
def update(
    record_id: int,
    data: MedicalRecordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    record = update_record(db, record_id, **_record_fields(data))
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a medical record (staff)")
def remove(
    record_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    record = get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
    filenames = [img.filename for img in record.images]
    delete_record(db, record_id)
    for fname in filenames:
        try:
            (UPLOAD_DIR / fname).unlink(missing_ok=True)
        except OSError:
            pass


@router.post("/{record_id}/images", response_model=MedicalImageResponse, status_code=status.HTTP_201_CREATED, summary="Attach an image to a record (staff)")
async def upload_image(
    record_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    record = get_record(db, record_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Medical record not found")
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
    return add_image(db, record_id, filename=stored, original_name=file.filename, content_type=file.content_type)


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete an image (staff)")
def remove_image(
    image_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
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
