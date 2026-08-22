"""
Pydantic v2 schemas for clinic branches and their staff accounts.
"""

from datetime import datetime
from pydantic import BaseModel, Field


class DayHours(BaseModel):
    opens: str = Field(..., pattern=r"^\d{2}:\d{2}$", examples=["10:00"])
    closes: str = Field(..., pattern=r"^\d{2}:\d{2}$", examples=["21:00"])


# Day name -> hours, or None if closed that day. Missing keys are treated as
# closed. Same shape as ClinicScheduleResponse.hours_by_day.
WorkingHours = dict[str, DayHours | None]


class BranchCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, examples=["Nasr City Branch"])
    address: str | None = Field(None, max_length=255)
    consultation_fee: float = Field(0, ge=0)
    consultation_price: float = Field(0, ge=0)
    consultation_duration_minutes: int = Field(15, ge=1, le=240)
    consultation_validity_days: int = Field(14, ge=1, le=365)
    working_hours: WorkingHours | None = None


class BranchUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    address: str | None = Field(None, max_length=255)
    consultation_fee: float | None = Field(None, ge=0)
    consultation_price: float | None = Field(None, ge=0)
    consultation_duration_minutes: int | None = Field(None, ge=1, le=240)
    consultation_validity_days: int | None = Field(None, ge=1, le=365)
    working_hours: WorkingHours | None = None
    is_active: bool | None = None


class BranchResponse(BaseModel):
    id: int
    name: str
    address: str | None = None
    consultation_fee: float | None = None
    consultation_price: float | None = None
    consultation_duration_minutes: int | None = None
    consultation_validity_days: int | None = None
    working_hours: WorkingHours | None = None
    is_active: bool
    staff_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicBranchResponse(BaseModel):
    """What a patient sees while booking — just enough to pick a branch and
    see its price and schedule, none of the staff-management details.
    working_hours is always the *effective* schedule (falls back to the
    clinic-wide default if this branch hasn't set its own), never null."""
    id: int
    name: str
    address: str | None = None
    consultation_fee: float | None = None
    consultation_price: float | None = None
    working_hours: WorkingHours

    model_config = {"from_attributes": True}


class BranchStaffCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=60)
    password: str = Field(..., min_length=4, max_length=128)


class BranchStaffPasswordUpdate(BaseModel):
    password: str = Field(..., min_length=4, max_length=128)


class BranchStaffResponse(BaseModel):
    id: int
    username: str
    role: str
    branch_id: int | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
