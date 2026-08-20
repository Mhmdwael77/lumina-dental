"""
Financial dashboard & expense tracking endpoints (all staff/admin, JWT required).

  GET    /finance/summary            – KPIs, series, breakdowns & transactions
  GET    /finance/expenses           – List expenses (optional ?start=&end=)
  POST   /finance/expenses           – Add an expense
  DELETE /finance/expenses/{id}      – Remove an expense
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from core.dependencies import get_db, require_staff
from core.database import User
from core.crud.expense import create_expense, list_expenses, delete_expense
from schemas.finance import ExpenseCreate, ExpenseResponse, FinanceSummary
from services.finance_service import get_financial_summary

router = APIRouter(prefix="/finance", tags=["Finance"])

_DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


@router.get("/summary", response_model=FinanceSummary, summary="Financial dashboard summary (staff)")
def finance_summary(
    start: str | None = Query(None, pattern=_DATE_RE),
    end: str | None = Query(None, pattern=_DATE_RE),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    # Default range: last 30 days ending today.
    today = date.today()
    end = end or today.isoformat()
    start = start or (today - timedelta(days=29)).isoformat()
    if start > end:
        start, end = end, start
    return get_financial_summary(db, start, end)


@router.get("/expenses", response_model=list[ExpenseResponse], summary="List expenses (staff)")
def get_expenses(
    start: str | None = Query(None, pattern=_DATE_RE),
    end: str | None = Query(None, pattern=_DATE_RE),
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return list_expenses(db, start=start, end=end)


@router.post(
    "/expenses",
    response_model=ExpenseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add an expense (staff)",
)
def add_expense(
    data: ExpenseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    return create_expense(
        db,
        name=data.name.strip(),
        category=data.category.strip(),
        amount=data.amount,
        date=data.date,
        notes=(data.notes.strip() if data.notes else None),
    )


@router.delete(
    "/expenses/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an expense (staff)",
)
def remove_expense(
    expense_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_staff),
):
    if not delete_expense(db, expense_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
