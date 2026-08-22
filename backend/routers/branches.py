"""
Clinic branch management — the doctor's "Clinic Settings" area.

All endpoints require the ADMIN role: branches, their consultation fee /
duration, and per-branch staff logins are the doctor's call, not something
regular staff should be able to change.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_admin
from core.database import User
from schemas.branch import (
    BranchCreate,
    BranchUpdate,
    BranchResponse,
    PublicBranchResponse,
    BranchStaffCreate,
    BranchStaffPasswordUpdate,
    BranchStaffResponse,
)
from services.branch_service import (
    list_branches,
    list_public_branches,
    create_branch,
    update_branch,
    delete_branch,
    list_branch_staff,
    create_branch_staff,
    delete_branch_staff,
    reset_branch_staff_password,
)

router = APIRouter(prefix="/branches", tags=["Clinic Branches"])


@router.get(
    "/public",
    response_model=list[PublicBranchResponse],
    summary="List active branches for the public booking form (no auth)",
)
def get_public_branches(db: Session = Depends(get_db)):
    return list_public_branches(db)


@router.get("/", response_model=list[BranchResponse], summary="List clinic branches (admin)")
def get_branches(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return list_branches(db)


@router.post("/", response_model=BranchResponse, summary="Create a clinic branch (admin)")
def add_branch(body: BranchCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return create_branch(db, body)


@router.patch("/{branch_id}", response_model=BranchResponse, summary="Update a branch's settings (admin)")
def edit_branch(
    branch_id: int, body: BranchUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    return update_branch(db, branch_id, body)


@router.delete("/{branch_id}", status_code=204, summary="Delete a branch (admin)")
def remove_branch(branch_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    delete_branch(db, branch_id)


@router.get(
    "/{branch_id}/staff",
    response_model=list[BranchStaffResponse],
    summary="List a branch's staff accounts (admin)",
)
def get_branch_staff_list(branch_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return list_branch_staff(db, branch_id)


@router.post(
    "/{branch_id}/staff",
    response_model=BranchStaffResponse,
    summary="Create a staff username/password for a branch (admin)",
)
def add_branch_staff(
    branch_id: int, body: BranchStaffCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    return create_branch_staff(db, branch_id, body)


@router.patch(
    "/{branch_id}/staff/{user_id}/password",
    response_model=BranchStaffResponse,
    summary="Reset a branch staff account's password (admin)",
)
def reset_branch_staff_password_endpoint(
    branch_id: int,
    user_id: int,
    body: BranchStaffPasswordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return reset_branch_staff_password(db, branch_id, user_id, body)


@router.delete("/{branch_id}/staff/{user_id}", status_code=204, summary="Remove a branch staff account (admin)")
def remove_branch_staff(
    branch_id: int, user_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)
):
    delete_branch_staff(db, branch_id, user_id)
