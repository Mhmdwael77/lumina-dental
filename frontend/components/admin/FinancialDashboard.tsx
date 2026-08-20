"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Users,
  CalendarDays,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Banknote,
  CircleDollarSign,
  Coins,
  Ban,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  ApiError,
  Expense,
  FinanceSummary,
  fetchFinanceSummary,
  fetchExpenses,
  createExpense,
  deleteExpense,
  getClinicSchedule,
  updateConsultationFee,
} from "@/lib/api";
import { useLanguage } from "@/lib/i18n/LanguageContext";

type Preset = "today" | "week" | "month" | "m3" | "m6" | "custom";

const INK = "#101820";
const GOLD = "#b99a6b";
const EXPENSE = "#b3452f";

const EXPENSE_CATEGORIES = ["Rent", "Salaries", "Supplies", "Utilities", "Equipment", "Marketing", "Maintenance", "Other"];

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function rangeFor(preset: Preset, customStart: string, customEnd: string): { start: string; end: string } {
  const today = new Date();
  const end = localIso(today);
  if (preset === "today") return { start: end, end };
  if (preset === "week") {
    const mon = new Date(today);
    mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7)); // back to Monday
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6); // full week → Sunday
    return { start: localIso(mon), end: localIso(sun) };
  }
  if (preset === "month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0); // last day of month
    return { start: localIso(first), end: localIso(last) };
  }
  if (preset === "m3") {
    const d = new Date(today);
    d.setDate(d.getDate() - 89);
    return { start: localIso(d), end };
  }
  if (preset === "m6") {
    const d = new Date(today);
    d.setDate(d.getDate() - 179);
    return { start: localIso(d), end };
  }
  return { start: customStart || end, end: customEnd || end };
}

