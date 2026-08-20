"""
Pydantic v2 schemas for expenses and the financial dashboard summary.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Expenses ──────────────────────────────────────────────────────────────────
class ExpenseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120, examples=["Clinic rent"])
    category: str = Field(..., min_length=1, max_length=60, examples=["Rent"])
    amount: float = Field(..., ge=0, examples=[12000.0])
    date: str = Field(..., pattern=r"^\d{4}-\d{2}-\d{2}$", examples=["2026-08-01"])
    notes: Optional[str] = Field(None, max_length=500)


class ExpenseResponse(BaseModel):
    id: int
    name: str
    category: str
    amount: float
    date: str
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Financial summary (all figures computed from the real DB) ─────────────────
class FinanceKpis(BaseModel):
    today_patients: int
    today_appointments: int
    today_revenue: float
    week_revenue: float
    month_revenue: float
    total_revenue: float
    pending_payments: float
    total_expenses: float
    net_profit: float
    avg_revenue_per_patient: float
    cancelled_appointments: int


class RangeTotals(BaseModel):
    start: str
    end: str
    revenue: float
    expenses: float
    net_profit: float
    pending: float
    appointments: int
    patients: int
    cancelled: int


class RevenuePoint(BaseModel):
    label: str          # bucket start date, YYYY-MM-DD
    revenue: float
    expenses: float


class AppointmentsPoint(BaseModel):
    label: str
    appointments: int
    patients: int


class CategoryTotal(BaseModel):
    category: str
    amount: float


class Transaction(BaseModel):
    id: str             # e.g. "rev-12" / "exp-3" (unique across kinds)
    kind: str           # "revenue" | "expense"
    date: str
    title: str
    subtitle: Optional[str] = None
    amount: float       # positive for revenue, negative for expense
    status: str         # "paid" | "pending"


class FinanceSummary(BaseModel):
    currency: str
    kpis: FinanceKpis
    range: RangeTotals
    revenue_series: list[RevenuePoint]
    appointments_series: list[AppointmentsPoint]
    payments_breakdown: dict  # {"paid": float, "pending": float}
    expenses_by_category: list[CategoryTotal]
    recent_transactions: list[Transaction]
