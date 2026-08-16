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
} from "lucide-react";
import {
  ApiError,
  Booking,
  BookingStatus,
  getToken,
  loginAdmin,
  removeToken,
  fetchBookings,
  updateBookingStatus,
  updateArrivalStatus,
  updateConsultationHintDismissed,
  updateExtraCharge,
  deleteBooking,
  submitBooking,
  checkBackendHealth,
} from "@/lib/api";
import { TREATMENT_OPTIONS, SERVICE_OPTIONS, CONSULTATION_SERVICE } from "@/lib/constants";

/** A booking is a consultation when the backend tagged its service type. */
const isConsultation = (b: Booking) => b.service_type === "consultation";

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
  const [token, setTokenState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Auth form state
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dashboard view mode: "agenda" (Day view), "table" (All bookings) or
  // "consultations" (only consultation requests, across all days).
  const [viewMode, setViewMode] = useState<"agenda" | "table" | "consultations">("agenda");

  // Selected Date for Agenda View (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  // Month & Year Filter States (for reviewing past month/year records)
  const [selectedMonth, setSelectedMonth] = useState<string>("all"); // "all", "01".."12"
  const [selectedYear, setSelectedYear] = useState<string>("all");   // "all", "2024".."2027"
  const [datePreset, setDatePreset] = useState<string>("all");       // "all", "today", "this_month", "last_month", "this_year"

  // Refresh feedback state
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToast, setRefreshToast] = useState(false);

  // Day Agenda horizontal pill bar — lets us page with the arrow buttons and
  // auto-scroll to keep the selected day in view.
  const dayPillsScrollRef = useRef<HTMLDivElement>(null);
  const scrollDayPills = (direction: "left" | "right") => {
    const container = dayPillsScrollRef.current;
    if (!container) return;
    const amount = container.clientWidth * 0.6 * (direction === "left" ? -1 : 1);
    container.scrollBy({ left: amount, behavior: "smooth" });
  };

  // Let a plain mouse wheel page the day pills sideways. React attaches its
  // synthetic onWheel as a passive listener, so preventDefault() there is
  // silently ignored by the browser and the page scrolls vertically at the
  // same time — a native, explicitly non-passive listener is required to
  // actually suppress that page scroll.
  useEffect(() => {
    const container = dayPillsScrollRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    };
    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [viewMode]);

  // Dashboard data state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modal states
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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
    date: new Date().toISOString().split("T")[0],
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

  // Fetch bookings when token is present
  useEffect(() => {
    if (token) {
      loadBookings();
    }
  }, [token]);

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      const activeToken = token || "";
      const online = await checkBackendHealth();
      setIsOnline(online);
      const data = await fetchBookings(activeToken);
      setBookings(data);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        removeToken();
        setTokenState(null);
        setAuthError("Your session has expired — please sign in again. Your data is safe.");
      }
    } finally {
      setIsLoading(false);
    }
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

  const handleStatusChange = async (bookingId: number, newStatus: BookingStatus) => {
    // Optimistic UI update
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b))
    );
    if (selectedBooking && selectedBooking.id === bookingId) {
      setSelectedBooking((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

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
      setNewFormError("Please fill out Patient Name, Phone, and Preferred Date.");
      return;
    }

    setIsSubmittingNew(true);
    setNewFormError("");
    try {
      await submitBooking({
        full_name: newForm.full_name,
        phone: newForm.phone,
        email: newForm.email || undefined,
        treatment: newForm.treatment,
        service_type: newForm.treatment === CONSULTATION_SERVICE ? "consultation" : "treatment",
        date: newForm.date,
        message: newForm.message || undefined,
        payment_method: "clinic",
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
      setNewFormError(err instanceof ApiError ? err.message : "Failed to create appointment.");
    } finally {
      setIsSubmittingNew(false);
    }
  };

  const todayIso = () => new Date().toISOString().split("T")[0];

  const canMarkEntered = (b: Booking) => b.date === todayIso() && b.status !== "cancelled";

  const handleToggleArrival = async (b: Booking) => {
    setArrivalError("");
    setArrivalUpdatingId(b.id);
    const nextArrived = !b.patient_arrived;
    try {
      const updated = await updateArrivalStatus(token || "", b.id, nextArrived);
      setBookings((prev) => prev.map((x) => (x.id === b.id ? updated : x)));
      if (selectedBooking?.id === b.id) setSelectedBooking(updated);
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
    setBookings((prev) =>
      prev.map((b) => (b.id === bookingId ? { ...b, consultation_hint_dismissed: dismissed } : b))
    );
    if (selectedBooking?.id === bookingId) {
      setSelectedBooking((prev) => (prev ? { ...prev, consultation_hint_dismissed: dismissed } : prev));
    }
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
      setExtraChargeError("Enter a valid amount (0 or more).");
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
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      if (selectedBooking?.id === bookingId) setSelectedBooking(updated);
      setEditingExtraChargeId(null);
    } catch (err) {
      setExtraChargeError(err instanceof ApiError ? err.message : "Could not save the extra charge.");
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
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? updated : b)));
      if (selectedBooking?.id === bookingId) setSelectedBooking(updated);
      setEditingExtraChargeId(null);
    } catch (err) {
      setExtraChargeError(err instanceof ApiError ? err.message : "Could not remove the extra charge.");
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
        +{b.extra_charge_amount.toLocaleString()} EGP {b.extra_charge_paid ? "· Paid" : "· Unpaid"}
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
          Extra Charge
          <span className="font-normal normal-case tracking-normal text-[#101820]/50">
            — e.g. crown, filling, add-on work
          </span>
        </div>
        {extraChargeError && (
          <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {extraChargeError}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr_9rem] gap-3">
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">Amount</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.01"
                value={extraChargeDraft.amount}
                onChange={(e) => setExtraChargeDraft((d) => ({ ...d, amount: e.target.value }))}
                placeholder="0"
                className="w-full bg-white border border-[#101820]/15 rounded-xl pl-3 pr-11 py-2 text-sm font-medium text-[#101820] outline-none focus:border-[#b99a6b]"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[0.65rem] font-medium text-[#101820]/40">
                EGP
              </span>
            </div>
          </div>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
              What for?
            </label>
            <input
              type="text"
              value={extraChargeDraft.description}
              onChange={(e) => setExtraChargeDraft((d) => ({ ...d, description: e.target.value }))}
              placeholder="e.g. Crown fitting"
              className="w-full bg-white border border-[#101820]/15 rounded-xl px-3 py-2 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
            />
          </div>
          <div>
            <label className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
              Status
            </label>
            <label className="flex items-center gap-2 h-[calc(100%-0px)] px-3 py-2 rounded-xl bg-white border border-[#101820]/15 text-xs text-[#101820] cursor-pointer">
              <input
                type="checkbox"
                checked={extraChargeDraft.paid}
                onChange={(e) => setExtraChargeDraft((d) => ({ ...d, paid: e.target.checked }))}
                className="accent-[#b99a6b] w-3.5 h-3.5"
              />
              Paid already
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={() => handleSaveExtraCharge(b.id)}
            disabled={saving}
            className="px-4 py-1.5 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Charge"}
          </button>
          {typeof b.extra_charge_amount === "number" && b.extra_charge_amount > 0 && (
            <button
              onClick={() => handleRemoveExtraCharge(b.id)}
              disabled={saving}
              className="px-4 py-1.5 rounded-xl bg-red-500/10 text-red-700 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <button
            onClick={cancelEditExtraCharge}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-[#101820]/15 text-[#101820]/70 text-xs font-medium hover:bg-[#101820]/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  };

  // Derived selected Year & Month for the Day Agenda View
  const selectedYearNum = useMemo(() => {
    try {
      return parseInt(selectedDate.split("-")[0], 10) || new Date().getFullYear();
    } catch {
      return new Date().getFullYear();
    }
  }, [selectedDate]);

  const selectedMonthNum = useMemo(() => {
    try {
      return parseInt(selectedDate.split("-")[1], 10) - 1 || new Date().getMonth();
    } catch {
      return new Date().getMonth();
    }
  }, [selectedDate]);

  // Compute ALL DAYS OF THE ENTIRE MONTH for the Agenda View day picker bar (1..30/31)
  const monthDaysPills = useMemo(() => {
    const year = selectedYearNum;
    const month = selectedMonthNum;
    const totalDays = new Date(year, month + 1, 0).getDate();
    const todayIso = new Date().toISOString().split("T")[0];
    const result = [];

    for (let day = 1; day <= totalDays; day++) {
      const dateObj = new Date(year, month, day);
      const mm = (month + 1).toString().padStart(2, "0");
      const dd = day.toString().padStart(2, "0");
      const iso = `${year}-${mm}-${dd}`;

      const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
      const dayNameAr = dateObj.toLocaleDateString("ar-EG", { weekday: "short" });
      const isToday = iso === todayIso;

      result.push({
        iso,
        day,
        dayName,
        dayNameAr,
        isToday,
      });
    }
    return result;
  }, [selectedYearNum, selectedMonthNum]);

  // Keep the selected day's pill in view whenever it changes (date picker,
  // month switch, or a click elsewhere) instead of leaving staff to hunt for
  // it by hand in the horizontal scroller.
  useEffect(() => {
    const container = dayPillsScrollRef.current;
    if (!container) return;
    const selectedPill = container.querySelector<HTMLButtonElement>(
      `[data-iso="${selectedDate}"]`
    );
    selectedPill?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selectedDate, monthDaysPills]);

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

  // All bookings for the selected patient when Eye icon is clicked
  const selectedPatientVisits = useMemo(() => {
    if (!selectedBooking) return [];
    return bookings
      .filter((b) => phonesMatch(b.phone, selectedBooking.phone) || (b.email && selectedBooking.email && b.email.toLowerCase() === selectedBooking.email.toLowerCase()))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [bookings, selectedBooking]);

  // Filtered & Searched Bookings list for Table View & Month/Year Scope
  const filteredBookings = useMemo(() => {
    const now = new Date();
    const currentIso = now.toISOString().split("T")[0];
    const currentYearMonth = currentIso.substring(0, 7);
    const currentYear = currentIso.substring(0, 4);

    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYearMonth = prevDate.toISOString().split("T")[0].substring(0, 7);

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

      return matchesStatus && matchesQuery && matchesMonth && matchesYear && matchesPreset;
    });
  }, [bookings, statusFilter, searchQuery, selectedMonth, selectedYear, datePreset]);

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

  // Every COMPLETED exam that has the same patient's consultation (matched by
  // phone), IGNORING the show/hide flag. Drives whether the "Has consultation"
  // toggle button appears at all — so staff can flip it back on after hiding it.
  const examsWithMatchedConsultation = useMemo(() => {
    const consults = bookings.filter(isConsultation);
    const map = new Map<number, Booking>();
    for (const b of bookings) {
      if (b.status !== "completed" || isConsultation(b)) continue;
      const match = consults.find((c) => phonesMatch(c.phone, b.phone));
      if (match) map.set(b.id, match);
    }
    return map;
  }, [bookings]);

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

  // Statistics calculation
  const stats = useMemo(() => {
    const total = bookings.length;
    const pending = bookings.filter((b) => b.status === "pending").length;
    const confirmed = bookings.filter((b) => b.status === "confirmed").length;
    const completed = bookings.filter((b) => b.status === "completed").length;
    const cancelled = bookings.filter((b) => b.status === "cancelled").length;
    const todayCount = bookings.filter(
      (b) => b.date === new Date().toISOString().split("T")[0]
    ).length;
    return { total, pending, confirmed, completed, cancelled, todayCount };
  }, [bookings]);

  const selectedDateFormatted = useMemo(() => {
    try {
      const [year, month, day] = selectedDate.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      const en = d.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const ar = d.toLocaleDateString("ar-EG", { weekday: "long" });
      return { en, ar };
    } catch {
      return { en: selectedDate, ar: "" };
    }
  }, [selectedDate]);

  if (!mounted) return null;

  // ── 1. LOGIN SCREEN (CLINIC LUXURY CREAM & GOLD THEME) ─────────────────────
  if (!token) {
    return (
      <main className="min-h-screen w-full bg-[#f4f1eb] text-[#101820] flex items-center justify-center p-6 selection:bg-[#b99a6b] selection:text-white">
        <div className="relative w-full max-w-md bg-white border border-[#101820]/10 rounded-3xl p-8 shadow-2xl">
          {/* Header Monogram */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="h-16 w-16 rounded-2xl bg-[#101820] text-[#b99a6b] flex items-center justify-center font-serif text-2xl font-bold shadow-md mb-4">
              LD
            </div>
            <h1 className="font-serif text-2xl font-medium tracking-tight text-[#101820]">
              Lumina Dental Portal
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] text-[#b99a6b] mt-1">
              Clinic Management & Day Schedule
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
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-3 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#101820] placeholder-[#101820]/30 outline-none focus:border-[#b99a6b] focus:ring-2 focus:ring-[#b99a6b]/20 transition-all"
                  placeholder="admin"
                />
              </div>
            </div>

            <div>
              <label className="block text-[0.68rem] font-medium uppercase tracking-[0.18em] text-[#101820]/60 mb-2">
                Password
              </label>
              <div className="relative">
                <ShieldCheck className="absolute left-3.5 top-3 w-4 h-4 text-[#101820]/40" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#101820] placeholder-[#101820]/30 outline-none focus:border-[#b99a6b] focus:ring-2 focus:ring-[#b99a6b]/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full mt-2 py-3.5 rounded-xl bg-[#101820] text-[#f4f1eb] font-medium text-xs uppercase tracking-[0.2em] shadow-lg hover:bg-[#101820]/90 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isLoggingIn ? "Authenticating..." : "Sign In to Admin Portal"}
            </button>

            {/* Quick Helper Credentials Hint */}
            <div className="pt-4 border-t border-[#101820]/10 text-center text-xs text-[#101820]/50 space-y-1">
              <p>Default Credentials:</p>
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
                Lumina Dental Clinic
              </h1>
              <p className="text-[0.65rem] uppercase tracking-[0.2em] text-[#b99a6b]">
                Clinic Administration & Schedule
              </p>
            </div>
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
                <span>Day Agenda</span>
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
                <span>All Bookings</span>
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
                <span>Consultations</span>
                {consultationBookings.length + completedExamsWithConsultation.length > 0 && (
                  <span
                    className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold leading-none ${
                      viewMode === "consultations"
                        ? "bg-[#b99a6b] text-[#101820]"
                        : "bg-[#101820]/10 text-[#101820]"
                    }`}
                  >
                    {consultationBookings.length + completedExamsWithConsultation.length}
                  </span>
                )}
              </button>
            </div>

            {/* Backend connection status pill */}
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[0.68rem] font-medium border ${
                isOnline
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                  : "bg-amber-500/10 border-amber-500/30 text-amber-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                }`}
              />
              {isOnline ? "FastAPI Online" : "Demo Mode"}
            </span>

            <button
              onClick={() => {
                setNewForm((prev) => ({ ...prev, date: selectedDate }));
                setShowNewModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4 text-[#b99a6b]" />
              <span>+ New Appointment</span>
            </button>

            <div className="relative flex items-center">
              <button
                onClick={handleManualRefresh}
                disabled={isLoading || isRefreshing}
                title="Refresh bookings from server"
                className="p-2 rounded-xl bg-white border border-[#101820]/10 hover:bg-[#101820]/5 text-[#101820]/70 transition-colors shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading || isRefreshing ? "animate-spin text-[#b99a6b]" : ""}`} />
              </button>
              {refreshToast && (
                <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.68rem] font-medium text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-md shadow-md animate-in fade-in z-40">
                  ✓ Refreshed!
                </span>
              )}
            </div>

            <button
              onClick={handleLogout}
              title="Log out"
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
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Analytics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-[#101820]/10 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-[#101820]/50">
                Total Bookings
              </span>
              <Building2 className="w-5 h-5 text-[#b99a6b]" />
            </div>
            <div className="font-serif text-3xl font-medium text-[#101820]">
              {stats.total}
            </div>
            <p className="text-[0.7rem] text-[#101820]/40 mt-1">All time records</p>
          </div>

          <div className="bg-white border border-amber-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-amber-700">
                Pending Approval
              </span>
              <Clock3 className="w-5 h-5 text-amber-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-amber-700">
              {stats.pending}
            </div>
            <p className="text-[0.7rem] text-amber-600/70 mt-1">Requires confirmation</p>
          </div>

          <div className="bg-white border border-emerald-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-emerald-700">
                Confirmed Slots
              </span>
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-emerald-700">
              {stats.confirmed}
            </div>
            <p className="text-[0.7rem] text-emerald-600/70 mt-1">Ready for visit</p>
          </div>

          <div className="bg-white border border-blue-500/30 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-blue-700">
                Completed
              </span>
              <Sparkles className="w-5 h-5 text-blue-600" />
            </div>
            <div className="font-serif text-3xl font-medium text-blue-700">
              {stats.completed}
            </div>
            <p className="text-[0.7rem] text-blue-600/70 mt-1">Finished treatments</p>
          </div>
        </div>

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
                    {selectedDateFormatted.ar && (
                      <span className="text-[#b99a6b] font-medium text-base">
                        ({selectedDateFormatted.ar})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#101820]/50 mt-1">
                    Showing all patient appointments scheduled for this day (
                    <strong className="text-[#101820]">
                      {agendaBookings.length}
                    </strong>{" "}
                    patients)
                  </p>
                </div>

                {/* Agenda Search & Date Controls */}
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Input for Agenda */}
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search patient, phone (01x)..."
                      className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl pl-10 pr-8 py-1.5 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b]"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-2 text-[#101820]/40 hover:text-[#101820]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Custom Month & Date Picker */}
                  <div className="flex items-center gap-2">
                    {/* Month Picker */}
                    <select
                      value={(selectedMonthNum + 1).toString().padStart(2, "0")}
                      onChange={(e) => {
                        const mStr = e.target.value;
                        const dayStr = selectedDate.split("-")[2] || "01";
                        setSelectedDate(`${selectedYearNum}-${mStr}-${dayStr}`);
                      }}
                      className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                    >
                      {MONTH_NAMES.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>

                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                    />
                  </div>
                </div>
              </div>

              {/* Quick Day Pill Bar — All days of the selected month (1..30/31) */}
              <div className="space-y-2 pt-2 border-t border-[#101820]/10">
                <div className="flex items-center justify-between text-xs font-medium text-[#101820]/60">
                  <span className="uppercase tracking-wider text-[0.68rem] text-[#b99a6b] font-semibold">
                    🗓️ Days of Month ({monthDaysPills.length} Days)
                  </span>
                  <div className="flex items-center p-1 rounded-xl bg-white border border-[#101820]/10 shadow-sm">
                    <button
                      type="button"
                      onClick={() => scrollDayPills("left")}
                      className="p-1 rounded-lg text-[#101820]/60 hover:bg-[#101820] hover:text-white transition-colors"
                      title="Scroll to earlier days"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <div className="w-px h-3.5 bg-[#101820]/10 mx-0.5" />
                    <button
                      type="button"
                      onClick={() => scrollDayPills("right")}
                      className="p-1 rounded-lg text-[#101820]/60 hover:bg-[#101820] hover:text-white transition-colors"
                      title="Scroll to later days"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div
                  ref={dayPillsScrollRef}
                  data-lenis-prevent
                  className="flex items-center gap-2 overflow-x-auto pt-3 pb-2 scrollbar-none"
                >
                  {monthDaysPills.map((pill) => {
                    const countForDay = bookings.filter(
                      (b) => b.date === pill.iso
                    ).length;
                    const isSelected = selectedDate === pill.iso;
                    return (
                      <button
                        key={pill.iso}
                        data-iso={pill.iso}
                        onClick={() => setSelectedDate(pill.iso)}
                        className={`flex flex-col items-center py-2 px-3 rounded-xl transition-all whitespace-nowrap min-w-[4.2rem] border relative ${
                          isSelected
                            ? "bg-[#101820] text-[#f4f1eb] border-[#101820] shadow-md scale-[1.04]"
                            : pill.isToday
                            ? "bg-[#b99a6b]/15 border-[#b99a6b]/40 text-[#101820]"
                            : "bg-[#f4f1eb]/70 hover:bg-[#f4f1eb] border-[#101820]/10 text-[#101820]"
                        }`}
                      >
                        {pill.isToday && (
                          <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-10 bg-[#b99a6b] text-[#101820] text-[0.52rem] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded-full shadow-sm whitespace-nowrap">
                            Today
                          </span>
                        )}
                        <span
                          className={`text-[0.62rem] uppercase tracking-wider font-medium ${
                            isSelected ? "text-[#b99a6b]" : "text-[#101820]/60"
                          }`}
                        >
                          {pill.dayName}
                        </span>
                        <span className="font-serif text-base font-bold mt-0.5">
                          {pill.day}
                        </span>
                        {countForDay > 0 ? (
                          <span
                            className={`mt-0.5 text-[0.6rem] px-1.5 py-0.2 rounded-full font-semibold ${
                              isSelected
                                ? "bg-[#b99a6b] text-[#101820]"
                                : "bg-[#101820]/15 text-[#101820]"
                            }`}
                          >
                            {countForDay}
                          </span>
                        ) : (
                          <span className="mt-0.5 text-[0.58rem] opacity-30">—</span>
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
                    No appointments scheduled for this day
                  </h3>
                  <p className="text-xs text-[#101820]/60 leading-relaxed">
                    There are no patient bookings on {selectedDateFormatted.en}. You can
                    add a walk-in or phone appointment manually using the button below.
                  </p>
                  <button
                    onClick={() => {
                      setNewForm((prev) => ({ ...prev, date: selectedDate }));
                      setShowNewModal(true);
                    }}
                    className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow"
                  >
                    <Plus className="w-4 h-4 text-[#b99a6b]" />
                    <span>Book Patient for {selectedDate}</span>
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
                          Queue #{b.queue_number ?? "—"}
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
                          {b.patient_arrived ? "Entered" : "Not Entered"}
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
                              ? "Paid Online"
                              : "Online — Pending"
                            : "Pay at Clinic"}
                        </span>

                        {/* Extra Charge Badge — add-on work billed on top of the base appointment */}
                        {renderExtraChargeBadge(b)}

                        {/* Consultation flag — distinguishes it from a treatment */}
                        {isConsultation(b) && (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                            <Stethoscope className="w-3.5 h-3.5" />
                            Consultation
                          </span>
                        )}

                        {/* Treatment / Service Name */}
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-serif font-medium border border-[#101820]/10">
                          {b.treatment}
                        </span>

                        {/* Completed exam whose patient also has a consultation */}
                        {consultationForCompletedId.get(b.id) && (
                          <span
                            title={`Consultation booked for ${consultationForCompletedId.get(b.id)?.date}`}
                            className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold"
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            Has consultation
                            <button
                              onClick={() => handleSetConsultationHint(b.id, true)}
                              title="Dismiss this reminder"
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
                          <span>Call</span>
                        </a>

                        <a
                          href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </a>

                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                          title="View Full Info"
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
                          title="Add / edit extra charge"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>

                        <button
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                          title="Delete Appointment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Status quick switcher buttons */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          Status:
                        </span>
                        <button
                          onClick={() => handleStatusChange(b.id, "confirmed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "confirmed"
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-emerald-500/10 hover:text-emerald-700"
                          }`}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-700"
                          }`}
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          Cancel
                        </button>
                      </div>

                      {/* Arrival control — backend enforces booking date == today AND within working hours */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          Arrival:
                        </span>
                        <button
                          onClick={() => handleToggleArrival(b)}
                          disabled={arrivalUpdatingId === b.id || (!b.patient_arrived && !canMarkEntered(b))}
                          title={
                            !b.patient_arrived && !canMarkEntered(b)
                              ? "Can only mark as entered on the booking date, during working hours"
                              : undefined
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                            b.patient_arrived
                              ? "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                              : "bg-emerald-600 text-white hover:bg-emerald-700 shadow disabled:hover:bg-emerald-600"
                          }`}
                        >
                          {arrivalUpdatingId === b.id ? (
                            "Updating…"
                          ) : b.patient_arrived ? (
                            <>
                              <UserX className="w-3.5 h-3.5" /> Mark as Not Entered
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" /> Mark as Entered
                            </>
                          )}
                        </button>
                      </div>

                      {/* Consultation toggle — appears once the exam is completed and
                          the patient has a consultation. Flip it on/off (yes/no). */}
                      {examsWithMatchedConsultation.has(b.id) && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                            Consultation:
                          </span>
                          <button
                            onClick={() =>
                              handleSetConsultationHint(b.id, !b.consultation_hint_dismissed)
                            }
                            title={
                              b.consultation_hint_dismissed
                                ? "This patient has a consultation — click to show it"
                                : "Click to remove the consultation reminder"
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                              !b.consultation_hint_dismissed
                                ? "bg-[#b99a6b] text-[#101820] hover:bg-[#b99a6b]/85 shadow"
                                : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-[#b99a6b]/20 hover:text-[#101820]"
                            }`}
                          >
                            <Stethoscope className="w-3.5 h-3.5" />
                            {b.consultation_hint_dismissed ? "No consultation" : "Has consultation"}
                          </button>
                        </div>
                      )}
                    </div>
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
                  { id: "all", label: "All" },
                  { id: "pending", label: "Pending" },
                  { id: "confirmed", label: "Confirmed" },
                  { id: "completed", label: "Completed" },
                  { id: "cancelled", label: "Cancelled" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-4 py-2 rounded-xl text-xs font-medium uppercase tracking-[0.15em] transition-all whitespace-nowrap ${
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
                  <option value="all">📅 All Dates (جميع التواريخ)</option>
                  <option value="today">⚡ Today (اليوم)</option>
                  <option value="this_month">🗓️ This Month (هذا الشهر)</option>
                  <option value="last_month">⏳ Last Month (الشهر الماضي)</option>
                  <option value="this_year">🏛️ This Year (هذه السنة)</option>
                </select>

                {/* Month Dropdown */}
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(e.target.value);
                    setDatePreset("all");
                  }}
                  className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                >
                  <option value="all">Month: All (كل الشهور)</option>
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
                  }}
                  className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] font-medium outline-none focus:border-[#b99a6b]"
                >
                  <option value="all">Year: All (كل السنين)</option>
                  {availableYears.map((yr) => (
                    <option key={yr} value={yr}>
                      Year {yr}
                    </option>
                  ))}
                </select>
              </div>

              {/* Search Box */}
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search patient, treatment, phone..."
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl pl-10 pr-4 py-2 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b] transition-colors"
                />
              </div>
            </div>

            {/* Table Container */}
            <div className="bg-white border border-[#101820]/10 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#101820]/10 bg-[#f4f1eb]/50 text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#101820]/50">
                      <th className="py-4 px-6">Patient</th>
                      <th className="py-4 px-6">Treatment</th>
                      <th className="py-4 px-6">Date & Queue</th>
                      <th className="py-4 px-6">Payment</th>
                      <th className="py-4 px-6">Arrival</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#101820]/5 text-sm">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#101820]/50">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="w-8 h-8 text-[#b99a6b]" />
                            <p className="font-serif text-base text-[#101820]">
                              No bookings found
                            </p>
                            <p className="text-xs text-[#101820]/50">
                              Try adjusting your search query or status filter.
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
                                  Consultation
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f4f1eb] border border-[#101820]/10 text-xs font-serif text-[#101820]">
                                  {b.treatment}
                                </span>
                              )}
                              {consultationForCompletedId.get(b.id) && (
                                <span
                                  title={`Consultation booked for ${consultationForCompletedId.get(b.id)?.date}`}
                                  className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg bg-[#b99a6b] text-[#101820] text-[0.68rem] font-semibold"
                                >
                                  <Stethoscope className="w-3 h-3" />
                                  Has consultation
                                  <button
                                    onClick={() => handleSetConsultationHint(b.id, true)}
                                    title="Dismiss this reminder"
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
                              <span>Queue #{b.queue_number ?? "—"}</span>
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
                                  ? "Paid Online"
                                  : "Online — Pending"
                                : "Pending — Pay at Clinic"}
                            </span>
                            {b.extra_charge_amount ? (
                              <div className="mt-1.5">{renderExtraChargeBadge(b)}</div>
                            ) : null}
                          </td>

                          {/* Arrival */}
                          <td className="py-4 px-6">
                            <button
                              onClick={() => handleToggleArrival(b)}
                              disabled={arrivalUpdatingId === b.id || (!b.patient_arrived && !canMarkEntered(b))}
                              title={
                                !b.patient_arrived && !canMarkEntered(b)
                                  ? "Can only mark as entered on the booking date, during working hours"
                                  : undefined
                              }
                              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                                b.patient_arrived
                                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 hover:bg-red-500/10 hover:text-red-700"
                                  : "bg-[#101820]/5 border border-[#101820]/15 text-[#101820]/60 hover:bg-emerald-500/10 hover:text-emerald-700"
                              }`}
                            >
                              {b.patient_arrived ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                              {arrivalUpdatingId === b.id ? "…" : b.patient_arrived ? "Entered" : "Not Entered"}
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
                              <option value="pending">🟡 Pending</option>
                              <option value="confirmed">🟢 Confirmed</option>
                              <option value="completed">🔵 Completed</option>
                              <option value="cancelled">🔴 Cancelled</option>
                            </select>
                          </td>

                          {/* Action Buttons */}
                          <td className="py-4 px-6 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setSelectedBooking(b)}
                                title="View details"
                                className="p-2 rounded-lg bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/10 transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDelete(b.id)}
                                disabled={deletingId === b.id}
                                title="Delete record"
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
                    Consultation Requests
                  </h2>
                  <p className="text-xs text-[#101820]/50 mt-0.5">
                    Consultation requests (
                    <strong className="text-[#101820]">{consultationBookings.length}</strong>) plus
                    completed exams whose patient has a consultation to follow (
                    <strong className="text-[#101820]">{completedExamsWithConsultation.length}</strong>).
                  </p>
                </div>
              </div>

              {/* Search Box for Consultations */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#101820]/40" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search consultation by phone, patient name..."
                  className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl pl-10 pr-8 py-2 text-xs text-[#101820] placeholder-[#101820]/40 outline-none focus:border-[#b99a6b] transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-2.5 text-[#101820]/40 hover:text-[#101820]"
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
                    No consultation requests yet
                  </h3>
                  <p className="text-xs text-[#101820]/60 leading-relaxed">
                    When a patient books a &ldquo;Consultation&rdquo; from the website, it appears here —
                    separate from normal treatment appointments.
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
                          Consultation
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
                          Queue #{b.queue_number ?? "—"}
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
                          <CalendarClock className="w-3.5 h-3.5" /> Requested {formatCreatedAt(b.created_at)}
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
                          <span>Call</span>
                        </a>
                        <a
                          href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                          <span>WhatsApp</span>
                        </a>
                        <button
                          onClick={() => setSelectedBooking(b)}
                          className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                          title="View Full Info"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(b.id)}
                          className="p-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-600 transition-colors"
                          title="Delete Consultation"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Status switcher */}
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider mr-1">
                          Status:
                        </span>
                        <button
                          onClick={() => handleStatusChange(b.id, "confirmed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "confirmed"
                              ? "bg-emerald-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-emerald-500/10 hover:text-emerald-700"
                          }`}
                        >
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-700"
                          }`}
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStatusChange(b.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            b.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          Cancel
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
                            Completed exam
                          </span>
                          {/* Follow-up consultation flag + remove-from-list ✕ */}
                          <span className="inline-flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-xl bg-[#b99a6b] text-[#101820] text-xs font-semibold">
                            <Stethoscope className="w-3.5 h-3.5" />
                            Has consultation
                            <button
                              onClick={() => handleSetConsultationHint(b.id, true)}
                              title="Remove from this list"
                              className="ml-0.5 rounded-full p-0.5 text-[#101820]/70 hover:bg-[#101820]/15 hover:text-[#101820] transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-medium border border-[#101820]/10">
                            <ListFilter className="w-3.5 h-3.5 text-[#b99a6b]" />
                            Queue #{b.queue_number ?? "—"}
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
                            <FileText className="w-3.5 h-3.5 text-[#b99a6b]" /> Exam: {b.treatment}
                          </span>
                          <span className="flex items-center gap-1.5">
                            <CalendarIcon className="w-3.5 h-3.5 text-[#b99a6b]" /> Exam day {b.date}
                          </span>
                          {linked && (
                            <span className="flex items-center gap-1.5 text-[#b99a6b] font-medium">
                              <Stethoscope className="w-3.5 h-3.5" /> Consultation {linked.date} · {linked.status}
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
                            <span>Call</span>
                          </a>
                          <a
                            href={`https://wa.me/${b.phone.replace(/[^0-9]/g, "")}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-xs text-emerald-800 transition-colors"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                            <span>WhatsApp</span>
                          </a>
                          <button
                            onClick={() => setSelectedBooking(b)}
                            className="p-1.5 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white border border-[#101820]/15 text-[#101820] transition-colors"
                            title="View Full Info"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => handleSetConsultationHint(b.id, true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700 border border-[#101820]/15 text-xs transition-colors"
                          title="Remove this follow-up from the consultations list"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove from list</span>
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
                      Patient Record
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
                  Total Visits (إجمالي الزيارات)
                </span>
                <span className="font-serif text-xl font-bold text-[#101820]">
                  {selectedPatientVisits.length} Visit{selectedPatientVisits.length > 1 ? "s" : ""}
                </span>
              </div>
              <div>
                <span className="block text-[0.65rem] uppercase tracking-wider text-emerald-800 font-medium">
                  Completed (الزيارات المكتملة)
                </span>
                <span className="font-serif text-xl font-bold text-emerald-700">
                  {selectedPatientVisits.filter((v) => v.status === "completed").length}
                </span>
              </div>
              <div>
                <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 font-medium">
                  First Visit (أول زيارة)
                </span>
                <span className="font-serif text-sm font-semibold text-[#101820] mt-1 block">
                  {selectedPatientVisits[selectedPatientVisits.length - 1]?.date || "—"}
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
                  <span>Call {selectedBooking.phone}</span>
                </a>
                <a
                  href={`https://wa.me/${selectedBooking.phone.replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 hover:bg-emerald-500/20 text-xs font-medium transition-colors"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  <span>WhatsApp Chat</span>
                </a>
              </div>

              <button
                onClick={() => {
                  setNewForm({
                    full_name: selectedBooking.full_name,
                    phone: selectedBooking.phone,
                    email: selectedBooking.email || "",
                    treatment: TREATMENT_OPTIONS[0],
                    date: new Date().toISOString().split("T")[0],
                    message: "",
                  });
                  setSelectedBooking(null);
                  setShowNewModal(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium hover:bg-[#101820]/85 transition-colors shadow-sm"
              >
                <Plus className="w-3.5 h-3.5 text-[#b99a6b]" />
                <span>Book Next Visit</span>
              </button>
            </div>

            {/* Complete Patient Medical & Booking History List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-serif text-base font-medium text-[#101820] flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#b99a6b]" />
                  Patient Medical & Visit History (سجل الحجوزات والزيارات)
                </h4>
                <span className="text-xs text-[#101820]/50 font-mono">
                  {selectedPatientVisits.length} Record{selectedPatientVisits.length > 1 ? "s" : ""}
                </span>
              </div>

              <div className="space-y-3">
                {selectedPatientVisits.map((visit, index) => (
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
                          Visit #{selectedPatientVisits.length - index}
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
                          Service / Treatment
                        </span>
                        <span className="font-serif font-medium text-[#b99a6b] text-sm">
                          {visit.treatment}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          Queue Number
                        </span>
                        <span className="font-semibold text-[#101820]">
                          #{visit.queue_number ?? "—"}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          Payment Method
                        </span>
                        <span className="text-[#101820]">
                          {visit.payment_method === "online" ? "Online" : "Pay at Clinic"}
                        </span>
                      </div>

                      <div>
                        <span className="block text-[0.62rem] uppercase tracking-wider text-[#101820]/50">
                          Patient Arrival
                        </span>
                        <span
                          className={`font-medium ${
                            visit.patient_arrived ? "text-emerald-700" : "text-[#101820]/60"
                          }`}
                        >
                          {visit.patient_arrived ? "✓ Entered" : "Not Entered"}
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
                            No extra charge on this visit
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
                        {visit.extra_charge_amount ? "Edit Charge" : "Add Charge"}
                      </button>
                    </div>
                    {renderExtraChargePanel(visit) && (
                      <div className="mb-3">{renderExtraChargePanel(visit)}</div>
                    )}

                    {/* Status Update Control for this visit */}
                    <div className="flex items-center justify-between border-t border-[#101820]/10 pt-2.5">
                      <span className="text-[0.65rem] text-[#101820]/50 uppercase tracking-wider">
                        Update Status:
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
                          Confirm
                        </button>
                        <button
                          onClick={() => handleStatusChange(visit.id, "completed")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            visit.status === "completed"
                              ? "bg-blue-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-blue-500/10 hover:text-blue-800"
                          }`}
                        >
                          Complete
                        </button>
                        <button
                          onClick={() => handleStatusChange(visit.id, "cancelled")}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                            visit.status === "cancelled"
                              ? "bg-red-600 text-white shadow"
                              : "bg-[#f4f1eb] text-[#101820]/70 hover:bg-red-500/10 hover:text-red-700"
                          }`}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
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
                  Staff Registration
                </span>
                <h3 className="font-serif text-xl font-medium text-[#101820] mt-0.5">
                  New Appointment for {selectedDate}
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
                    Patient Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={newForm.full_name}
                    onChange={(e) =>
                      setNewForm({ ...newForm, full_name: e.target.value })
                    }
                    className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                    placeholder="e.g. Mahmoud Ali"
                  />
                </div>

                <div>
                  <label className="block text-[#101820]/60 mb-1">
                    Phone Number *
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
                <label className="block text-[#101820]/60 mb-1">Email (Optional)</label>
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
                  <label className="block text-[#101820]/60 mb-1">Service *</label>
                  <select
                    value={newForm.treatment}
                    onChange={(e) =>
                      setNewForm({ ...newForm, treatment: e.target.value })
                    }
                    className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  >
                    {SERVICE_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#101820]/60 mb-1">Booking Date *</label>
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
                A queue number is assigned automatically for this date — payment defaults to
                &ldquo;Pay at Clinic&rdquo; for staff-entered bookings.
              </p>

              <div>
                <label className="block text-[#101820]/60 mb-1">
                  Staff Note (Optional)
                </label>
                <textarea
                  rows={2}
                  value={newForm.message}
                  onChange={(e) => setNewForm({ ...newForm, message: e.target.value })}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b] resize-none"
                  placeholder="Notes from call or walk-in..."
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/70 text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingNew}
                  className="px-5 py-2 rounded-xl bg-[#101820] text-[#f4f1eb] text-xs font-medium uppercase tracking-[0.15em] hover:bg-[#101820]/85 transition-colors shadow-sm disabled:opacity-50"
                >
                  {isSubmittingNew ? "Saving..." : "Save Appointment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
