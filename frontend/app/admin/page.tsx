"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  User,
  Phone,
  Mail,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Search,
  Plus,
  RefreshCw,
  LogOut,
  Trash2,
  Eye,
  Check,
  ShieldCheck,
  Building2,
  Sparkles,
  X,
  PhoneCall,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  CalendarDays,
  FileText,
  CreditCard,
  Wallet,
  UserCheck,
  UserX,
  Stethoscope,
  CalendarClock,
  Receipt,
  ClipboardList,
} from "lucide-react";
import {
  ApiError,
  Booking,
  BookingStatus,
  Branch,
  getToken,
  loginAdmin,
  removeToken,
  fetchBookings,
  fetchPatientBookings,
  updateBookingStatus,
  updateArrivalStatus,
  updateConsultationHintDismissed,
  updateExtraCharge,
  deleteBooking,
  submitBooking,
  fetchCurrentUser,
  getClinicSchedule,
  listBranches,
} from "@/lib/api";
import { TREATMENT_OPTIONS, SERVICE_OPTIONS, CONSULTATION_SERVICE } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { FinancialDashboard } from "@/components/admin/FinancialDashboard";
import { MedicalRecords } from "@/components/admin/MedicalRecords";
import { ClinicSettings } from "@/components/admin/ClinicSettings";

/** A booking is a consultation when the backend tagged its service type. */
const isConsultation = (b: Booking) => b.service_type === "consultation";

/** Month select options, English label with the Arabic name in parens. */
const MONTH_NAMES = [
  { value: "01", label: "January (يناير)" },
  { value: "02", label: "February (فبراير)" },
  { value: "03", label: "March (مارس)" },
  { value: "04", label: "April (أبريل)" },
  { value: "05", label: "May (مايو)" },
  { value: "06", label: "June (يونيو)" },
  { value: "07", label: "July (يوليو)" },
  { value: "08", label: "August (أغسطس)" },
  { value: "09", label: "September (سبتمبر)" },
  { value: "10", label: "October (أكتوبر)" },
  { value: "11", label: "November (نوفمبر)" },
  { value: "12", label: "December (ديسمبر)" },
];

/**
 * Local calendar date as YYYY-MM-DD. `Date#toISOString()` reports the UTC
 * date, which drifts a day off from the local calendar near midnight in any
 * timezone ahead of UTC (e.g. Egypt, UTC+2/+3) — that mismatch is what made
 * "Today" land on the wrong day.
 */
const toLocalIso = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/**
 * Let a plain mouse wheel page a horizontally-scrolling pill strip sideways.
 * React attaches its synthetic onWheel as a passive listener, so
 * preventDefault() there is silently ignored by the browser and the page
 * scrolls vertically at the same time — a native, explicitly non-passive
 * listener is required to actually suppress that page scroll. `active`
 * gates it to only the currently-visible strip (the ref's element doesn't
 * exist while its tab is hidden).
 */
function useWheelHorizontalScroll(ref: React.RefObject<HTMLDivElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [ref, active]);
}

/** Digits only, for tolerant phone comparison. */
const digitsOf = (s?: string | null) => (s || "").replace(/\D/g, "");

/**
 * Do two phone numbers belong to the same patient? Patients have no account,
 * so the phone is the identity key. Tolerant of country-code / leading-zero
 * differences (e.g. "01552007412" vs "+201552007412") by matching on a
 * common suffix once both have enough significant digits.
 */
const phonesMatch = (a?: string | null, b?: string | null) => {
  const x = digitsOf(a);
  const y = digitsOf(b);
  if (x.length < 7 || y.length < 7) return false;
  return x === y || x.endsWith(y) || y.endsWith(x);
};

/** Render the queue-based arrival window as the appointment "time", or a
 *  neutral placeholder when the backend hasn't computed one. */
function formatEstimatedTime(b: Booking): string {
  const fmt = (iso?: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return null;
    }
  };
  const a = fmt(b.estimated_arrival_start);
  const z = fmt(b.estimated_arrival_end);
  if (!a || !z) return "Queue-based";
  return a === z ? a : `${a} – ${z}`;
}