function money(n: number, currency: string): string {
  const rounded = Math.round(n * 100) / 100;
  const str = Number.isInteger(rounded) ? rounded.toLocaleString("en-US") : rounded.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${str} ${currency}`;
}

function shortLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function FinancialDashboard({ token, onAuthError }: { token: string; onAuthError?: () => void }) {
  const { t, dir } = useLanguage();

  const [preset, setPreset] = useState<Preset>("month");
  const [customStart, setCustomStart] = useState(localIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState(localIso(new Date()));

  const { start, end } = useMemo(() => rangeFor(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Add-expense form
  const [expForm, setExpForm] = useState({ name: "", category: EXPENSE_CATEGORIES[0], amount: "", date: localIso(new Date()), notes: "" });
  const [expError, setExpError] = useState("");
  const [savingExpense, setSavingExpense] = useState(false);
  const [deletingExpenseId, setDeletingExpenseId] = useState<number | null>(null);

  // Base consultation fee (clinic-wide setting shown to patients at booking)
  const [feeInput, setFeeInput] = useState("");
  const [currentFee, setCurrentFee] = useState<number | null>(null);
  const [savingFee, setSavingFee] = useState(false);
  const [feeError, setFeeError] = useState("");
  const [feeSaved, setFeeSaved] = useState(false);

  useEffect(() => {
    getClinicSchedule()
      .then((s) => {
        setCurrentFee(s.consultation_fee);
        setFeeInput(s.consultation_fee ? String(s.consultation_fee) : "");
      })
      .catch(() => {});
  }, []);

  const handleSaveFee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeeError("");
    setFeeSaved(false);
    const fee = parseFloat(feeInput);
    if (isNaN(fee) || fee < 0) return setFeeError(t("admin.financial.fee.error"));
    setSavingFee(true);
    try {
      const res = await updateConsultationFee(token, fee);
      setCurrentFee(res.consultation_fee);
      setFeeSaved(true);
      setTimeout(() => setFeeSaved(false), 2500);
    } catch (err) {
      setFeeError(err instanceof ApiError ? err.message : t("admin.financial.fee.saveError"));
    } finally {
      setSavingFee(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sum, exp] = await Promise.all([
        fetchFinanceSummary(token, start, end),
        fetchExpenses(token, start, end),
      ]);
      setSummary(sum);
      setExpenses(exp);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        onAuthError?.();
        return;
      }
      setError(err instanceof ApiError ? err.message : t("admin.financial.loadError"));
    } finally {
      setLoading(false);
    }
  }, [token, start, end, onAuthError, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpError("");
    const amount = parseFloat(expForm.amount);
    if (!expForm.name.trim()) return setExpError(t("admin.financial.nameError"));
    if (isNaN(amount) || amount < 0) return setExpError(t("admin.financial.amountError"));
    setSavingExpense(true);
    try {
      await createExpense(token, {
        name: expForm.name.trim(),
        category: expForm.category.trim() || "Other",
        amount,
        date: expForm.date,
        notes: expForm.notes.trim() || undefined,
      });
      setExpForm({ name: "", category: EXPENSE_CATEGORIES[0], amount: "", date: localIso(new Date()), notes: "" });
      await load();
    } catch (err) {
      setExpError(err instanceof ApiError ? err.message : t("admin.financial.saveError"));
    } finally {
      setSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    setDeletingExpenseId(id);
    try {
      await deleteExpense(token, id);
      await load();
    } catch {
      /* keep list as-is on failure */
    } finally {
      setDeletingExpenseId(null);
    }
  };

  const currency = summary?.currency ?? "EGP";
  const k = summary?.kpis;

  const presets: { id: Preset; label: string }[] = [
    { id: "today", label: t("admin.financial.filters.today") },
    { id: "week", label: t("admin.financial.filters.week") },
    { id: "month", label: t("admin.financial.filters.month") },
    { id: "m3", label: t("admin.financial.filters.m3") },
    { id: "m6", label: t("admin.financial.filters.m6") },
    { id: "custom", label: t("admin.financial.filters.custom") },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header + date filters ─────────────────────────────────────────── */}
      <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-[#101820] text-[#b99a6b] flex items-center justify-center">
              <CircleDollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-medium text-[#101820]">{t("admin.financial.title")}</h2>
              <p className="text-xs text-[#101820]/50 mt-0.5">{t("admin.financial.subtitle")}</p>
            </div>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f1eb] border border-[#101820]/10 text-xs font-medium text-[#101820]/70 hover:text-[#101820] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("admin.financial.refresh")}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <button
              key={p.id}
              onClick={() => setPreset(p.id)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium uppercase tracking-[0.1em] transition-all ${
                preset === p.id ? "bg-[#101820] text-[#f4f1eb] shadow" : "bg-[#f4f1eb] text-[#101820]/60 hover:text-[#101820]"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
              />
              <span className="text-[#101820]/40 text-xs">→</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                max={localIso(new Date())}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
              />
            </div>
          )}
        </div>
      </div>

      {/* Base consultation fee — the price shown to patients at booking */}
      <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h3 className="font-serif text-lg font-medium text-[#101820] flex items-center gap-2">
            <Banknote className="w-4 h-4 text-[#b99a6b]" /> {t("admin.financial.fee.title")}
          </h3>
          <p className="text-xs text-[#101820]/50 mt-1 max-w-md">{t("admin.financial.fee.subtitle")}</p>
          {currentFee === 0 && <p className="text-[0.7rem] text-amber-700 mt-1.5">{t("admin.financial.fee.notSet")}</p>}
        </div>
        <form onSubmit={handleSaveFee} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">{t("admin.financial.fee.label")}</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={feeInput}
                onChange={(e) => setFeeInput(e.target.value)}
                placeholder="0"
                className="w-32 bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-sm text-[#101820] outline-none focus:border-[#b99a6b]"
              />
              <span className="text-xs text-[#101820]/50">{currency}</span>
            </div>
          </div>
          <button
            type="submit"
            disabled={savingFee}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors disabled:opacity-50"
          >
            {savingFee ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("admin.financial.fee.save")}
          </button>
          {feeSaved && <span className="text-xs text-emerald-700 pb-2.5">{t("admin.financial.fee.saved")}</span>}
        </form>
      </div>
      {feeError && <p className="text-xs text-red-600 -mt-3">{feeError}</p>}

      {error && (
        <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !summary ? (
        <div className="flex items-center justify-center py-24 text-[#101820]/50">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : k ? (
        <>
          {/* ── KPI cards ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi accent="gold" icon={<Banknote className="w-5 h-5" />} label={t("admin.financial.kpi.totalRevenue")} value={money(k.total_revenue, currency)} />
            <Kpi
              accent={k.net_profit >= 0 ? "emerald" : "red"}
              icon={k.net_profit >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              label={t("admin.financial.kpi.netProfit")}
              value={money(k.net_profit, currency)}
            />
            <Kpi accent="amber" icon={<Wallet className="w-5 h-5" />} label={t("admin.financial.kpi.pendingPayments")} value={money(k.pending_payments, currency)} />
            <Kpi accent="red" icon={<Receipt className="w-5 h-5" />} label={t("admin.financial.kpi.totalExpenses")} value={money(k.total_expenses, currency)} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi small icon={<CircleDollarSign className="w-4 h-4" />} label={t("admin.financial.kpi.todayRevenue")} value={money(k.today_revenue, currency)} />
            <Kpi small icon={<CalendarDays className="w-4 h-4" />} label={t("admin.financial.kpi.weekRevenue")} value={money(k.week_revenue, currency)} />
            <Kpi small icon={<CalendarDays className="w-4 h-4" />} label={t("admin.financial.kpi.monthRevenue")} value={money(k.month_revenue, currency)} />
            <Kpi small icon={<Coins className="w-4 h-4" />} label={t("admin.financial.kpi.avgPerPatient")} value={money(k.avg_revenue_per_patient, currency)} />
            <Kpi small icon={<Users className="w-4 h-4" />} label={t("admin.financial.kpi.todayPatients")} value={String(k.today_patients)} />
            <Kpi small icon={<CalendarDays className="w-4 h-4" />} label={t("admin.financial.kpi.todayAppointments")} value={String(k.today_appointments)} />
            <Kpi small icon={<Ban className="w-4 h-4" />} label={t("admin.financial.kpi.cancelled")} value={String(k.cancelled_appointments)} />
            <Kpi
              small
              accent={summary!.range.net_profit >= 0 ? "emerald" : "red"}
              icon={summary!.range.net_profit >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              label={t("admin.financial.kpi.periodProfit")}
              value={money(summary!.range.net_profit, currency)}
            />
          </div>

          {/* ── Charts row ─────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="font-serif text-lg font-medium text-[#101820]">{t("admin.financial.charts.revenueOverTime")}</h3>
                <div className="flex items-center gap-4 text-[0.7rem] text-[#101820]/60">
                  <Legend color={GOLD} label={t("admin.financial.charts.revenueLegend")} />
                  <Legend color={EXPENSE} label={t("admin.financial.charts.expensesLegend")} line />
                </div>
              </div>
              <RevenueChart data={summary!.revenue_series} currency={currency} emptyLabel={t("admin.financial.charts.noData")} />
            </div>

            <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
              <h3 className="font-serif text-lg font-medium text-[#101820] mb-4">{t("admin.financial.charts.paidVsPending")}</h3>
              <Donut
                paid={summary!.payments_breakdown.paid}
                pending={summary!.payments_breakdown.pending}
                currency={currency}
                paidLabel={t("admin.financial.charts.paid")}
                pendingLabel={t("admin.financial.charts.pending")}
                emptyLabel={t("admin.financial.charts.noData")}
              />
            </div>
          </div>

          {/* ── Analytics + expenses breakdown ─────────────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="font-serif text-lg font-medium text-[#101820]">{t("admin.financial.charts.apptAnalytics")}</h3>
                <div className="flex items-center gap-4 text-[0.7rem] text-[#101820]/60">
                  <Legend color={INK} label={t("admin.financial.charts.apptLegend")} />
                  <Legend color={GOLD} label={t("admin.financial.charts.patientsLegend")} />
                </div>
              </div>
              <GroupedBars data={summary!.appointments_series} emptyLabel={t("admin.financial.charts.noData")} />
            </div>

            <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
              <h3 className="font-serif text-lg font-medium text-[#101820] mb-4">{t("admin.financial.charts.expensesByCategory")}</h3>
              <CategoryBars data={summary!.expenses_by_category} currency={currency} emptyLabel={t("admin.financial.charts.noExpenses")} />
            </div>
          </div>

          {/* ── Expense tracking ───────────────────────────────────────────── */}
          <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
            <h3 className="font-serif text-lg font-medium text-[#101820] mb-4 flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#b99a6b]" /> {t("admin.financial.expenses.title")}
            </h3>
            <form onSubmit={handleAddExpense} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div className="lg:col-span-2">
                <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">{t("admin.financial.expenses.name")}</label>
                <input
                  value={expForm.name}
                  onChange={(e) => setExpForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={t("admin.financial.expenses.namePlaceholder")}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                />
              </div>
              <div>
                <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">{t("admin.financial.expenses.category")}</label>
                <input
                  list="expense-categories"
                  value={expForm.category}
                  onChange={(e) => setExpForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                />
                <datalist id="expense-categories">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">{t("admin.financial.expenses.amount")} ({currency})</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={expForm.amount}
                  onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                />
              </div>
              <div>
                <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">{t("admin.financial.expenses.date")}</label>
                <input
                  type="date"
                  value={expForm.date}
                  onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                />
              </div>
              <button
                type="submit"
                disabled={savingExpense}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.12em] hover:bg-[#101820]/85 transition-colors disabled:opacity-50"
              >
                {savingExpense ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 text-[#b99a6b]" />}
                {t("admin.financial.expenses.add")}
              </button>
              <div className="lg:col-span-6">
                <input
                  value={expForm.notes}
                  onChange={(e) => setExpForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder={t("admin.financial.expenses.notesPlaceholder")}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                />
              </div>
            </form>
            {expError && <p className="mt-2 text-xs text-red-600">{expError}</p>}

            {/* Expense list for the selected range */}
            <div className="mt-5 divide-y divide-[#101820]/5">
              {expenses.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#101820]/50">{t("admin.financial.expenses.empty")}</p>
              ) : (
                expenses.map((ex) => (
                  <div key={ex.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-[#101820] truncate">{ex.name}</span>
                        <span className="shrink-0 text-[0.62rem] uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#f4f1eb] border border-[#101820]/10 text-[#101820]/60">{ex.category}</span>
                      </div>
                      <div className="text-[0.7rem] text-[#101820]/45 mt-0.5 flex items-center gap-2">
                        <span>{ex.date}</span>
                        {ex.notes && <span className="truncate italic">· {ex.notes}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm font-medium text-[#b3452f]">− {money(ex.amount, currency)}</span>
                      <button
                        onClick={() => handleDeleteExpense(ex.id)}
                        disabled={deletingExpenseId === ex.id}
                        title={t("admin.financial.expenses.delete")}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* ── Recent transactions ────────────────────────────────────────── */}
          <div className="bg-white border border-[#101820]/10 rounded-2xl shadow-sm overflow-hidden">
            <h3 className="font-serif text-lg font-medium text-[#101820] p-5 pb-3">{t("admin.financial.transactions.title")}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse" dir={dir}>
                <thead>
                  <tr className="border-y border-[#101820]/10 bg-[#f4f1eb]/50 text-[0.62rem] font-medium uppercase tracking-[0.15em] text-[#101820]/50">
                    <th className="py-3 px-5">{t("admin.financial.transactions.date")}</th>
                    <th className="py-3 px-5">{t("admin.financial.transactions.description")}</th>
                    <th className="py-3 px-5">{t("admin.financial.transactions.type")}</th>
                    <th className="py-3 px-5 text-end">{t("admin.financial.transactions.amount")}</th>
                    <th className="py-3 px-5">{t("admin.financial.transactions.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#101820]/5 text-sm">
                  {summary!.recent_transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-xs text-[#101820]/50">{t("admin.financial.transactions.empty")}</td>
                    </tr>
                  ) : (
                    summary!.recent_transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-[#f4f1eb]/40 transition-colors">
                        <td className="py-3 px-5 text-xs text-[#101820]/70 whitespace-nowrap">{tx.date}</td>
                        <td className="py-3 px-5">
                          <div className="font-medium text-[#101820]">{tx.title}</div>
                          {tx.subtitle && <div className="text-[0.7rem] text-[#101820]/50">{tx.subtitle}</div>}
                        </td>
                        <td className="py-3 px-5">
                          <span
                            className={`inline-flex items-center gap-1 text-[0.68rem] font-medium px-2.5 py-1 rounded-lg border ${
                              tx.kind === "revenue"
                                ? "bg-[#b99a6b]/15 border-[#b99a6b]/40 text-[#8a6d3f]"
                                : "bg-[#b3452f]/10 border-[#b3452f]/30 text-[#b3452f]"
                            }`}
                          >
                            {tx.kind === "revenue" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {tx.kind === "revenue" ? t("admin.financial.transactions.revenueType") : t("admin.financial.transactions.expenseType")}
                          </span>
                        </td>
                        <td className={`py-3 px-5 text-end font-mono font-medium whitespace-nowrap ${tx.amount >= 0 ? "text-emerald-700" : "text-[#b3452f]"}`}>
                          {tx.amount >= 0 ? "+" : "−"} {money(Math.abs(tx.amount), currency)}
                        </td>
                        <td className="py-3 px-5">
                          <span
                            className={`text-[0.68rem] font-medium px-2.5 py-1 rounded-full ${
                              tx.status === "paid" ? "bg-emerald-500/15 text-emerald-800" : "bg-amber-500/15 text-amber-800"
                            }`}
                          >
                            {tx.status === "paid" ? t("admin.financial.transactions.paid") : t("admin.financial.transactions.pending")}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[0.7rem] text-[#101820]/40 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            {t("admin.financial.note")}
          </p>
        </>
      ) : null}
    </div>
  );
}

// ── Small building blocks ───────────────────────────────────────────────────
function Kpi({
  label,
  value,
  icon,
  accent = "ink",
  small = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: "gold" | "emerald" | "amber" | "red" | "ink";
  small?: boolean;
}) {
  const accents: Record<string, string> = {
    gold: "text-[#b99a6b]",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    red: "text-[#b3452f]",
    ink: "text-[#101820]/50",
  };
  const valueAccents: Record<string, string> = {
    gold: "text-[#101820]",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-[#b3452f]",
    ink: "text-[#101820]",
  };
  return (
    <div className="bg-white border border-[#101820]/10 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.62rem] font-medium uppercase tracking-[0.14em] text-[#101820]/50">{label}</span>
        <span className={accents[accent]}>{icon}</span>
      </div>
      <div className={`font-serif ${small ? "text-xl" : "text-2xl"} font-medium ${valueAccents[accent]} tabular-nums`}>{value}</div>
    </div>
  );
}

function Legend({ color, label, line = false }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block rounded" style={line ? { width: 14, height: 2, background: color } : { width: 10, height: 10, background: color }} />
      {label}
    </span>
  );
}

// ── Revenue over time: bars (revenue) + line (expenses) ─────────────────────
function RevenueChart({ data, currency, emptyLabel }: { data: { label: string; revenue: number; expenses: number }[]; currency: string; emptyLabel: string }) {
  const W = 720;
  const H = 240;
  const padL = 56;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const max = Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expenses)));
  const niceMax = niceCeil(max);
  const n = data.length || 1;
  const step = chartW / n;
  const barW = Math.max(2, Math.min(28, step * 0.55));
  const y = (v: number) => padT + chartH - (v / niceMax) * chartH;
  const cx = (i: number) => padL + step * i + step / 2;

  const total = data.reduce((s, d) => s + d.revenue + d.expenses, 0);
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);
  const labelEvery = Math.ceil(n / 8);

  if (total === 0) return <EmptyChart label={emptyLabel} />;

  return (
    <div dir="ltr" className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#101820" strokeOpacity={0.07} />
            <text x={padL - 8} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#101820" fillOpacity={0.45}>
              {compact(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <rect key={i} x={cx(i) - barW / 2} y={y(d.revenue)} width={barW} height={Math.max(0, padT + chartH - y(d.revenue))} rx={2} fill={GOLD}>
            <title>{`${shortLabel(d.label)} · ${money(d.revenue, currency)}`}</title>
          </rect>
        ))}
        <polyline
          fill="none"
          stroke={EXPENSE}
          strokeWidth={2}
          strokeLinejoin="round"
          points={data.map((d, i) => `${cx(i)},${y(d.expenses)}`).join(" ")}
        />
        {data.map((d, i) => (
          <circle key={i} cx={cx(i)} cy={y(d.expenses)} r={2.5} fill={EXPENSE}>
            <title>{`${shortLabel(d.label)} · ${money(d.expenses, currency)}`}</title>
          </circle>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={cx(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#101820" fillOpacity={0.45}>
              {shortLabel(d.label)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// ── Grouped bars: appointments + patients ───────────────────────────────────
function GroupedBars({ data, emptyLabel }: { data: { label: string; appointments: number; patients: number }[]; emptyLabel: string }) {
  const W = 560;
  const H = 220;
  const padL = 34;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;
  const max = Math.max(1, ...data.map((d) => Math.max(d.appointments, d.patients)));
  const niceMax = niceCeil(max);
  const n = data.length || 1;
  const step = chartW / n;
  const bw = Math.max(2, Math.min(12, (step * 0.6) / 2));
  const y = (v: number) => padT + chartH - (v / niceMax) * chartH;
  const gx = (i: number) => padL + step * i + step / 2;
  const total = data.reduce((s, d) => s + d.appointments + d.patients, 0);
  const gridVals = [0, 0.5, 1].map((f) => f * niceMax);
  const labelEvery = Math.ceil(n / 7);

  if (total === 0) return <EmptyChart label={emptyLabel} />;

  return (
    <div dir="ltr" className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: "auto" }} role="img">
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#101820" strokeOpacity={0.07} />
            <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#101820" fillOpacity={0.45}>
              {Math.round(v)}
            </text>
          </g>
        ))}
        {data.map((d, i) => (
          <g key={i}>
            <rect x={gx(i) - bw - 1} y={y(d.appointments)} width={bw} height={Math.max(0, padT + chartH - y(d.appointments))} rx={1.5} fill={INK}>
              <title>{`${shortLabel(d.label)} · ${d.appointments}`}</title>
            </rect>
            <rect x={gx(i) + 1} y={y(d.patients)} width={bw} height={Math.max(0, padT + chartH - y(d.patients))} rx={1.5} fill={GOLD}>
              <title>{`${shortLabel(d.label)} · ${d.patients}`}</title>
            </rect>
          </g>
        ))}
        {data.map((d, i) =>
          i % labelEvery === 0 ? (
            <text key={i} x={gx(i)} y={H - 9} textAnchor="middle" fontSize="9" fill="#101820" fillOpacity={0.45}>
              {shortLabel(d.label)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

// ── Paid vs pending donut ───────────────────────────────────────────────────
function Donut({
  paid,
  pending,
  currency,
  paidLabel,
  pendingLabel,
  emptyLabel,
}: {
  paid: number;
  pending: number;
  currency: string;
  paidLabel: string;
  pendingLabel: string;
  emptyLabel: string;
}) {
  const total = paid + pending;
  const r = 52;
  const c = 2 * Math.PI * r;
  const paidFrac = total > 0 ? paid / total : 0;
  const pct = (f: number) => `${Math.round(f * 100)}%`;

  return (
    <div className="flex flex-col items-center gap-4">
      <div dir="ltr" className="relative">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} fill="none" stroke="#101820" strokeOpacity={0.08} strokeWidth="16" />
          {total > 0 && (
            <>
              <circle
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={GOLD}
                strokeWidth="16"
                strokeDasharray={`${paidFrac * c} ${c}`}
                strokeDashoffset={c / 4}
                transform="rotate(-90 70 70)"
                strokeLinecap="butt"
              />
              <circle
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke="#d97706"
                strokeWidth="16"
                strokeDasharray={`${(1 - paidFrac) * c} ${c}`}
                strokeDashoffset={c / 4 - paidFrac * c}
                transform="rotate(-90 70 70)"
                strokeLinecap="butt"
              />
            </>
          )}
          <text x="70" y="66" textAnchor="middle" fontSize="11" fill="#101820" fillOpacity={0.5}>
            {total > 0 ? pct(paidFrac) : ""}
          </text>
          <text x="70" y="82" textAnchor="middle" fontSize="9" fill="#101820" fillOpacity={0.4}>
            {total > 0 ? paidLabel : emptyLabel}
          </text>
        </svg>
      </div>
      <div className="w-full space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-[#101820]/70">
            <span className="w-3 h-3 rounded" style={{ background: GOLD }} /> {paidLabel}
          </span>
          <span className="font-mono font-medium text-[#101820]">{money(paid, currency)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="inline-flex items-center gap-2 text-[#101820]/70">
            <span className="w-3 h-3 rounded" style={{ background: "#d97706" }} /> {pendingLabel}
          </span>
          <span className="font-mono font-medium text-amber-700">{money(pending, currency)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Expenses by category (horizontal bars) ──────────────────────────────────
function CategoryBars({ data, currency, emptyLabel }: { data: { category: string; amount: number }[]; currency: string; emptyLabel: string }) {
  if (data.length === 0) return <div className="py-10"><EmptyChart label={emptyLabel} /></div>;
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="space-y-3">
      {data.map((d) => (
        <div key={d.category}>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[#101820]/70 font-medium">{d.category}</span>
            <span className="font-mono text-[#101820]/80">{money(d.amount, currency)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-[#f4f1eb] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.amount / max) * 100}%`, background: GOLD }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[200px] text-xs text-[#101820]/40">
      {label}
    </div>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

function compact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(Math.round(v));
}
