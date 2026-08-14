"""
Pydantic v2 schemas for the Booking resource.
"""

from datetime import datetime
from pydantic import BaseModel, Field, EmailStr
from typing import Optional
from enum import Enum


class BookingStatusEnum(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


# ── Request bodies ────────────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    """Schema for a public booking request from the frontend."""
    full_name: str = Field(..., min_length=2, max_length=120, examples=["Ahmed Hassan"])
    phone: str = Field(..., min_length=6, max_length=30, examples=["+201001234567"])
    email: Optional[EmailStr] = Field(None, examples=["ahmed@example.com"])
    treatment: str = Field(..., min_length=2, max_length=80, examples=["Cosmetic Dentistry"])
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-08-20"])
    time: Optional[str] = Field(None, max_length=20, examples=["03:00 PM"])
    message: Optional[str] = Field(None, max_length=500)


class BookingStatusUpdate(BaseModel):
    """Schema for staff/admin to update a booking's status."""
    status: BookingStatusEnum


# ── Response bodies ───────────────────────────────────────────────────────────
class BookingResponse(BaseModel):
    """Full booking record returned to authenticated staff."""
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    treatment: str
    date: str
    time: Optional[str] = None
    message: Optional[str] = None
    status: BookingStatusEnum
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookingPublicResponse(BaseModel):
    """Minimal confirmation returned to the public frontend."""
    id: int
    full_name: str
    treatment: str
    date: str
    time: Optional[str] = None
    status: BookingStatusEnum

    model_config = {"from_attributes": True}
