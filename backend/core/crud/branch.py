"""
Database query helpers for clinic branches and their staff accounts.
"""

import json

from sqlalchemy.orm import Session

from core.database import Branch, User
from core.security import hash_password


def get_branch(db: Session, branch_id: int) -> Branch | None:
    return db.query(Branch).filter(Branch.id == branch_id).first()


def get_all_branches(db: Session) -> list[Branch]:
    return db.query(Branch).order_by(Branch.created_at.asc()).all()


def create_branch(
    db: Session,
    name: str,
    address: str | None,
    consultation_fee: float | None,
    consultation_duration_minutes: int | None,
    consultation_validity_days: int | None = None,
    consultation_price: float | None = None,
    working_hours: dict | None = None,
) -> Branch:
    branch = Branch(
        name=name,
        address=address,
        consultation_fee=consultation_fee,
        consultation_price=consultation_price,
        consultation_duration_minutes=consultation_duration_minutes,
        consultation_validity_days=consultation_validity_days,
        working_hours=json.dumps(working_hours) if working_hours is not None else None,
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


def update_branch(
    db: Session,
    branch_id: int,
    name: str | None = None,
    address: str | None = None,
    consultation_fee: float | None = None,
    consultation_price: float | None = None,
    consultation_duration_minutes: int | None = None,
    consultation_validity_days: int | None = None,
    working_hours: dict | None = None,
    is_active: bool | None = None,
) -> Branch | None:
    branch = get_branch(db, branch_id)
    if branch is None:
        return None
    if name is not None:
        branch.name = name
    if address is not None:
        branch.address = address
    if consultation_fee is not None:
        branch.consultation_fee = consultation_fee
    if consultation_price is not None:
        branch.consultation_price = consultation_price
    if consultation_duration_minutes is not None:
        branch.consultation_duration_minutes = consultation_duration_minutes
    if consultation_validity_days is not None:
        branch.consultation_validity_days = consultation_validity_days
    if working_hours is not None:
        branch.working_hours = json.dumps(working_hours)
    if is_active is not None:
        branch.is_active = is_active
    db.commit()
    db.refresh(branch)
    return branch


def delete_branch(db: Session, branch_id: int) -> bool:
    branch = get_branch(db, branch_id)
    if branch is None:
        return False
    # Staff accounts aren't deleted with their branch — they just become
    # branch-unscoped, same as the seeded admin/staff accounts, so nobody's
    # login silently stops working because a branch was removed.
    for user in branch.staff:
        user.branch_id = None
    db.delete(branch)
    db.commit()
    return True


def get_branch_staff(db: Session, branch_id: int) -> list[User]:
    return db.query(User).filter(User.branch_id == branch_id).order_by(User.created_at.asc()).all()


def create_branch_staff(db: Session, branch_id: int, username: str, password: str) -> User:
    from core.database import UserRole

    user = User(
        username=username,
        hashed_password=hash_password(password),
        role=UserRole.STAFF,
        branch_id=branch_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def delete_branch_staff(db: Session, branch_id: int, user_id: int) -> bool:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.branch_id == branch_id)
        .first()
    )
    if user is None:
        return False
    db.delete(user)
    db.commit()
    return True


def reset_branch_staff_password(db: Session, branch_id: int, user_id: int, new_password: str) -> User | None:
    user = (
        db.query(User)
        .filter(User.id == user_id, User.branch_id == branch_id)
        .first()
    )
    if user is None:
        return None
    user.hashed_password = hash_password(new_password)
    db.commit()
    db.refresh(user)
    return user
