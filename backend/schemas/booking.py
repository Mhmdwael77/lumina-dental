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


class ServiceTypeEnum(str, Enum):
    TREATMENT = "treatment"
    CONSULTATION = "consultation"


class PaymentMethodEnum(str, Enum):
    CLINIC = "clinic"
    ONLINE = "online"


class PaymentStatusEnum(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"


class ReminderStatusEnum(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    NOT_APPLICABLE = "not_applicable"


# ── Request bodies ────────────────────────────────────────────────────────────
class BookingCreate(BaseModel):
    """Schema for a public booking request from the frontend.

    Patients select a working day, not an exact time — `queue_number`,
    `estimated_arrival_*` and `payment_status` are always computed by the
    backend and cannot be supplied by the client.
    """
    full_name: str = Field(..., min_length=2, max_length=120, examples=["Ahmed Hassan"])
    phone: str = Field(..., min_length=6, max_length=30, examples=["+201001234567"])
    email: Optional[EmailStr] = Field(None, examples=["ahmed@example.com"])
    treatment: str = Field(..., min_length=2, max_length=80, examples=["Cosmetic Dentistry"])
    # Consultation vs. treatment appointment. Optional & defaults to treatment
    # so existing clients that don't send it keep working unchanged.
    service_type: ServiceTypeEnum = ServiceTypeEnum.TREATMENT
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-08-20"])
    message: Optional[str] = Field(None, max_length=500)
    payment_method: PaymentMethodEnum = PaymentMethodEnum.CLINIC


class BookingStatusUpdate(BaseModel):
    """Schema for staff/admin to update a booking's status."""
    status: BookingStatusEnum


class ArrivalUpdate(BaseModel):
    """Schema for staff/admin to mark a patient as entered / not entered."""
    arrived: bool


class ConsultationHintUpdate(BaseModel):
    """Staff show/hide the 'patient also has a consultation' reminder on a
    completed exam. UI-only flag — never affects the consultation booking."""
    dismissed: bool


class PaymentConfirmRequest(BaseModel):
    """Simulated online-payment confirmation.

    `phone` acts as a lightweight ownership check since patients have no
    account/session in this system (the same posture as the public booking
    endpoint). A real gateway integration would replace this with a signed
    webhook/callback instead.
    """
    phone: str = Field(..., min_length=6, max_length=30)


# ── Response bodies ───────────────────────────────────────────────────────────
class BookingResponse(BaseModel):
    """Full booking record returned to authenticated staff."""
    id: int
    full_name: str
    phone: str
    email: Optional[str] = None
    treatment: str
    service_type: ServiceTypeEnum
    date: str
    time: Optional[str] = None
    message: Optional[str] = None
    status: BookingStatusEnum

    queue_number: Optional[int] = None
    estimated_arrival_start: Optional[datetime] = None
    estimated_arrival_end: Optional[datetime] = None
    patient_arrived: bool
    arrived_at: Optional[datetime] = None
    consultation_hint_dismissed: bool = False

    payment_method: PaymentMethodEnum
    payment_status: PaymentStatusEnum
    reminder_status: ReminderStatusEnum

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BookingPublicResponse(BaseModel):
    """Confirmation returned to the public frontend after booking — includes
    the queue/estimate/payment info the confirmation screen needs, but no
    other patients' data."""
    id: int
    full_name: str
    treatment: str
    service_type: ServiceTypeEnum
    date: str
    status: BookingStatusEnum

    queue_number: int
    patients_ahead: int
    estimated_arrival_start: Optional[datetime] = None
    estimated_arrival_end: Optional[datetime] = None

    payment_method: PaymentMethodEnum
    payment_status: PaymentStatusEnum

    model_config = {"from_attributes": True}


class QueueStatusResponse(BaseModel):
    """Live, backend-computed queue position for a single booking — used by
    the confirmation page to poll for updates without exposing other
    patients' personal data."""
    id: int
    date: str
    queue_number: int
    status: BookingStatusEnum
    patient_arrived: bool
    patients_ahead: int
    currently_serving: Optional[int] = None
    estimated_arrival_start: Optional[datetime] = None
    estimated_arrival_end: Optional[datetime] = None
    payment_method: PaymentMethodEnum
    payment_status: PaymentStatusEnum


class AvailabilityResponse(BaseModel):
    """Queue preview shown before a patient submits a booking."""
    date: str
    is_working_day: bool
    opens: Optional[str] = None
    closes: Optional[str] = None
    patients_booked: int
    next_queue_number: Optional[int] = None
    reason: Optional[str] = None


class ClinicScheduleResponse(BaseModel):
    working_days: list[int]  # 0=Monday ... 6=Sunday, per Python date.weekday()
    hours_by_day: dict[str, Optional[dict[str, str]]]
    min_consultation_minutes: int
    max_consultation_minutes: int
    booking_window_days: int
