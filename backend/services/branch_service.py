"""
Business logic for clinic branches and their staff accounts — the doctor's
"Clinic Settings" area: create/edit branches (name, consultation fee &
duration) and, per branch, the staff usernames/passwords that log in for it.
"""

import json

from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from core.database import Branch, User
from core.clinic_schedule import branch_working_hours, hours_by_day_json
from core.crud.branch import (
    get_branch,
    get_all_branches,
    create_branch as crud_create_branch,
    update_branch as crud_update_branch,
    delete_branch as crud_delete_branch,
    get_branch_staff,
    create_branch_staff as crud_create_branch_staff,
    delete_branch_staff as crud_delete_branch_staff,
    reset_branch_staff_password as crud_reset_branch_staff_password,
)
from core.crud.user import get_user_by_username
from core.crud.setting import set_consultation_validity_days
from schemas.branch import (
    BranchCreate,
    BranchUpdate,
    BranchResponse,
    PublicBranchResponse,
    BranchStaffCreate,
    BranchStaffPasswordUpdate,
)


def _to_response(branch: Branch) -> BranchResponse:
    return BranchResponse(
        id=branch.id,
        name=branch.name,
        address=branch.address,
        consultation_fee=branch.consultation_fee,
        consultation_price=branch.consultation_price,
        consultation_duration_minutes=branch.consultation_duration_minutes,
        consultation_validity_days=branch.consultation_validity_days,
        working_hours=json.loads(branch.working_hours) if branch.working_hours else None,
        is_active=branch.is_active,
        staff_count=len(branch.staff),
        created_at=branch.created_at,
    )


def _working_hours_payload(data) -> dict | None:
    """Convert the Pydantic WorkingHours field (day -> DayHours | None) into
    a plain JSON-serializable dict for storage."""
    if data.working_hours is None:
        return None
    return {day: (hours.model_dump() if hours is not None else None) for day, hours in data.working_hours.items()}


def list_branches(db: Session) -> list[BranchResponse]:
    return [_to_response(b) for b in get_all_branches(db)]


def list_public_branches(db: Session) -> list[PublicBranchResponse]:
    """Active branches for the public booking form — no auth required, so
    only the fields a patient needs to pick one and see its price/schedule."""
    return [
        PublicBranchResponse(
            id=b.id,
            name=b.name,
            address=b.address,
            consultation_fee=b.consultation_fee,
            consultation_price=b.consultation_price,
            working_hours=hours_by_day_json(branch_working_hours(b)),
        )
        for b in get_all_branches(db)
        if b.is_active
    ]


def get_branch_or_404(db: Session, branch_id: int) -> Branch:
    branch = get_branch(db, branch_id)
    if branch is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Branch not found")
    return branch


def create_branch(db: Session, data: BranchCreate) -> BranchResponse:
    branch = crud_create_branch(
        db,
        name=data.name,
        address=data.address,
        consultation_fee=data.consultation_fee,
        consultation_price=data.consultation_price,
        consultation_duration_minutes=data.consultation_duration_minutes,
        consultation_validity_days=data.consultation_validity_days,
        working_hours=_working_hours_payload(data),
    )
    # Bookings aren't tied to a branch yet, so the "has consultation" reminder
    # enforcement (core/crud/setting.py) still reads one clinic-wide value —
    # keep it synced to whichever branch was just saved, so editing the
    # setting here (where the doctor now expects to find it) actually takes
    # effect instead of silently doing nothing.
    if data.consultation_validity_days is not None:
        set_consultation_validity_days(db, data.consultation_validity_days)
    return _to_response(branch)


def update_branch(db: Session, branch_id: int, data: BranchUpdate) -> BranchResponse:
    get_branch_or_404(db, branch_id)
    branch = crud_update_branch(
        db,
        branch_id,
        name=data.name,
        address=data.address,
        consultation_fee=data.consultation_fee,
        consultation_price=data.consultation_price,
        consultation_duration_minutes=data.consultation_duration_minutes,
        consultation_validity_days=data.consultation_validity_days,
        working_hours=_working_hours_payload(data),
        is_active=data.is_active,
    )
    if data.consultation_validity_days is not None:
        set_consultation_validity_days(db, data.consultation_validity_days)
    return _to_response(branch)


def delete_branch(db: Session, branch_id: int) -> None:
    get_branch_or_404(db, branch_id)
    crud_delete_branch(db, branch_id)


def list_branch_staff(db: Session, branch_id: int) -> list[User]:
    get_branch_or_404(db, branch_id)
    return get_branch_staff(db, branch_id)


def create_branch_staff(db: Session, branch_id: int, data: BranchStaffCreate) -> User:
    get_branch_or_404(db, branch_id)
    if get_user_by_username(db, data.username) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This username is already taken")
    return crud_create_branch_staff(db, branch_id, data.username, data.password)


def delete_branch_staff(db: Session, branch_id: int, user_id: int) -> None:
    get_branch_or_404(db, branch_id)
    if not crud_delete_branch_staff(db, branch_id, user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found for this branch")


def reset_branch_staff_password(db: Session, branch_id: int, user_id: int, data: BranchStaffPasswordUpdate) -> User:
    get_branch_or_404(db, branch_id)
    user = crud_reset_branch_staff_password(db, branch_id, user_id, data.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found for this branch")
    return user
