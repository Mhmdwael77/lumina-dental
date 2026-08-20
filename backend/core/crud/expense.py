"""
Database query helpers for expenses.
"""

from sqlalchemy.orm import Session

from core.database import Expense


def create_expense(
    db: Session, *, name: str, category: str, amount: float, date: str, notes: str | None
) -> Expense:
    expense = Expense(name=name, category=category, amount=amount, date=date, notes=notes)
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


def get_expense(db: Session, expense_id: int) -> Expense | None:
    return db.query(Expense).filter(Expense.id == expense_id).first()


def list_expenses(
    db: Session, start: str | None = None, end: str | None = None
) -> list[Expense]:
    """Expenses in the inclusive [start, end] date range (YYYY-MM-DD string
    comparison is safe for zero-padded ISO dates), newest first."""
    q = db.query(Expense)
    if start is not None:
        q = q.filter(Expense.date >= start)
    if end is not None:
        q = q.filter(Expense.date <= end)
    return q.order_by(Expense.date.desc(), Expense.id.desc()).all()


def delete_expense(db: Session, expense_id: int) -> bool:
    expense = get_expense(db, expense_id)
    if expense is None:
        return False
    db.delete(expense)
    db.commit()
    return True
