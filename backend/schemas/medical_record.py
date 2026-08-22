"""
Pydantic v2 schemas for standalone medical records: a fixed patient profile
with a dated history of visit entries (diagnosis, symptoms, ...) underneath.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Patient profile (fixed identity data) ──────────────────────────────────────
class MedicalRecordCreate(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=120, examples=["Ahmed Hassan"])
    gender: Optional[str] = Field(None, max_length=20, examples=["male"])
    age: Optional[int] = Field(None, ge=0, le=130, examples=[34])
    phone: Optional[str] = Field(None, max_length=30)


class MedicalRecordUpdate(MedicalRecordCreate):
    """Same fields — a full update/replace of the patient's identity data."""


# ── Visit entries (dated clinical history) ─────────────────────────────────────
class MedicalRecordEntryCreate(BaseModel):
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-08-22"])
    diagnosis: Optional[str] = Field(None, max_length=2000)
    symptoms: Optional[str] = Field(None, max_length=2000)
    prescription: Optional[str] = Field(None, max_length=2000)
    follow_up_needed: bool = False
    follow_up_notes: Optional[str] = Field(None, max_length=255)
    chronic_conditions: Optional[str] = Field(None, max_length=2000)
    current_medications: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)


class MedicalRecordEntryUpdate(MedicalRecordEntryCreate):
    """Same fields — a full update/replace of this one visit's data."""


class MedicalImageResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str] = None
    content_type: Optional[str] = None
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MedicalRecordEntryResponse(BaseModel):
    id: int
    date: str
    diagnosis: Optional[str] = None
    symptoms: Optional[str] = None
    prescription: Optional[str] = None
    follow_up_needed: bool = False
    follow_up_notes: Optional[str] = None
    chronic_conditions: Optional[str] = None
    current_medications: Optional[str] = None
    notes: Optional[str] = None
    images: list[MedicalImageResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MedicalRecordResponse(BaseModel):
    id: int
    patient_name: str
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    entries: list[MedicalRecordEntryResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