/** Short, safe formatter for the created-at timestamp. */
function formatCreatedAt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function AdminPage() {
  const { t, locale } = useLanguage();
  const [token, setTokenState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Auth form state
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dashboard view mode: "agenda" (Day view), "table" (All bookings) or
  // "consultations" (only consultation requests, across all days).
  const [viewMode, setViewMode] = useState<
    "agenda" | "table" | "consultations" | "financial" | "records" | "branches"
  >("agenda");

  // Only the ADMIN role may manage clinic branches or see Financial/Records —
  // fetched once per login so those tabs aren't shown to staff accounts that
  // would just get a 403 from the underlying API anyway. Staff only ever see
  // Day Agenda, All Bookings, and Consultations, and — since bookings are now
  // stamped with the branch they were made at — the backend automatically
  // scopes what a branch-assigned staff account can see to that branch alone.
  // branchName is shown next to a staff account's name as a reminder of
  // which branch they're logging in for.
  const [userRole, setUserRole] = useState<string | null>(null);
  const [branchName, setBranchName] = useState<string | null>(null);
  const [currentUserBranchId, setCurrentUserBranchId] = useState<number | null>(null);
  const isAdmin = userRole === "admin";

  // Admin-only branch switcher for Day Agenda / All Bookings / Consultations
  // — "" means all branches. Staff don't get this control since they're
  // already locked server-side to their own branch.
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchFilter, setBranchFilter] = useState("");

  // How many days a completed consultation stays "live" for the "has
  // consultation" follow-up reminder — configured in Clinic Settings.
  const [consultationValidityDays, setConsultationValidityDays] = useState(14);

  // Selected Date for Agenda View (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(toLocalIso());

  // First day shown in the Day Agenda's 7-day pill strip — a rolling window
  // that starts on today by default. Independent from `selectedDate` so
  // picking a day mid-strip doesn't reshuffle which 7 days are visible; only
  // the arrow buttons move this.
  const [weekAnchor, setWeekAnchor] = useState<string>(toLocalIso());

  // Month & Year Filter States (for reviewing past month/year records)
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // "all", "01".."12"
  const [selectedYear, setSelectedYear] = useState<string>("all");   // "all", "2024".."2027"
  const [datePreset, setDatePreset] = useState<string>("all");       // "all", "today", "this_month", "last_month", "this_year"

  // All Bookings table: once a specific month + year are picked, this narrows
  // further to one day of that month (click a day pill to filter, click it
  // again to go back to the whole month).
  const [selectedTableDay, setSelectedTableDay] = useState<string | null>(null);

  // Refresh feedback state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState(false);

  // Day Agenda week pill bar — shows 7 days starting at `weekAnchor`; the
  // arrow buttons page the whole window forward/back a week, and jump the
  // active day to the new window's first day so the highlighted pill and
  // the visible strip never fall out of sync.
  const dayPillsScrollRef = useRef<HTMLDivElement>(null);
  const shiftWeek = (direction: "prev" | "next") => {
    const [y, m, d] = weekAnchor.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + (direction === "prev" ? -7 : 7));
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setWeekAnchor(iso);
    setSelectedDate(iso);
  };

  useWheelHorizontalScroll(dayPillsScrollRef, viewMode === "agenda");

  // All Bookings table: day-pill strip for the selected month/year.
  const tableDayPillsScrollRef = useRef<HTMLDivElement>(null);
  useWheelHorizontalScroll(tableDayPillsScrollRef, viewMode === "table");

  const tableDaysPills = useMemo(() => {
    if (selectedMonth === "all" || selectedYear === "all") return [];
    const year = parseInt(selectedYear, 10);
    const month = parseInt(selectedMonth, 10) - 1;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayIso = toLocalIso();
    const result = [];

    const dateLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-US"; // -u-nu-latn: keep Western digits
    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month, day);
      result.push({
        iso: toLocalIso(dateObj),
        day,
        dayName: dateObj.toLocaleDateString(dateLocale, { weekday: "short" }),
        isToday: toLocalIso(dateObj) === todayIso,
      });
    }
    return result;
  }, [selectedMonth, selectedYear, locale]);

  // Dashboard data state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Patient Record modal: the selected patient's full visit history, pulled
  // from the backend by phone number (not filtered client-side out of
  // whatever page of `bookings` happens to be loaded — phone is the
  // authoritative identity key, and this must never miss older visits).
  const [patientVisits, setPatientVisits] = useState<Booking[]>([]);
  const [isLoadingPatientVisits, setIsLoadingPatientVisits] = useState(false);
  const [patientVisitsError, setPatientVisitsError] = useState("");

  // New booking form state (queue number is assigned automatically by the backend)
  const [newForm, setNewForm] = useState<{
    full_name: string;
    phone: string;
    email: string;
    treatment: string;
    date: string;
    message: string;
  }>({
    full_name: "",
    phone: "",
    email: "",
    treatment: TREATMENT_OPTIONS[0],
    date: toLocalIso(),
    message: "",
  });
  const [newFormError, setNewFormError] = useState("");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

  // Arrival status update state (staff "Mark as Entered" control)
  const [arrivalUpdatingId, setArrivalUpdatingId] = useState<number | null>(null);
  const [arrivalError, setArrivalError] = useState("");

  // Extra charge state (staff add a charge on top of the base appointment —
  // e.g. a crown/filling done during or after the exam).
  const [editingExtraChargeId, setEditingExtraChargeId] = useState<number | null>(null);
  const [extraChargeDraft, setExtraChargeDraft] = useState({ amount: "", description: "", paid: false });
  const [extraChargeSavingId, setExtraChargeSavingId] = useState<number | null>(null);
  const [extraChargeError, setExtraChargeError] = useState("");

  // Check saved token on mount
  useEffect(() => {
    setMounted(true);
    const savedToken = getToken();
    if (savedToken) {
      setTokenState(savedToken);
    }
  }, []);

  // Fetch bookings when token is present, and again whenever the admin
  // switches which branch they're viewing.
  useEffect(() => {
    if (token) {
      loadBookings();
    }
  }, [token, branchFilter]);

  // Who's logged in — gates the ADMIN-only tabs and surfaces a staff
  // account's branch in the header.
  useEffect(() => {
    if (!token) {
      setUserRole(null);
      setBranchName(null);
      setCurrentUserBranchId(null);
      return;
    }
    fetchCurrentUser(token)
      .then((user) => {
        setUserRole(user.role);
        setBranchName(user.branch_name ?? null);
        setCurrentUserBranchId(user.branch_id ?? null);
      })
      .catch(() => {
        setUserRole(null);
        setBranchName(null);
        setCurrentUserBranchId(null);
      });
  }, [token]);

  // Belt-and-suspenders: if a staff account somehow lands on an admin-only
  // view (e.g. their role loads after the tab was already selected), bounce
  // back to the agenda instead of rendering a view they can't actually use.
  useEffect(() => {
    if (userRole && !isAdmin && (viewMode === "financial" || viewMode === "branches" || viewMode === "records")) {
      setViewMode("agenda");
    }
  }, [userRole, isAdmin, viewMode]);

  // Consultation validity window, for the "has consultation" reminder logic.
  useEffect(() => {
    if (!token) return;
    getClinicSchedule()
      .then((schedule) => setConsultationValidityDays(schedule.consultation_validity_days))
      .catch(() => {});
  }, [token]);

  // Branch list for the admin's branch switcher — staff don't need it, they
  // can only ever see their own branch anyway.
  useEffect(() => {
    if (!token || !isAdmin) return;
    listBranches(token)
      .then(setBranches)
      .catch(() => {});
  }, [token, isAdmin]);

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      const activeToken = token || "";
      const data = await fetchBookings(activeToken, branchFilter ? Number(branchFilter) : undefined);
      setBookings(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        removeToken();
        setTokenState(null);
        setAuthError(t("admin.login.sessionExpired"));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Pull the selected patient's full record by phone whenever the Patient
  // Record modal opens for a (possibly different) booking.
  useEffect(() => {
    if (!selectedBooking) return;
    let cancelled = false;
    setIsLoadingPatientVisits(true);
    setPatientVisitsError("");
    fetchPatientBookings(token || "", selectedBooking.phone)
      .then((visits) => {
        if (!cancelled) setPatientVisits(visits);
      })
      .catch((err) => {
        if (!cancelled) {
          setPatientVisitsError(
            err instanceof ApiError ? err.message : "Could not load this patient's record."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPatientVisits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBooking?.id, selectedBooking?.phone, token]);

  // Keep every place a booking is shown in sync after a mutation: the main
  // list, the currently open Patient Record modal's history, and the
  // selected booking itself (if any of those currently reference it).
  const applyBookingUpdate = (updated: Booking) => {
    setBookings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setPatientVisits((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelectedBooking((prev) => (prev && prev.id === updated.id ? updated : prev));
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await loadBookings();
    setIsRefreshing(false);
    setRefreshToast(true);
    setTimeout(() => setRefreshToast(false), 2500);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setIsLoggingIn(true);
    try {
      const tokenReceived = await loginAdmin(username, password);
      setTokenState(tokenReceived);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setAuthError(err.message);
      } else {
        setAuthError("Failed to sign in");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    removeToken();
    setTokenState(null);
    setBookings([]);
  };

  // A booking as currently known locally, wherever it's cached — the main
  // list, the open Patient Record modal's history, or the selected booking
  // itself — used to build an optimistic update before the server confirms.
  const findKnownBooking = (id: number): Booking | undefined =>
    bookings.find((b) => b.id === id) ||
    patientVisits.find((b) => b.id === id) ||
    (selectedBooking?.id === id ? selectedBooking : undefined);

  const handleStatusChange = async (bookingId: number, newStatus: BookingStatus) => {
    const current = findKnownBooking(bookingId);
    if (current) applyBookingUpdate({ ...current, status: newStatus }); // Optimistic

    try {
      await updateBookingStatus(token || "", bookingId, newStatus);
    } catch {
      loadBookings(); // Rollback if error
    }
  };

  const handleDelete = async (bookingId: number) => {
    if (!confirm("Are you sure you want to delete this booking record?")) return;
    setDeletingId(bookingId);
    try {
      await deleteBooking(token || "", bookingId);
      setBookings((prev) => prev.filter((b) => b.id !== bookingId));
      setPatientVisits((prev) => prev.filter((b) => b.id !== bookingId));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateNewBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newForm.full_name.trim() || !newForm.phone.trim() || !newForm.date) {
      setNewFormError(t("admin.newBooking.formError"));
      return;
    }

    setIsSubmittingNew(true);
    setNewFormError("");
    try {
      // Stamp the walk-in with a branch up front — staff are locked to their
      // own branch's bookings server-side, so a walk-in created without one
      // would silently vanish from their own list right after "succeeding".
      // Admin gets whichever branch they're currently filtered to, if any.
      const walkInBranchId = !isAdmin ? currentUserBranchId : branchFilter ? Number(branchFilter) : undefined;
      await submitBooking({
        full_name: newForm.full_name,
        phone: newForm.phone,
        email: newForm.email || undefined,
        treatment: newForm.treatment,
        service_type: newForm.treatment === CONSULTATION_SERVICE ? "consultation" : "treatment",
        date: newForm.date,
        message: newForm.message || undefined,
        payment_method: "clinic",
        branch_id: walkInBranchId ?? undefined,
      });

      // Refetch instead of appending: the public booking endpoint only
      // returns the patient-facing confirmation shape (no phone/email/etc),
      // so the full authoritative record — including its assigned queue
      // number — comes from the staff list endpoint.
      await loadBookings();
      setShowNewModal(false);
      setNewForm({
        full_name: "",
        phone: "",
        email: "",
        treatment: TREATMENT_OPTIONS[0],
        date: selectedDate,
        message: "",
      });
    } catch (err) {
      setNewFormError(err instanceof ApiError ? err.message : t("admin.newBooking.createError"));
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const todayIso = () => toLocalIso();

  const canMarkEntered = (b: Booking) => b.date === todayIso() && b.status !== "cancelled";

  const handleToggleArrival = async (b: Booking) => {
    setArrivalError("");
    setArrivalUpdatingId(b.id);
    const nextArrived = !b.patient_arrived;
    try {
      const updated = await updateArrivalStatus(token || "", b.id, nextArrived);
      applyBookingUpdate(updated);
    } catch (err) {
      setArrivalError(
        err instanceof ApiError ? err.message : "Could not update arrival status."
      );
    } finally {
      setArrivalUpdatingId(null);
    }
  };

  // Show / hide the "patient also has a consultation" reminder on a completed
  // exam. `dismissed=true` hides it, `false` brings it back. Optimistic update
  // (the memo reflects it → badge appears/vanishes), then persists; rolls back
  // by refetching on failure.
  const handleSetConsultationHint = async (bookingId: number, dismissed: boolean) => {
    const current = findKnownBooking(bookingId);
    if (current) applyBookingUpdate({ ...current, consultation_hint_dismissed: dismissed });
    try {
      await updateConsultationHintDismissed(token || "", bookingId, dismissed);
    } catch {
      loadBookings();
    }
  };

  // Extra charge (crown, filling, or any add-on work billed on top of the
  // base appointment) — staff open the inline editor from the agenda card,
  // the table, or the patient record modal, all sharing this one draft.
  const startEditExtraCharge = (b: Booking) => {
    setEditingExtraChargeId(b.id);
    setExtraChargeDraft({
      amount: b.extra_charge_amount ? String(b.extra_charge_amount) : "",
      description: b.extra_charge_description || "",
      paid: b.extra_charge_paid || false,
    });
    setExtraChargeError("");
  };

  const cancelEditExtraCharge = () => {
    setEditingExtraChargeId(null);
    setExtraChargeError("");
  };

  const handleSaveExtraCharge = async (bookingId: number) => {
    const amount = parseFloat(extraChargeDraft.amount);
    if (isNaN(amount) || amount < 0) {
      setExtraChargeError(t("admin.extraCharge.amountError"));
      return;
    }
    setExtraChargeSavingId(bookingId);
    setExtraChargeError("");
    try {
      const updated = await updateExtraCharge(token || "", bookingId, {
        amount,
        description: extraChargeDraft.description.trim() || undefined,
        paid: extraChargeDraft.paid,
      });
      applyBookingUpdate(updated);
      setEditingExtraChargeId(null);
    } catch (err) {
      setExtraChargeError(err instanceof ApiError ? err.message : t("admin.extraCharge.saveError"));
    } finally {
      setExtraChargeSavingId(null);
    }
  };

  const handleRemoveExtraCharge = async (bookingId: number) => {
    setExtraChargeSavingId(bookingId);
    setExtraChargeError("");
    try {
      const updated = await updateExtraCharge(token || "", bookingId, {
        amount: 0,
        description: undefined,
        paid: false,
      });
      applyBookingUpdate(updated);
      setEditingExtraChargeId(null);
    } catch (err) {
      setExtraChargeError(err instanceof ApiError ? err.message : t("admin.extraCharge.removeError"));
    } finally {
      setExtraChargeSavingId(null);
    }
  };

  /** Small badge shown wherever a booking is listed — null when no extra
   *  charge has been set (the common case), so callers can render it inline. */
  const renderExtraChargeBadge = (b: Booking) => {
    if (!b.extra_charge_amount || b.extra_charge_amount <= 0) return null;
    return (
      <span
        title={b.extra_charge_description || undefined}
        className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium border ${
          b.extra_charge_paid
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
            : "bg-red-500/10 border-red-500/30 text-red-700"
        }`}
      >
        <Receipt className="w-3.5 h-3.5" />
        +{b.extra_charge_amount.toLocaleString()} EGP · {b.extra_charge_paid ? t("admin.extraCharge.badgePaid") : t("admin.extraCharge.badgeUnpaid")}
      </span>
    );
  };

  /** Inline add/edit form for the extra charge — rendered under a booking
   *  card/row only while it's the one being edited. */
  const renderExtraChargePanel = (b: Booking) => {
    if (editingExtraChargeId !== b.id) return null;
    const saving = extraChargeSavingId === b.id;
    return (
      <div className="p-4 rounded-2xl bg-[#f4f1eb] border border-[#b99a6b]/30 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#101820] uppercase tracking-wider">
          <span className="flex items-center justify-center h-6 w-6 rounded-lg bg-[#b99a6b]/20 text-[#b99a6b]">
            <Receipt className="w-3.5 h-3.5" />
          </span>
          {t("admin.extraCharge.panelTitle")}
          <span className="font-normal normal-case tracking-normal text-[#101820]/50">
            {t("admin.extraCharge.panelSubtitle")}
          </span>
        </div>
        {extraChargeError && (
          <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {extraChargeError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_9rem] gap-3">
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
              {t("admin.extraCharge.amountLabel")}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraChargeDraft.amount}
                onChange={(e) => setExtraChargeDraft((d) => ({ ...d, amount: e.target.value }))}
                placeholder="0"
                className="w-full bg-white border border-[#101820]/15 rounded-xl pl-3 pr-11 rtl:pl-11 rtl:pr-3 py-2 text-sm font-medium text-[#101820] outline-none focus:border-[#b99a6b]"
              />
              <span className="absolute right-3 rtl:right-auto rtl:left-3 top-1/2 -translate-y-1/2 text-[0.65rem] font-medium text-[#101820]/40">
                EGP
              </span>
            </div>
          </div>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
              {t("admin.extraCharge.whatForLabel")}
            </label>
            <input
              type="text"
              value={extraChargeDraft.description}
              onChange={(e) => setExtraChargeDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder={t("admin.extraCharge.whatForPlaceholder")}
              className="w-full bg-white border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
            />
          </div>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
              {t("admin.extraCharge.statusLabel")}
            </label>
            <label className="flex items-center gap-2 h-[calc(100%-0px)] px-3 py-2 rounded-xl bg-white border border-[#101820]/15 text-xs text-[#101820] cursor-pointer">
              <input
                type="checkbox"
                checked={extraChargeDraft.paid}
                onChange={(e) => setExtraChargeDraft((d) => ({ ...d, paid: e.target.checked }))}
                className="accent-[#b99a6b] w-3.5 h-3.5"
              />
              {t("admin.extraCharge.paidAlready")}
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => handleSaveExtraCharge(b.id)}
            disabled={saving}
            className="px-4 py-1.5 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors disabled:opacity-50"
          >
            {saving ? t("admin.extraCharge.saving") : t("admin.extraCharge.save")}
          </button>
          {typeof b.extra_charge_amount === "number" && b.extra_charge_amount > 0 && (
            <button
              onClick={() => handleRemoveExtraCharge(b.id)}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-red-500/10 text-red-700 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {t("admin.extraCharge.remove")}
            </button>
          )}
          <button
            onClick={cancelEditExtraCharge}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-[#101820]/15 text-[#101820]/70 text-xs font-medium hover:bg-[#101820]/5 transition-colors"
          >
            {t("admin.extraCharge.cancel")}
          </button>
        </div>
      </div>
    );
  };

  // ── Medical record (diagnosis / prescription / follow-up / history) ────────
  const hasMedicalRecord = (b: Booking) =>
    !!(
      b.diagnosis ||
      b.prescription ||
      b.chronic_conditions ||
      b.current_medications ||
      b.follow_up_needed ||
      b.follow_up_notes
    );

  const renderRecordBadge = (b: Booking) => {
    if (!hasMedicalRecord(b)) return null;
    return (
      <span
        title={b.diagnosis || undefined}
        className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium border bg-blue-500/10 border-blue-500/30 text-blue-700"
      >
        <ClipboardList className="w-3.5 h-3.5" />
        {t("admin.medical.badge")}
        {b.follow_up_needed ? ` · ${t("admin.medical.followUpShort")}` : ""}
      </span>
    );
  };

  // The 10 days around `weekAnchor` — 3 days before it plus the 7 from it
  // onward — so staff can glance back at recent days without paging. The
  // day matching `weekAnchor` reads as "Today" / the one after it as
  // "Tomorrow" when the anchor is actually today; every other day shows its
  // short weekday name.
  const weekDaysPills = useMemo(() => {
    const [ay, am, ad] = weekAnchor.split("-").map(Number);
    const anchorDate = new Date(ay, am - 1, ad);
    const todayIso = toLocalIso();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowIso = toLocalIso(tomorrowDate);
    const dateLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-US"; // -u-nu-latn: keep Western digits
    const result = [];

    for (let i = -3; i < 7; i++) {
      const dateObj = new Date(anchorDate);
      dateObj.setDate(anchorDate.getDate() + i);
      const iso = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;

      const label =
        iso === todayIso
          ? t("admin.agenda.today")
          : iso === tomorrowIso
          ? t("admin.agenda.tomorrow")
          : dateObj.toLocaleDateString(dateLocale, { weekday: "short" });

      result.push({
        iso,
        dateLabel: dateObj.toLocaleDateString(dateLocale, { month: "short", day: "numeric" }),
        dayLabel: label,
        isToday: iso === todayIso,
      });
    }
    return result;
  }, [weekAnchor, locale, t]);

  // "Aug 16 – Aug 22, 2026" label for the week header.
  const weekRangeLabel = useMemo(() => {
    const first = weekDaysPills[0];
    const last = weekDaysPills[weekDaysPills.length - 1];
    if (!first || !last) return "";
    const [fy] = first.iso.split("-").map(Number);
    const [ly] = last.iso.split("-").map(Number);
    return `${first.dateLabel} – ${last.dateLabel}, ${fy === ly ? ly : `${fy}/${ly}`}`;
  }, [weekDaysPills]);

  // Keep the selected day's pill in view whenever it changes (date picker,
  // week switch, or a click elsewhere) instead of leaving staff to hunt for
  // it by hand in the horizontal scroller.
  useEffect(() => {
    const container = dayPillsScrollRef.current;
    if (!container) return;
    const selectedPill = container.querySelector<HTMLButtonElement>(
      `[data-iso="${selectedDate}"]`
    );
    selectedPill?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate, weekDaysPills]);

  // Filtered Bookings for the selected day in Agenda View (with search support)
  const agendaBookings = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const queryDigits = digitsOf(query);

    return bookings
      .filter((b) => {
        const isSelectedDay = b.date === selectedDate;
        if (!query) return isSelectedDay;

        const phoneDigits = digitsOf(b.phone);
        const matchesPhone =
          b.phone.toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));
        const matchesText =
          b.full_name.toLowerCase().includes(query) ||
          (b.email && b.email.toLowerCase().includes(query)) ||
          b.treatment.toLowerCase().includes(query);

        return isSelectedDay && (matchesPhone || matchesText);
      })
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [bookings, selectedDate, searchQuery]);

  // Available Years computed from current date & all bookings
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    const currentYr = new Date().getFullYear().toString();
    years.add(currentYr);
    for (const b of bookings) {
      if (b.date && b.date.length >= 4) {
        years.add(b.date.substring(0, 4));
      }
    }
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [bookings]);

  // Filtered & Searched Bookings list for Table View & Month/Year Scope
  const filteredBookings = useMemo(() => {
    const now = new Date();
    const currentIso = toLocalIso(now);
    const currentYearMonth = currentIso.substring(0, 7);
    const currentYear = currentIso.substring(0, 4);

    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = toLocalIso(prevDate).substring(0, 7);

    return bookings.filter((b) => {
      // Status filter
      const matchesStatus =
        statusFilter === "all" ? true : b.status === statusFilter;

      // Smart Phone & Text Search query filter
      const query = searchQuery.toLowerCase().trim();
      const queryDigits = digitsOf(query);
      const phoneDigits = digitsOf(b.phone);

      const matchesPhone =
        b.phone.toLowerCase().includes(query) ||
        (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));

      const matchesQuery =
        !query ||
        matchesPhone ||
        b.full_name.toLowerCase().includes(query) ||
        (b.email && b.email.toLowerCase().includes(query)) ||
        b.treatment.toLowerCase().includes(query) ||
        b.date.includes(query);

      // Month filter
      const matchesMonth =
        selectedMonth === "all" ? true : b.date.substring(5, 7) === selectedMonth;

      // Year filter
      const matchesYear =
        selectedYear === "all" ? true : b.date.substring(0, 4) === selectedYear;

      // Specific day within the selected month/year (day-pill strip)
      const matchesTableDay = !selectedTableDay || b.date === selectedTableDay;

      // Date scope presets
      let matchesPreset = true;
      if (datePreset === "today") {
        matchesPreset = b.date === currentIso;
      } else if (datePreset === "this_month") {
        matchesPreset = b.date.substring(0, 7) === currentYearMonth;
      } else if (datePreset === "last_month") {
        matchesPreset = b.date.substring(0, 7) === prevYearMonth;
      } else if (datePreset === "this_year") {
        matchesPreset = b.date.substring(0, 4) === currentYear;
      }

      return matchesStatus && matchesQuery && matchesMonth && matchesYear && matchesTableDay && matchesPreset;
    });
  }, [bookings, statusFilter, searchQuery, selectedMonth, selectedYear, selectedTableDay, datePreset]);

  // Consultation requests only (with search support by phone/name)
  const consultationBookings = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const queryDigits = digitsOf(query);

    return bookings
      .filter((b) => {
        if (!isConsultation(b)) return false;
        if (!query) return true;

        const phoneDigits = digitsOf(b.phone);
        const matchesPhone =
          b.phone.toLowerCase().includes(query) ||
          (queryDigits.length >= 3 && phoneDigits.includes(queryDigits));
        const matchesText =
          b.full_name.toLowerCase().includes(query) ||
          (b.email && b.email.toLowerCase().includes(query)) ||
          b.treatment.toLowerCase().includes(query) ||
          b.date.includes(query);

        return matchesPhone || matchesText;
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (a.queue_number ?? 0) - (b.queue_number ?? 0)
      );
  }, [bookings, searchQuery]);

  // A consultation older than the clinic's configured validity window (Clinic
  // Settings) no longer counts as a live basis for the "has consultation"
  // reminder — it's stale, so the patient effectively doesn't benefit from it
  // anymore. Cutoff date recomputes whenever the setting loads/changes.
  const consultationValidityCutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - consultationValidityDays);
    return toLocalIso(d);
  }, [consultationValidityDays]);

  // Every COMPLETED exam that has the same patient's still-valid consultation
  // (matched by phone, within the validity window), IGNORING the show/hide
  // flag. Drives whether the "Has consultation" toggle button appears at all
  // — so staff can flip it back on after hiding it.
  const examsWithMatchedConsultation = useMemo(() => {
    const consults = bookings.filter(isConsultation);
    const map = new Map<number, Booking>();
    for (const b of bookings) {
      if (b.status !== "completed" || isConsultation(b)) continue;
      const match = consults.find(
        (c) => phonesMatch(c.phone, b.phone) && c.date >= consultationValidityCutoff
      );
      if (match) map.set(b.id, match);
    }
    return map;
  }, [bookings, consultationValidityCutoff]);

  // The subset staff have left visible (not dismissed) — drives the badges and
  // the Consultations-tab follow-up cards.
  const consultationForCompletedId = useMemo(() => {
    const map = new Map<number, Booking>();
    for (const [bid, cons] of examsWithMatchedConsultation) {
      const b = bookings.find((x) => x.id === bid);
      if (b && !b.consultation_hint_dismissed) map.set(bid, cons);
    }
    return map;
  }, [bookings, examsWithMatchedConsultation]);

  // Completed exams whose patient has a consultation (and not dismissed) — these
  // also surface in the Consultations tab so staff see the follow-up is due.
  const completedExamsWithConsultation = useMemo(
    () => bookings.filter((b) => consultationForCompletedId.has(b.id)),
    [bookings, consultationForCompletedId]
  );

  // Full date heading, formatted in whichever language is active — "en"
  // holds the display string regardless of locale (kept as one field so
  // every existing usage below doesn't need to branch on locale itself).
  const selectedDateFormatted = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      const dateLocale = locale === "ar" ? "ar-EG-u-nu-latn" : "en-US";
      const en = d.toLocaleDateString(dateLocale, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      return { en };
    } catch {
      return { en: selectedDate };
    }
  }, [selectedDate, locale]);

  // What the Analytics Cards summarize: the Day Agenda always scopes to the
  // selected day; the All Bookings table stays at "all time" until staff
  // pick a specific day or month/year, at which point the cards narrow to
  // match what the table is actually showing instead of staying global.
  const statsScope = useMemo(() => {
    if (viewMode === "agenda") {
      return { bookings: agendaBookings, caption: t("admin.stats.recordsFor", { scope: selectedDateFormatted.en }) };
    }
    if (viewMode === "table") {
      if (selectedTableDay) {
        return { bookings: filteredBookings, caption: t("admin.stats.recordsFor", { scope: selectedTableDay }) };
      }
      if (selectedMonth !== "all" && selectedYear !== "all") {
        const monthLabel = MONTH_NAMES.find((m) => m.value === selectedMonth)?.label.split(" (")[0] ?? selectedMonth;
        return { bookings: filteredBookings, caption: t("admin.stats.recordsFor", { scope: `${monthLabel} ${selectedYear}` }) };
      }
      if (datePreset !== "all") {
        const presetScopes: Record<string, string> = {
          today: t("admin.stats.today"),
          this_month: t("admin.stats.thisMonth"),
          last_month: t("admin.stats.lastMonth"),
          this_year: t("admin.stats.thisYear"),
        };
        const scope = presetScopes[datePreset];
        return {
          bookings: filteredBookings,
          caption: scope ? t("admin.stats.recordsFor", { scope }) : t("admin.stats.filtered"),
        };
      }
    }
    return { bookings, caption: t("admin.stats.allTime") };
  }, [viewMode, agendaBookings, filteredBookings, bookings, selectedDateFormatted, selectedTableDay, selectedMonth, selectedYear, datePreset, t]);

  // Statistics calculation — scoped to `statsScope`, not always every booking.
  const stats = useMemo(() => {
    const scoped = statsScope.bookings;
    const total = scoped.length;
    const pending = scoped.filter((b) => b.status === "pending").length;
    const confirmed = scoped.filter((b) => b.status === "confirmed").length;
    const completed = scoped.filter((b) => b.status === "completed").length;
    return { total, pending, confirmed, completed };
  }, [statsScope]);

  if (!mounted) return null;

  // ── 1. LOGIN SCREEN (CLINIC LUXURY CREAM & GOLD THEME) ─────────────────────
  if (!token) {
    return (
      <main className="min-h-screen w-full bg-[#f4f1eb] text-[#101820] flex items-center justify-center p-6 selection:bg-[#b99a6b] selection:text-white">
        <div className="relative w-full max-w-md bg-white border border-[#101820]/10 rounded-3xl p-8 shadow-2xl">
          <LanguageToggle className="absolute top-4 right-4 rtl:right-auto rtl:left-4 bg-[#f4f1eb] text-[#101820]/70 hover:text-[#101820]" />

          {/* Header Monogram */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-16 w-16 rounded-2xl bg-[#101820] text-[#b99a6b] flex items-center justify-center font-serif text-2xl font-bold shadow-md mb-4">
              LD
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight text-[#101820]">
              {t("admin.login.portalTitle")}
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] text-[#b99a6b] mt-1">
              {t("admin.login.portalSubtitle")}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {authError && (
              <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[#101820]/60 mb-2">
                {t("admin.login.username")}
              </label>
              <div className="relative">
                <User className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-3 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2.5 text-sm text-[#101820] placeholder-[#101820]/30 outline-none focus:border-[#b99a6b] focus:ring-2 focus:ring-[#b99a6b]/20 transition-all"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[#101820]/60 mb-2">
                {t("admin.login.password")}
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-3 w-4 h-4 text-[#101820]/40" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2.5 text-sm text-[#101820] placeholder-[#101820]/30 outline-none focus:border-[#b99a6b] focus:ring-2 focus:ring-[#b99a6b]/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 py-3.5 rounded-xl bg-[#101820] text-[#f4f1eb] font-medium text-xs uppercase tracking-[0.2em] shadow-lg hover:bg-[#101820]/90 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isLoggingIn ? t("admin.login.signingIn") : t("admin.login.signIn")}
            </button>

            {/* Quick Helper Credentials Hint */}
            <div className="pt-4 border-t border-[#101820]/10 text-center text-xs text-[#101820]/50 space-y-1">
              <p>{t("admin.login.defaultCredentials")}</p>
              <div className="flex items-center justify-center gap-3 font-mono text-[0.75rem] text-[#b99a6b]">
                <span>admin / admin123</span>
                <span>•</span>
                <span>staff / staff123</span>
              </div>
            </div>
          </form>
        </div>
      </main>
    );
  }

  // ── 2. ADMIN DASHBOARD VIEW (CREAM & GOLD CLINIC THEME) ────────────────────
  return (
    <main className="min-h-screen w-full bg-[#f4f1eb] text-[#101820] selection:bg-[#b99a6b] selection:text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-[#f4f1eb]/90 backdrop-blur-md border-b border-[#101820]/10 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#101820] text-[#b99a6b] flex items-center justify-center font-serif font-bold text-lg shadow-sm">
              LD
            </div>
            <div>
              <h1 className="font-serif text-lg font-medium leading-tight text-[#101820]">
                {t("admin.header.clinicName")}
              </h1>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#b99a6b]">
                {t("admin.header.clinicSubtitle")}
              </p>
            </div>
            {!isAdmin && branchName && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[0.68rem] font-medium bg-[#b99a6b]/15 text-[#101820] border border-[#b99a6b]/30">
                <Building2 className="w-3 h-3 text-[#b99a6b]" />
                {t("admin.header.yourBranch", { name: branchName })}
              </span>
            )}
            {isAdmin && branches.length > 0 && (
              <div className="relative">
                <Building2 className="absolute left-2.5 rtl:left-auto rtl:right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#b99a6b] pointer-events-none" />
                <select
                  value={branchFilter}
                  onChange={(e) => setBranchFilter(e.target.value)}
                  title={t("admin.header.branchFilter")}
                  className="appearance-none pl-8 pr-3 rtl:pr-8 rtl:pl-3 py-1.5 rounded-full text-[0.68rem] font-medium bg-white border border-[#101820]/15 text-[#101820] outline-none focus:border-[#b99a6b] cursor-pointer"
                >
                  <option value="">{t("admin.header.allBranches")}</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Switcher */}
            <div className="flex items-center p-1 rounded-xl bg-white border border-[#101820]/10 shadow-sm">
              <button
                onClick={() => setViewMode("agenda")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                  viewMode === "agenda"
                    ? "bg-[#101820] text-[#f4f1eb] shadow"
                    : "text-[#101820]/60 hover:text-[#101820]"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                <span>{t("admin.header.dayAgenda")}</span>
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                  viewMode === "table"
                    ? "bg-[#101820] text-[#f4f1eb] shadow"
                    : "text-[#101820]/60 hover:text-[#101820]"
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>{t("admin.header.allBookings")}</span>
              </button>
              <button
                onClick={() => setViewMode("consultations")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                  viewMode === "consultations"
                    ? "bg-[#101820] text-[#f4f1eb] shadow"
                    : "text-[#101820]/60 hover:text-[#101820]"
                }`}
              >
                <Stethoscope className="w-3.5 h-3.5" />
                <span>{t("admin.header.consultations")}</span>
                {consultationBookings.length + completedExamsWithConsultation.length > 0 && (
                  <span
                    className={`ml-0.5 rtl:ml-0 rtl:mr-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none ${
                      viewMode === "consultations"
                        ? "bg-[#b99a6b] text-[#101820]"
                        : "bg-[#101820]/10 text-[#101820]"
                    }`}
                  >
                    {consultationBookings.length + completedExamsWithConsultation.length}
                  </span>
                )}
              </button>
              {isAdmin && (
                <button
                  onClick={() => setViewMode("financial")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                    viewMode === "financial"
                      ? "bg-[#101820] text-[#f4f1eb] shadow"
                      : "text-[#101820]/60 hover:text-[#101820]"
                  }`}
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{t("admin.header.financial")}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setViewMode("records")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                    viewMode === "records"
                      ? "bg-[#101820] text-[#f4f1eb] shadow"
                      : "text-[#101820]/60 hover:text-[#101820]"
                  }`}
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  <span>{t("admin.header.records")}</span>
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={() => setViewMode("branches")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium uppercase tracking-[0.12em] transition-all ${
                    viewMode === "branches"
                      ? "bg-[#101820] text-[#f4f1eb] shadow"
                      : "text-[#101820]/60 hover:text-[#101820]"
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>{t("admin.branches.title")}</span>
                </button>
              )}
            </div>

            <LanguageToggle className="bg-white border border-[#101820]/10 shadow-sm text-[#101820]/70 hover:text-[#101820]" />

            <button
              onClick={() => {
                setNewForm((prev) => ({ ...prev, date: selectedDate }));
                setShowNewModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 text-[#b99a6b]" />
              <span>{t("admin.header.newAppointment")}</span>
            </button>

            <div className="relative flex items-center">
              <button
                onClick={handleManualRefresh}
                disabled={isLoading || isRefreshing}
                title={t("admin.header.refreshTitle")}
                className="p-2 rounded-xl bg-white border border-[#101820]/10 hover:bg-[#101820]/5 text-[#101820]/70 transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? "animate-spin text-[#b99a6b]" : ""}`} />
              </button>
              {refreshToast && (
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.68rem] font-medium text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md shadow-md animate-in fade-in z-40">
                  ✓ {t("admin.header.refreshed")}
                </span>
              )}
            </div>

            <button
              onClick={handleLogout}
              title={t("admin.header.logout")}
              className="p-2 rounded-xl bg-white border border-[#101820]/10 hover:bg-red-500/10 hover:border-red-500/20 text-[#101820]/70 hover:text-red-600 transition-colors shadow-sm"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {arrivalError && (
          <div className="flex items-start gap-2.5 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{arrivalError}</span>
            <button
              onClick={() => setArrivalError("")}
              className="text-red-700/60 hover:text-red-700"
              title={t("admin.header.dismiss")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Analytics Cards (hidden on views that have their own layout) */}
        {viewMode !== "financial" && viewMode !== "records" && viewMode !== "branches" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[#101820]/50">
                {t("admin.stats.totalBookings")}
              </span>
              <Building2 className="w-5 h-5 text-[#b99a6b]" />
            </div>
            <div className="font-serif text-3xl font-medium text-[#101820]">
              {stats.total}
            </div>
            <p className="text-[0.7rem] text-[#101820]/40 mt-1">{statsScope.caption}</p>
          </div>

          <div className="bg-white border border-amber-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-amber-700">
                {t("admin.stats.pendingApproval")}
              </span>
              <Clock3 className="w-5 h-5 text-amber-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-amber-700">
              {stats.pending}
            </div>
            <p className="text-[0.7rem] text-amber-600/70 mt-1">{t("admin.stats.pendingCaption")}</p>
          </div>

          <div className="bg-white border border-emerald-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-emerald-700">
                {t("admin.stats.confirmedSlots")}
              </span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-emerald-700">
              {stats.confirmed}
            </div>
            <p className="text-[0.7rem] text-emerald-600/70 mt-1">{t("admin.stats.confirmedCaption")}</p>
          </div>

          <div className="bg-white border border-blue-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-blue-700">
                {t("admin.stats.completed")}
              </span>
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-blue-700">
              {stats.completed}
            </div>
            <p className="text-[0.7rem] text-blue-600/70 mt-1">{t("admin.stats.completedCaption")}</p>
          </div>
        </div>
        )}

        {/* ── FINANCIAL DASHBOARD VIEW ─────────────────────────────────────── */}
        {viewMode === "financial" && <FinancialDashboard token={token || ""} onAuthError={handleLogout} />}

        {/* ── MEDICAL RECORDS VIEW ─────────────────────────────────────────── */}
        {viewMode === "records" && (
          <MedicalRecords token={token || ""} onAuthError={handleLogout} readOnly={!isAdmin} />
        )}

        {/* ── CLINIC SETTINGS VIEW (branches, per-branch fee/duration + staff) ── */}
        {viewMode === "branches" && <ClinicSettings token={token || ""} onAuthError={handleLogout} />}

        {/* ── 3. AGENDA / DAY SCHEDULE VIEW (جدول اليوم والأيام) ──────────────── */}
        {viewMode === "agenda" && (
          <div className="space-y-6">
            {/* Day Quick Picker Header */}
            <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#101820]/10 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-[#b99a6b]" />
                    <h2 className="font-serif text-2xl font-medium text-[#101820]">
                      {selectedDateFormatted.en}
                    </h2>
                  </div>
                  <p className="text-xs text-[#101820]/50 mt-1">
                    {t("admin.agenda.showingAppointments")}
                    <strong className="text-[#101820]">
                      {agendaBookings.length}
                    </strong>{" "}
                    {t("admin.agenda.patients")}
                  </p>
                </div>

                {/* Agenda Search & Date Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Input for Agenda */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("admin.agenda.searchPlaceholder")}
                      className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl pl-10 pr-8 rtl:pl-8 rtl:pr-10 py-1.5 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-2 text-[#101820]/40 hover:text-[#101820]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Day Pill Bar — 3 days back plus a week forward from
                  the anchor, paged a week at a time with the arrow buttons. */}
              <div className="space-y-2 pt-2 border-t border-[#101820]/10">
                <div className="flex items-center justify-between text-xs font-medium text-[#101820]/60">
                  <span className="uppercase tracking-wider text-[0.68rem] text-[#b99a6b] font-semibold">
                    🗓️ {t("admin.agenda.thisWeek")} — {weekRangeLabel}
                  </span>
                  <div className="flex items-center p-1 rounded-xl bg-white border border-[#101820]/10 shadow-sm">
                    <button
                      type="button"
                      onClick={() => shiftWeek("prev")}
                      className="p-1 rounded-lg text-[#101820]/60 hover:bg-[#101820] hover:text-white transition-colors"
                      title={t("admin.agenda.prevWeek")}
                    >
                      <ChevronLeft className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                    <div className="w-px h-3.5 bg-[#101820]/10 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => shiftWeek("next")}
                      className="p-1 rounded-lg text-[#101820]/60 hover:bg-[#101820] hover:text-white transition-colors"
                      title={t("admin.agenda.nextWeek")}
                    >
                      <ChevronRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </button>
                  </div>
                </div>

                <div
                  ref={dayPillsScrollRef}
                  data-lenis-prevent
                  className="flex items-center gap-3 overflow-x-auto pt-3 pb-2 scrollbar-none"
                >
                  {weekDaysPills.map((pill) => {
                    const countForDay = bookings.filter(
                      (b) => b.date === pill.iso
                    ).length;
                    const isSelected = selectedDate === pill.iso;
                    return (
                      <button
                        key={pill.iso}
                        data-iso={pill.iso}
                        onClick={() => setSelectedDate(pill.iso)}
                        className={`flex flex-col items-center gap-1.5 py-4 px-5 rounded-2xl transition-all whitespace-nowrap min-w-[7rem] border ${
                          isSelected
                            ? "bg-[#101820] text-[#f4f1eb] border-[#101820] shadow-md scale-[1.04]"
                            : "bg-[#f4f1eb]/70 hover:bg-[#f4f1eb] border-[#101820]/10 text-[#101820]"
                        }`}
                      >
                        <span
                          className={`text-xs uppercase tracking-wider font-medium ${
                            isSelected ? "text-[#b99a6b]" : "text-[#101820]/50"
                          }`}
                        >
                          {pill.dayLabel}
                        </span>
                        <span className={`font-serif font-bold whitespace-nowrap ${locale === "ar" ? "text-sm" : "text-lg"}`}>
                          {pill.dateLabel}
                        </span>
                        {countForDay > 0 && (
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              isSelected
                                ? "bg-[#b99a6b] text-[#101820]"
                                : "bg-[#101820]/10 text-[#101820]/70"
                            }`}
                          >
                            {t("admin.agenda.patientCount", { count: countForDay, plural: countForDay === 1 ? "" : "s" })}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Agenda Patient Cards List */}
            {agendaBookings.length === 0 ? (
              <div className="bg-white border border-[#101820]/10 rounded-2xl p-12 text-center shadow-sm">
                <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-[#f4f1eb] text-[#b99a6b] flex items-center justify-center">
                    <CalendarIcon className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-xl font-medium text-[#101820]">
                    {t("admin.agenda.emptyTitle")}
                  </h3>
                  <p className="text-xs text-[#101820]/60 leading-relaxed">
                    {t("admin.agenda.emptyBody", { date: selectedDateFormatted.en })}
                  </p>
                  <button
                    onClick={() => {
                      setNewForm((prev) => ({ ...prev, date: selectedDate }));
                      setShowNewModal(true);
                    }}
                    className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow"
                  >
                    <Plus className="w-4 h-4 text-[#b99a6b]" />
                    <span>{t("admin.agenda.bookPatientFor", { date: selectedDate })}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {agendaBookings.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white border border-[#101820]/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow space-y-4"
                  >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    {/* Patient Info & Details */}
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Queue Number Badge */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#101820] text-[#f4f1eb] font-serif text-sm font-medium">
                          <ListFilter className="w-3.5 h-3.5 text-[#b99a6b]" />
                          {t("admin.agenda.queue", { number: b.queue_number ?? "—" })}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-medium border ${
                            b.status === "confirmed"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                              : b.status === "completed"
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700"
                              : b.status === "cancelled"
                              ? "bg-red-500/10 border-red-500/30 text-red-700"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                          }`}
                        >
                          ● {b.status.toUpperCase()}
                        </span>

                        {/* Arrival Badge */}
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium border ${
                            b.patient_arrived
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                              : "bg-[#101820]/5 border-[#101820]/15 text-[#101820]/60"
                          }`}
                        >
                          {b.patient_arrived ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                          {b.patient_arrived ? t("admin.common.entered") : t("admin.common.notEntered")}
                        </span>

                        {/* Payment Badge */}
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full font-medium border ${
                            b.payment_method === "online" && b.payment_status === "paid"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                          }`}
                        >
                          {b.payment_method === "online" ? (
                            <CreditCard className="w-3.5 h-3.5" />
                          ) : (
                            <Wallet className="w-3.5 h-3.5" />
                          )}
                          {b.payment_method === "online"
                            ? b.payment_status === "paid"
                              ? t("admin.common.paidOnline")
                              : t("admin.common.onlinePending")
                            : t("admin.common.payAtClinic")}
                        </span>

                        {/* Extra Charge Badge — add-on work billed on top of the base appointment */}
                        {renderExtraChargeBadge(b)}

                        {/* Consultation flag — distinguishes it from a treatment */}
                        {isConsultation(b) && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                            <Stethoscope className="w-3.5 h-3.5" />
                            {t("admin.common.consultationBadge")}
                          </span>
                        )}

                        {/* Treatment / Service Name */}
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-serif font-medium border border-[#101820]/10">
                          {b.treatment}
                        </span>

                        {/* Completed exam whose patient also has a consultation */}
                        {consultationForCompletedId.get(b.id) && (
                          <span
                            title={t("admin.common.consultationBookedFor", { date: consultationForCompletedId.get(b.id)?.date ?? "" })}
                            className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            {t("admin.common.hasConsultation")}
                            <button
                              onClick={() => handleSetConsultationHint(b.id, true)}
                              title={t("admin.common.dismissReminderTitle")}
                              className="ml-0.5 rounded-full p-0.5 text-[#101820]/70 hover:bg-[#101820]/15 hover:text-[#101820] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        )}
                      </div>

                      {/* Patient Name */}
                      <div>
                        <h3 className="font-serif text-2xl font-medium text-[#101820]">
                          {b.full_name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-[#101820]/60 mt-1">
                          <span className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3.5 h-3.5 text-[#b99a6b]" /> {b.phone}
                          </span>
                          {b.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-[#101820]/40" /> {b.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Patient Note */}
                      {b.message && (
                        <div className="p-3 rounded-xl bg-[#f4f1eb]/70 border border-[#101820]/10 text-xs text-[#101820]/80 italic max-w-2xl">
                          &ldquo;{b.message}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Side Action Buttons */}
                    <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 border-t lg:border-t-0 lg:border-l border-[#101820]/10 pt-4 lg:pt-0 lg:pl-6">
                      <div className="flex items-center gap-2 w-full justify-start lg:justify-end">
                        <a
                          href={`tel:${b.phone}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-[#b99a6b]" />
                          <span>{t("admin.common.call")}</span>
                        </a>

                        <a
                          href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t("admin.common.whatsapp")}</span>
                        </a>

                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                          title={t("admin.common.viewFullInfo")}
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() =>
                            editingExtraChargeId === b.id ? cancelEditExtraCharge() : startEditExtraCharge(b)
                          }
                          className={`p-1.5 rounded-xl border transition-colors ${
                            editingExtraChargeId === b.id
                              ? "bg-[#101820] text-white border-[#101820]"
                              : "bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border-[#101820]/15 text-[#101820]"
                          }`}
                          title={t("admin.common.addEditCharge")}
                        >
                          <Receipt className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                          title={t("admin.common.deleteAppointment")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Status quick switcher buttons */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          {t("admin.common.status")}
                        </span>
                        <button
                          onClick={() => handleStatusChange(b.id, "confirmed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "confirmed"
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-emerald-500/10 hover:text-emerald-700"
                          }`}
                        >
                          {t("admin.common.confirm")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-700"
                          }`}
                        >
                          {t("admin.common.complete")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          {t("admin.common.cancel")}
                        </button>
                      </div>

                      {/* Arrival control — backend enforces booking date == today AND within working hours */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          {t("admin.common.arrival")}
                        </span>
                        <button
                          onClick={() => handleToggleArrival(b)}
                          disabled={arrivalUpdatingId === b.id || (!b.patient_arrived && !canMarkEntered(b))}
                          title={
                            !b.patient_arrived && !canMarkEntered(b)
                              ? t("admin.common.arrivalDisabledTitle")
                              : undefined
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                            b.patient_arrived
                              ? "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow disabled:hover:bg-emerald-600"
                          }`}
                        >
                          {arrivalUpdatingId === b.id ? (
                            t("admin.common.updating")
                          ) : b.patient_arrived ? (
                            <>
                              <UserX className="w-3.5 h-3.5" /> {t("admin.common.markNotEntered")}
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" /> {t("admin.common.markEntered")}
                            </>
                          )}
                        </button>
                      </div>

                      {/* Consultation toggle — appears once the exam is completed and
                          the patient has a consultation. Flip it on/off (yes/no). */}
                      {examsWithMatchedConsultation.has(b.id) && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                            {t("admin.common.consultation")}
                          </span>
                          <button
                            onClick={() =>
                              handleSetConsultationHint(b.id, !b.consultation_hint_dismissed)
                            }
                            title={
                              b.consultation_hint_dismissed
                                ? t("admin.common.showConsultationTitle")
                                : t("admin.common.hideConsultationTitle")
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              !b.consultation_hint_dismissed
                                ? "bg-[#b99a6b] text-[#101820] hover:bg-[#b99a6b]/85 shadow"
                                : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-[#b99a6b]/20 hover:text-[#101820]"
                            }`}
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            {b.consultation_hint_dismissed ? t("admin.common.noConsultation") : t("admin.common.hasConsultation")}
                          </button>
                        </div>
                      )}
                    </div>

                    {(b.branch_name || b.updated_by) && (
                      <div className="flex items-center gap-3 text-[0.65rem] text-[#101820]/45">
                        {b.branch_name && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {t("admin.record.branch")}: {b.branch_name}
                          </span>
                        )}
                        {b.updated_by && (
                          <span>
                            {t("admin.record.updatedBy")}: {b.updated_by}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {renderExtraChargePanel(b)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 4. ALL BOOKINGS TABLE VIEW ──────────────────────────────────────── */}
        {viewMode === "table" && (
          <div className="space-y-4">
            {/* Filter Bar & Search */}
            <div className="bg-white border border-[#101820]/10 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                {[
                  { id: "all", label: t("admin.table.statusAll") },
                  { id: "pending", label: t("admin.table.statusPending") },
                  { id: "confirmed", label: t("admin.table.statusConfirmed") },
                  { id: "completed", label: t("admin.table.statusCompleted") },
                  { id: "cancelled", label: t("admin.table.statusCancelled") },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium uppercase tracking-wide transition-all whitespace-nowrap ${
                      statusFilter === tab.id
                        ? "bg-[#101820] text-[#f4f1eb] shadow"
                        : "text-[#101820]/60 hover:text-[#101820] hover:bg-[#f4f1eb]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Date Scope & Month/Year Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                {/* Date Preset */}
                <select
                  value={datePreset}
                  onChange={(e) => setDatePreset(e.target.value)}
                  className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                >
                  <option value="all">{t("admin.table.allDates")}</option>
                  <option value="today">{t("admin.table.today")}</option>
                  <option value="this_month">{t("admin.table.thisMonth")}</option>
                  <option value="last_month">{t("admin.table.lastMonth")}</option>
                  <option value="this_year">{t("admin.table.thisYear")}</option>
                </select>

                {/* Month Dropdown */}
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setDatePreset("all");
                    setSelectedTableDay(null);
                  }}
                  className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                >
                  <option value="all">{t("admin.table.monthAll")}</option>
                  {MONTH_NAMES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>

                {/* Year Dropdown */}
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(e.target.value);
                    setDatePreset("all");
                    setSelectedTableDay(null);
                  }}
                  className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                >
                  <option value="all">{t("admin.table.yearAll")}</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      {t("admin.table.year", { year: yr })}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("admin.table.searchPlaceholder")}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 rtl:pl-4 rtl:pr-10 py-2 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b] transition-colors"
                />
              </div>
            </div>

            {/* Day-of-month strip — appears once a specific month + year are
                picked; click a day to narrow the table to just that day,
                click it again to go back to the whole month. */}
            {tableDaysPills.length > 0 && (
              <div className="bg-white border border-[#101820]/10 rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-xs font-medium text-[#101820]/60">
                  <span className="uppercase tracking-wider text-[0.68rem] text-[#b99a6b] font-semibold">
                    {t("admin.table.daysIn", {
                      month: MONTH_NAMES.find((m) => m.value === selectedMonth)?.label.split(" (")[0] ?? selectedMonth,
                      year: selectedYear,
                    })}
                  </span>
                  {selectedTableDay && (
                    <button
                      onClick={() => setSelectedTableDay(null)}
                      className="inline-flex items-center gap-1 text-[0.68rem] font-medium text-[#101820]/60 hover:text-[#101820]"
                    >
                      <X className="w-3 h-3" /> {t("admin.table.clearDayFilter")}
                    </button>
                  )}
                </div>
                <div
                  ref={tableDayPillsScrollRef}
                  data-lenis-prevent
                  className="flex items-center gap-2 overflow-x-auto pt-1 pb-2 scrollbar-none"
                >
                  {tableDaysPills.map((pill) => {
                    const countForDay = bookings.filter((b) => b.date === pill.iso).length;
                    const isSelected = selectedTableDay === pill.iso;
                    return (
                      <button
                        key={pill.iso}
                        onClick={() => setSelectedTableDay(isSelected ? null : pill.iso)}
                        className={`flex flex-col items-center gap-0.5 py-2 px-2.5 rounded-xl transition-all whitespace-nowrap min-w-[3.6rem] border ${
                          isSelected
                            ? "bg-[#101820] text-[#f4f1eb] border-[#101820] shadow-md scale-[1.04]"
                            : pill.isToday
                            ? "bg-[#b99a6b]/15 border-[#b99a6b]/40 text-[#101820]"
                            : "bg-[#f4f1eb]/70 hover:bg-[#f4f1eb] border-[#101820]/10 text-[#101820]"
                        }`}
                      >
                        <span
                          className={`text-[0.6rem] uppercase tracking-wider font-medium ${
                            isSelected ? "text-[#b99a6b]" : "text-[#101820]/50"
                          }`}
                        >
                          {pill.dayName}
                        </span>
                        <span className="font-serif text-sm font-bold">{pill.day}</span>
                        {countForDay > 0 ? (
                          <span
                            className={`text-[0.58rem] px-1.5 py-0.2 rounded-full font-semibold ${
                              isSelected ? "bg-[#b99a6b] text-[#101820]" : "bg-[#101820]/15 text-[#101820]"
                            }`}
                          >
                            {countForDay}
                          </span>
                        ) : (
                          <span className="text-[0.55rem] opacity-30">—</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Table Container */}
            <div className="bg-white border border-[#101820]/10 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#101820]/10 bg-[#f4f1eb]/50 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#101820]/50">
                      <th className="py-4 px-6">{t("admin.table.colPatient")}</th>
                      <th className="py-4 px-6">{t("admin.table.colTreatment")}</th>
                      <th className="py-4 px-6">{t("admin.table.colDateQueue")}</th>
                      <th className="py-4 px-6">{t("admin.table.colPayment")}</th>
                      <th className="py-4 px-6">{t("admin.table.colArrival")}</th>
                      <th className="py-4 px-6">{t("admin.table.colStatus")}</th>
                      <th className="py-4 px-6 text-right rtl:text-left">{t("admin.table.colActions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#101820]/5 text-sm">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#101820]/50">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="w-8 h-8 text-[#b99a6b]" />
                            <p className="font-serif text-base text-[#101820]">
                              {t("admin.table.noBookingsTitle")}
                            </p>
                            <p className="text-xs text-[#101820]/50">
                              {t("admin.table.noBookingsBody")}
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredBookings.map((b) => (
                        <tr
                          key={b.id}
                          className="hover:bg-[#f4f1eb]/40 transition-colors group"
                        >
                          {/* Patient Details */}
                          <td className="py-4 px-6">
                            <div className="font-medium text-[#101820]">{b.full_name}</div>
                            <div className="flex items-center gap-3 text-xs text-[#101820]/50 mt-0.5">
                              <span className="flex items-center gap-1 font-mono">
                                <Phone className="w-3 h-3 text-[#b99a6b]" /> {b.phone}
                              </span>
                              {b.email && (
                                <span className="flex items-center gap-1 hidden sm:inline-flex">
                                  <Mail className="w-3 h-3 text-[#101820]/30" /> {b.email}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Treatment / Service */}
                          <td className="py-4 px-6">
                            <div className="flex flex-col items-start gap-1.5">
                              {isConsultation(b) ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                                  <Stethoscope className="w-3.5 h-3.5" />
                                  {t("admin.common.consultationBadge")}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f4f1eb] border border-[#101820]/10 text-xs font-serif text-[#101820]">
                                  {b.treatment}
                                </span>
                              )}
                              {consultationForCompletedId.get(b.id) && (
                                <span
                                  title={t("admin.common.consultationBookedFor", { date: consultationForCompletedId.get(b.id)?.date ?? "" })}
                                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-[#b99a6b] text-[#101820] text-[0.68rem] font-semibold"
                                >
                                  <Stethoscope className="w-3 h-3" />
                                  {t("admin.common.hasConsultation")}
                                  <button
                                    onClick={() => handleSetConsultationHint(b.id, true)}
                                    title={t("admin.common.dismissReminderTitle")}
                                    className="ml-0.5 rounded-full p-0.5 text-[#101820]/70 hover:bg-[#101820]/15 hover:text-[#101820] transition-colors"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Date & Queue */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5 text-xs text-[#101820]">
                              <CalendarIcon className="w-3.5 h-3.5 text-[#b99a6b]" />
                              <span>{b.date}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[0.72rem] text-[#101820]/50 mt-0.5">
                              <ListFilter className="w-3 h-3 text-[#101820]/30" />
                              <span>{t("admin.agenda.queue", { number: b.queue_number ?? "—" })}</span>
                            </div>
                          </td>

                          {/* Payment */}
                          <td className="py-4 px-6">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium border ${
                                b.payment_method === "online" && b.payment_status === "paid"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                                  : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                              }`}
                            >
                              {b.payment_method === "online" ? (
                                <CreditCard className="w-3.5 h-3.5" />
                              ) : (
                                <Wallet className="w-3.5 h-3.5" />
                              )}
                              {b.payment_method === "online"
                                ? b.payment_status === "paid"
                                  ? t("admin.common.paidOnline")
                                  : t("admin.common.onlinePending")
                                : t("admin.table.pendingPayAtClinic")}
                            </span>
                            {b.extra_charge_amount ? (
                              <div className="mt-1.5 flex flex-wrap gap-1.5">{renderExtraChargeBadge(b)}{renderRecordBadge(b)}</div>
                            ) : null}
                          </td>

                          {/* Arrival */}
                          <td className="py-4 px-6">
                            <button
                              onClick={() => handleToggleArrival(b)}
                              disabled={arrivalUpdatingId === b.id || (!b.patient_arrived && !canMarkEntered(b))}
                              title={
                                !b.patient_arrived && !canMarkEntered(b)
                                  ? t("admin.common.arrivalDisabledTitle")
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                b.patient_arrived
                                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 hover:bg-red-500/10 hover:text-red-700"
                                  : "bg-[#101820]/5 border border-[#101820]/15 text-[#101820]/60 hover:bg-emerald-500/10 hover:text-emerald-700"
                              }`}
                            >
                              {b.patient_arrived ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              {arrivalUpdatingId === b.id ? "…" : b.patient_arrived ? t("admin.common.entered") : t("admin.common.notEntered")}
                            </button>
                          </td>

                          {/* Status Dropdown */}
                          <td className="py-4 px-6">
                            <select
                              value={b.status}
                              onChange={(e) =>
                                handleStatusChange(b.id, e.target.value as BookingStatus)
                              }
                              className={`text-xs font-medium px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-all ${
                                b.status === "confirmed"
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800"
                                  : b.status === "completed"
                                  ? "bg-blue-500/10 border-blue-500/30 text-blue-800"
                                  : b.status === "cancelled"
                                  ? "bg-red-500/10 border-red-500/30 text-red-700"
                                  : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                              }`}
                            >
                              <option value="pending">🟡 {t("admin.table.statusPending")}</option>
                              <option value="confirmed">🟢 {t("admin.table.statusConfirmed")}</option>
                              <option value="completed">🔵 {t("admin.table.statusCompleted")}</option>
                              <option value="cancelled">🔴 {t("admin.table.statusCancelled")}</option>
                            </select>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-4 px-6 text-right rtl:text-left">
                            <div className="flex items-center justify-end rtl:justify-start gap-2">
                              <button
                                onClick={() => setSelectedBooking(b)}
                                title={t("admin.table.viewDetails")}
                                className="p-2 rounded-lg bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/10 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDelete(b.id)}
                                disabled={deletingId === b.id}
                                title={t("admin.table.deleteRecord")}
                                className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── 5. CONSULTATIONS VIEW (consultation requests only) ──────────────── */}
        {viewMode === "consultations" && (
          <div className="space-y-6">
            {/* Section header */}
            <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-[#101820] text-[#b99a6b] flex items-center justify-center">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl font-medium text-[#101820]">
                    {t("admin.consultations.title")}
                  </h2>
                  <p className="text-xs text-[#101820]/50 mt-0.5">
                    {t("admin.consultations.subtitle", {
                      requests: consultationBookings.length,
                      followUps: completedExamsWithConsultation.length,
                    })}
                  </p>
                </div>
              </div>

              {/* Search Box for Consultations */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 rtl:left-auto rtl:right-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("admin.consultations.searchPlaceholder")}
                  className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl pl-10 pr-8 rtl:pl-8 rtl:pr-10 py-2 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b] transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 rtl:right-auto rtl:left-2.5 top-2.5 text-[#101820]/40 hover:text-[#101820]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {consultationBookings.length + completedExamsWithConsultation.length === 0 ? (
              <div className="bg-white border border-[#101820]/10 rounded-2xl p-12 text-center shadow-sm">
                <div className="max-w-md mx-auto flex flex-col items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-[#f4f1eb] text-[#b99a6b] flex items-center justify-center">
                    <Stethoscope className="w-7 h-7" />
                  </div>
                  <h3 className="font-serif text-xl font-medium text-[#101820]">
                    {t("admin.consultations.emptyTitle")}
                  </h3>
                  <p className="text-xs text-[#101820]/60 leading-relaxed">
                    {t("admin.consultations.emptyBody")}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {consultationBookings.map((b) => (
                  <div
                    key={b.id}
                    className="bg-white border border-[#101820]/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                  >
                    {/* Consultation info */}
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Consultation badge — distinguishes it from appointments */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                          <Stethoscope className="w-3.5 h-3.5" />
                          {t("admin.common.consultationBadge")}
                        </span>

                        {/* Status badge */}
                        <span
                          className={`text-xs px-3 py-1 rounded-full font-medium border ${
                            b.status === "confirmed"
                              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                              : b.status === "completed"
                              ? "bg-blue-500/10 border-blue-500/30 text-blue-700"
                              : b.status === "cancelled"
                              ? "bg-red-500/10 border-red-500/30 text-red-700"
                              : "bg-amber-500/10 border-amber-500/30 text-amber-800"
                          }`}
                        >
                          ● {b.status.toUpperCase()}
                        </span>

                        {/* Queue number */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-medium border border-[#101820]/10">
                          <ListFilter className="w-3.5 h-3.5 text-[#b99a6b]" />
                          {t("admin.agenda.queue", { number: b.queue_number ?? "—" })}
                        </span>
                      </div>

                      {/* Patient */}
                      <div>
                        <h3 className="font-serif text-2xl font-medium text-[#101820]">
                          {b.full_name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-4 text-xs text-[#101820]/60 mt-1">
                          <span className="flex items-center gap-1.5 font-mono">
                            <Phone className="w-3.5 h-3.5 text-[#b99a6b]" /> {b.phone}
                          </span>
                          {b.email && (
                            <span className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-[#101820]/40" /> {b.email}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Date / time / created */}
                      <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-[#101820]/70">
                        <span className="flex items-center gap-1.5">
                          <CalendarIcon className="w-3.5 h-3.5 text-[#b99a6b]" /> {b.date}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="w-3.5 h-3.5 text-[#b99a6b]" /> {formatEstimatedTime(b)}
                        </span>
                        <span className="flex items-center gap-1.5 text-[#101820]/45">
                          <CalendarClock className="w-3.5 h-3.5" /> {t("admin.consultations.requested", { date: formatCreatedAt(b.created_at) })}
                        </span>
                      </div>

                      {/* Patient note */}
                      {b.message && (
                        <div className="p-3 rounded-xl bg-[#f4f1eb]/70 border border-[#101820]/10 text-xs text-[#101820]/80 italic max-w-2xl">
                          &ldquo;{b.message}&rdquo;
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 border-t lg:border-t-0 lg:border-l border-[#101820]/10 pt-4 lg:pt-0 lg:pl-6">
                      <div className="flex items-center gap-2 w-full justify-start lg:justify-end">
                        <a
                          href={`tel:${b.phone}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors"
                        >
                          <PhoneCall className="w-3.5 h-3.5 text-[#b99a6b]" />
                          <span>{t("admin.common.call")}</span>
                        </a>
                        <a
                          href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{t("admin.common.whatsapp")}</span>
                        </a>
                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                          title={t("admin.common.viewFullInfo")}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                          title={t("admin.table.deleteRecord")}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Status switcher */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          {t("admin.common.status")}
                        </span>
                        <button
                          onClick={() => handleStatusChange(b.id, "confirmed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "confirmed"
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-emerald-500/10 hover:text-emerald-700"
                          }`}
                        >
                          {t("admin.common.confirm")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-700"
                          }`}
                        >
                          {t("admin.common.complete")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          {t("admin.common.cancel")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Completed exams whose patient has a consultation to follow.
                    Admin can remove any of these from the list with the ✕. */}
                {completedExamsWithConsultation.map((b) => {
                  const linked = consultationForCompletedId.get(b.id);
                  return (
                    <div
                      key={`exam-${b.id}`}
                      className="bg-white border border-[#b99a6b]/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                    >
                      <div className="space-y-3 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Completed-exam context tag */}
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t("admin.consultations.completedExamTag")}
                          </span>
                          {/* Follow-up consultation flag + remove-from-list ✕ */}
                          <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                            <Stethoscope className="w-3.5 h-3.5" />
                            {t("admin.common.hasConsultation")}
                            <button
                              onClick={() => handleSetConsultationHint(b.id, true)}
                              title={t("admin.consultations.removeFromListTitle")}
                              className="ml-0.5 rounded-full p-0.5 text-[#101820]/70 hover:bg-[#101820]/15 hover:text-[#101820] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-medium border border-[#101820]/10">
                            <ListFilter className="w-3.5 h-3.5 text-[#b99a6b]" />
                            {t("admin.agenda.queue", { number: b.queue_number ?? "—" })}
                          </span>
                        </div>

                        <div>
                          <h3 className="font-serif text-2xl font-medium text-[#101820]">
                            {b.full_name}
                          </h3>
                          <div className="flex flex-wrap items-center gap-4 text-xs text-[#101820]/60 mt-1">
                            <span className="flex items-center gap-1.5 font-mono">
                              <Phone className="w-3.5 h-3.5 text-[#b99a6b]" /> {b.phone}
                            </span>
                            {b.email && (
                              <span className="flex items-center gap-1.5">
                                <Mail className="w-3.5 h-3.5 text-[#101820]/40" /> {b.email}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs text-[#101820]/70">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-[#b99a6b]" /> {t("admin.consultations.exam", { treatment: b.treatment })}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarIcon className="w-3.5 h-3.5 text-[#b99a6b]" /> {t("admin.consultations.examDay", { date: b.date })}
                          </span>
                          {linked && (
                            <span className="flex items-center gap-1.5 text-[#b99a6b] font-medium">
                              <Stethoscope className="w-3.5 h-3.5" /> {t("admin.consultations.linkedConsultation", { date: linked.date, status: linked.status })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap lg:flex-col items-center lg:items-end gap-2 border-t lg:border-t-0 lg:border-l border-[#101820]/10 pt-4 lg:pt-0 lg:pl-6">
                        <div className="flex items-center gap-2 w-full justify-start lg:justify-end">
                          <a
                            href={`tel:${b.phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-xs text-[#101820] transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-[#b99a6b]" />
                            <span>{t("admin.common.call")}</span>
                          </a>
                          <a
                            href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{t("admin.common.whatsapp")}</span>
                          </a>
                          <button
                            onClick={() => setSelectedBooking(b)}
                            className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                            title={t("admin.common.viewFullInfo")}
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleSetConsultationHint(b.id, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700 border border-[#101820]/15 text-xs transition-colors"
                          title={t("admin.consultations.removeFromListTitle")}
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>{t("admin.consultations.removeFromList")}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL 1: PATIENT RECORD & COMPLETE HISTORY (EYE ICON 👁️) ─────────── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101820]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            data-lenis-prevent
            className="relative w-full max-w-2xl bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-[#101820] text-[#b99a6b] flex items-center justify-center font-serif text-xl font-bold shadow-sm">
                  {selectedBooking.full_name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-xl font-medium text-[#101820]">
                      {selectedBooking.full_name}
                    </h3>
                    <span className="text-xs text-[#b99a6b] font-medium bg-[#b99a6b]/15 px-2.5 py-0.5 rounded-full">
                      {t("admin.record.badge")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#101820]/60 mt-0.5 font-mono">
                    <span>📞 {selectedBooking.phone}</span>
                    {selectedBooking.email && <span>✉️ {selectedBooking.email}</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-2 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Patient Overview Stats Bar */}
            <div className="grid grid-cols-3 gap-3 bg-[#f4f1eb] rounded-2xl p-4 border border-[#101820]/10 text-center">
              <div>
                <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 font-medium">
                  {t("admin.record.totalVisits")}
                </span>
                <span className="font-serif text-xl font-bold text-[#101820]">
                  {t("admin.record.visitCount", { count: patientVisits.length, plural: patientVisits.length > 1 ? "s" : "" })}
                </span>
              </div>
              <div>
                <span className="block text-[0.65rem] uppercase tracking-wider text-emerald-800 font-medium">
                  {t("admin.record.completedVisits")}
                </span>
                <span className="font-serif text-xl font-bold text-emerald-700">
                  {patientVisits.filter((v) => v.status === "completed").length}
                </span>
              </div>
              <div>
                <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 font-medium">
                  {t("admin.record.firstVisit")}
                </span>
                <span className="font-serif text-sm font-semibold text-[#101820] mt-1 block">
                  {patientVisits[patientVisits.length - 1]?.date || "—"}
                </span>
              </div>
            </div>

            {/* Quick Contact & Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#101820]/10 pb-4">
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${selectedBooking.phone}`}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#f4f1eb] border border-[#101820]/15 hover:bg-[#101820] hover:text-white text-xs text-[#101820] font-medium transition-colors"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-[#b99a6b]" />
                  <span>{t("admin.record.callPhone", { phone: selectedBooking.phone })}</span>
                </a>
                <a
                  href={`https://wa.me/${selectedBooking.phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t("admin.record.whatsappChat")}</span>
                </a>
              </div>

              <button
                onClick={() => {
                  setNewForm({
                    full_name: selectedBooking.full_name,
                    phone: selectedBooking.phone,
                    email: selectedBooking.email || "",
                    treatment: TREATMENT_OPTIONS[0],
                    date: toLocalIso(),
                    message: "",
                  });
                  setSelectedBooking(null);
                  setShowNewModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-[#b99a6b]" />
                <span>{t("admin.record.bookNextVisit")}</span>
              </button>
            </div>

            {/* Complete Patient Medical & Booking History List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-base font-medium text-[#101820] flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#b99a6b]" />
                  {t("admin.record.historyTitle")}
                </h4>
                <span className="text-xs text-[#101820]/50 font-mono">
                  {t("admin.record.recordCount", { count: patientVisits.length, plural: patientVisits.length > 1 ? "s" : "" })}
                </span>
              </div>

              {isLoadingPatientVisits && (
                <div className="flex items-center gap-2 text-xs text-[#101820]/50 py-6 justify-center">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#b99a6b]" />
                  {t("admin.record.loading")}
                </div>
              )}

              {patientVisitsError && (
                <div className="flex items-center gap-2 text-xs text-red-700 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {patientVisitsError}
                </div>
              )}

              <div className="space-y-3">
                {!isLoadingPatientVisits && patientVisits.map((visit, index) => (
                  <div
                    key={visit.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      visit.id === selectedBooking.id
                        ? "bg-[#b99a6b]/10 border-[#b99a6b]/40 ring-1 ring-[#b99a6b]/30"
                        : "bg-white border-[#101820]/10 hover:border-[#101820]/25"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#101820]/10 pb-2.5 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-serif font-bold text-[#101820]">
                          {t("admin.record.visitNumber", { number: patientVisits.length - index })}
                        </span>
                        <span className="text-xs text-[#101820]/40">•</span>
                        <span className="text-xs font-medium text-[#101820] flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3 text-[#b99a6b]" /> {visit.date}
                        </span>
                        <span className="text-xs text-[#101820]/40">•</span>
                        <span className="text-xs text-[#101820]/70">
                          {formatEstimatedTime(visit)}
                        </span>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                          visit.status === "confirmed"
                            ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-800"
                            : visit.status === "completed"
                            ? "bg-blue-500/15 border border-blue-500/30 text-blue-800"
                            : visit.status === "cancelled"
                            ? "bg-red-500/15 border border-red-500/30 text-red-700"
                            : "bg-amber-500/15 border border-amber-500/30 text-amber-800"
                        }`}
                      >
                        ● {visit.status.toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          {t("admin.record.serviceTreatment")}
                        </span>
                        <span className="font-serif font-medium text-[#b99a6b] text-sm">
                          {visit.treatment}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          {t("admin.record.queueNumber")}
                        </span>
                        <span className="font-semibold text-[#101820]">
                          #{visit.queue_number ?? "—"}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          {t("admin.record.paymentMethod")}
                        </span>
                        <span className="text-[#101820]">
                          {visit.payment_method === "online" ? t("admin.record.online") : t("admin.common.payAtClinic")}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          {t("admin.record.patientArrival")}
                        </span>
                        <span
                          className={`font-medium ${
                            visit.patient_arrived ? "text-emerald-700" : "text-[#101820]/60"
                          }`}
                        >
                          {visit.patient_arrived ? `✓ ${t("admin.common.entered")}` : t("admin.common.notEntered")}
                        </span>
                      </div>
                    </div>

                    {/* Message / Patient Note */}
                    {visit.message && (
                      <div className="p-2.5 rounded-xl bg-[#f4f1eb] text-xs text-[#101820]/80 italic mb-3">
                        &ldquo;{visit.message}&rdquo;
                      </div>
                    )}

                    {/* Extra Charge — add-on work billed on top of this visit */}
                    <div className="flex items-center justify-between gap-2 border-t border-[#101820]/10 pt-3 mb-3">
                      <div className="flex items-center gap-2">
                        {renderExtraChargeBadge(visit) || (
                          <span className="inline-flex items-center gap-1.5 text-xs text-[#101820]/40">
                            <Receipt className="w-3.5 h-3.5 text-[#101820]/25" />
                            {t("admin.extraCharge.noCharge")}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() =>
                          editingExtraChargeId === visit.id ? cancelEditExtraCharge() : startEditExtraCharge(visit)
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          editingExtraChargeId === visit.id
                            ? "bg-[#101820] text-white"
                            : visit.extra_charge_amount
                            ? "bg-[#f4f1eb] text-[#101820]/70 hover:bg-[#b99a6b]/20 hover:text-[#101820]"
                            : "bg-[#b99a6b]/15 text-[#101820] border border-[#b99a6b]/30 hover:bg-[#b99a6b]/25"
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        {visit.extra_charge_amount ? t("admin.extraCharge.editCharge") : t("admin.extraCharge.addCharge")}
                      </button>
                    </div>
                    {renderExtraChargePanel(visit) && (
                      <div className="mb-3">{renderExtraChargePanel(visit)}</div>
                    )}

                    {/* Consultation toggle — appears once the exam is completed and
                        the patient has a consultation. Flip it on/off (yes/no).
                        The clinical record itself now lives only in the
                        standalone Medical Records page (admin-only). */}
                    {examsWithMatchedConsultation.has(visit.id) && (
                      <div className="flex items-center gap-1.5 border-t border-[#101820]/10 pt-3 mb-3">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          {t("admin.common.consultation")}
                        </span>
                        <button
                          onClick={() =>
                            handleSetConsultationHint(visit.id, !visit.consultation_hint_dismissed)
                          }
                          title={
                            visit.consultation_hint_dismissed
                              ? t("admin.common.showConsultationTitle")
                              : t("admin.common.hideConsultationTitle")
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            !visit.consultation_hint_dismissed
                              ? "bg-[#b99a6b] text-[#101820] hover:bg-[#b99a6b]/85 shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-[#b99a6b]/20 hover:text-[#101820]"
                          }`}
                        >
                          <Stethoscope className="w-3.5 h-3.5" />
                          {visit.consultation_hint_dismissed ? t("admin.common.noConsultation") : t("admin.common.hasConsultation")}
                        </button>
                      </div>
                    )}

                    {/* Status Update Control for this visit */}
                    <div className="flex items-center justify-between border-t border-[#101820]/10 pt-2.5">
                      <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider">
                        {t("admin.record.updateStatus")}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleStatusChange(visit.id, "confirmed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            visit.status === "confirmed"
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-emerald-500/10 hover:text-emerald-800"
                          }`}
                        >
                          {t("admin.common.confirm")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(visit.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            visit.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-800"
                          }`}
                        >
                          {t("admin.common.complete")}
                        </button>
                        <button
                          onClick={() => handleStatusChange(visit.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            visit.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          {t("admin.common.cancel")}
                        </button>
                      </div>
                    </div>

                    {(visit.branch_name || visit.updated_by) && (
                      <div className="flex items-center gap-3 border-t border-[#101820]/10 pt-2.5 mt-2.5 text-[0.65rem] text-[#101820]/45">
                        {visit.branch_name && (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {t("admin.record.branch")}: {visit.branch_name}
                          </span>
                        )}
                        {visit.updated_by && (
                          <span>
                            {t("admin.record.updatedBy")}: {visit.updated_by}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: CREATE NEW APPOINTMENT (STAFF MANUAL ADD) ───────────────── */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101820]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4">
              <div>
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#b99a6b]">
                  {t("admin.newBooking.staffRegistration")}
                </span>
                <h3 className="font-serif text-xl font-medium text-[#101820] mt-0.5">
                  {t("admin.newBooking.title", { date: selectedDate })}
                </h3>
              </div>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1.5 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateNewBooking} className="space-y-4 text-xs">
              {newFormError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600">
                  {newFormError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#101820]/60 mb-1">
                    {t("admin.newBooking.fullNameLabel")}
                  </label>
                  <input
                    type="text"
                    required
                    value={newForm.full_name}
                    onChange={(e) =>
                      setNewForm({ ...newForm, full_name: e.target.value })
                    }
                    className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                    placeholder={t("admin.newBooking.fullNamePlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-[#101820]/60 mb-1">
                    {t("admin.newBooking.phoneLabel")}
                  </label>
                  <input
                    type="tel"
                    required
                    value={newForm.phone}
                    onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                    className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                    placeholder="+20 100 000 0000"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#101820]/60 mb-1">{t("admin.newBooking.emailLabel")}</label>
                <input
                  type="email"
                  value={newForm.email}
                  onChange={(e) => setNewForm({ ...newForm, email: e.target.value })}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  placeholder="patient@example.com"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[#101820]/60 mb-1">{t("admin.newBooking.serviceLabel")}</label>
                  <select
                    value={newForm.treatment}
                    onChange={(e) =>
                      setNewForm({ ...newForm, treatment: e.target.value })
                    }
                    className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  >
                    {SERVICE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#101820]/60 mb-1">{t("admin.newBooking.dateLabel")}</label>
                  <input
                    type="date"
                    required
                    value={newForm.date}
                    onChange={(e) => setNewForm({ ...newForm, date: e.target.value })}
                    className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  />
                </div>
              </div>
              <p className="text-[0.65rem] text-[#101820]/40 -mt-2">
                {t("admin.newBooking.queueNote")}
              </p>

              <div>
                <label className="block text-[#101820]/60 mb-1">
                  {t("admin.newBooking.messageLabel")}
                </label>
                <textarea
                  rows={2}
                  value={newForm.message}
                  onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b] resize-none"
                  placeholder={t("admin.newBooking.messagePlaceholder")}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/70 text-xs font-medium transition-colors"
                >
                  {t("admin.extraCharge.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmittingNew ? t("admin.newBooking.submitting") : t("admin.newBooking.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
