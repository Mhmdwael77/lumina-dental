"""
Pydantic v2 schemas for standalone medical records and their images.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class MedicalRecordCreate(BaseModel):
    patient_name: str = Field(..., min_length=1, max_length=120, examples=["Ahmed Hassan"])
    gender: Optional[str] = Field(None, max_length=20, examples=["male"])
    age: Optional[int] = Field(None, ge=0, le=130, examples=[34])
    phone: Optional[str] = Field(None, max_length=30)
    diagnosis: Optional[str] = Field(None, max_length=2000)
    prescription: Optional[str] = Field(None, max_length=2000)
    follow_up_needed: bool = False
    follow_up_notes: Optional[str] = Field(None, max_length=255)
    chronic_conditions: Optional[str] = Field(None, max_length=2000)
    current_medications: Optional[str] = Field(None, max_length=2000)
    notes: Optional[str] = Field(None, max_length=2000)


class MedicalRecordUpdate(MedicalRecordCreate):
    """Same fields — a full update/replace of the record's data."""


class MedicalImageResponse(BaseModel):
    id: int
    filename: str
    original_name: Optional[str] = None
    content_type: Optional[str] = None
    url: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MedicalRecordResponse(BaseModel):
    id: int
    patient_name: str
    gender: Optional[str] = None
    age: Optional[int] = None
    phone: Optional[str] = None
    diagnosis: Optional[str] = None
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
