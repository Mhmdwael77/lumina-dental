"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
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
} from "lucide-react";
import {
  Booking,
  BookingStatus,
  getToken,
  loginAdmin,
  removeToken,
  fetchBookings,
  updateBookingStatus,
  deleteBooking,
  submitBooking,
  checkBackendHealth,
} from "@/lib/api";
import { TREATMENT_OPTIONS, TIME_OPTIONS } from "@/lib/constants";

export default function AdminPage() {
  const [token, setTokenState] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Auth form state
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [authError, setAuthError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Dashboard view mode: "agenda" (Day view) or "table" (All bookings)
  const [viewMode, setViewMode] = useState<"agenda" | "table">("agenda");

  // Selected Date for Agenda View (YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

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

  // New booking form state
  const [newForm, setNewForm] = useState<{
    full_name: string;
    phone: string;
    email: string;
    treatment: string;
    date: string;
    time: string;
    message: string;
  }>({
    full_name: "",
    phone: "",
    email: "",
    treatment: TREATMENT_OPTIONS[0],
    date: new Date().toISOString().split("T")[0],
    time: TIME_OPTIONS[0],
    message: "",
  });
  const [newFormError, setNewFormError] = useState("");
  const [isSubmittingNew, setIsSubmittingNew] = useState(false);

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
    } catch {
      // Handled in api helper
    } finally {
      setIsLoading(false);
    }
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
      const created = await submitBooking({
        full_name: newForm.full_name,
        phone: newForm.phone,
        email: newForm.email || undefined,
        treatment: newForm.treatment,
        date: newForm.date,
        time: newForm.time,
        message: newForm.message || undefined,
      });

      setBookings((prev) => [created, ...prev]);
      setShowNewModal(false);
      setNewForm({
        full_name: "",
        phone: "",
        email: "",
        treatment: TREATMENT_OPTIONS[0],
        date: selectedDate,
        time: TIME_OPTIONS[0],
        message: "",
      });
    } catch {
      setNewFormError("Failed to create appointment.");
    } finally {
      setIsSubmittingNew(false);
    }
  };

  // Helper date buttons (Today, Tomorrow, Sunday, Monday...)
  const dayQuickPills = useMemo(() => {
    const today = new Date();
    const result = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().split("T")[0];
      const dayName =
        i === 0
          ? "Today"
          : i === 1
          ? "Tomorrow"
          : d.toLocaleDateString("en-US", { weekday: "short" });
      const dayNameAr = d.toLocaleDateString("ar-EG", { weekday: "long" });
      const dateFormatted = d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      result.push({ iso, dayName, dayNameAr, dateFormatted });
    }
    return result;
  }, []);

  // Filtered Bookings for the selected day in Agenda View
  const agendaBookings = useMemo(() => {
    return bookings
      .filter((b) => b.date === selectedDate)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  }, [bookings, selectedDate]);

  // Filtered & Searched Bookings list for Table View
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchesStatus =
        statusFilter === "all" ? true : b.status === statusFilter;
      const query = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !query ||
        b.full_name.toLowerCase().includes(query) ||
        b.phone.toLowerCase().includes(query) ||
        (b.email && b.email.toLowerCase().includes(query)) ||
        b.treatment.toLowerCase().includes(query) ||
        b.date.includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [bookings, statusFilter, searchQuery]);

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

            <button
              onClick={loadBookings}
              disabled={isLoading}
              title="Refresh bookings"
              className="p-2 rounded-xl bg-white border border-[#101820]/10 hover:bg-[#101820]/5 text-[#101820]/70 transition-colors shadow-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </button>

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

                {/* Custom Date Picker */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-[#101820]/60 uppercase tracking-wider">
                    Select Date:
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-1.5 text-xs text-[#101820] outline-none focus:border-[#b99a6b]"
                  />
                </div>
              </div>

              {/* Quick Day Pill Bar */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {dayQuickPills.map((pill) => {
                  const countForDay = bookings.filter(
                    (b) => b.date === pill.iso
                  ).length;
                  const isSelected = selectedDate === pill.iso;
                  return (
                    <button
                      key={pill.iso}
                      onClick={() => setSelectedDate(pill.iso)}
                      className={`flex flex-col items-center py-2.5 px-4 rounded-xl transition-all whitespace-nowrap min-w-[5.5rem] border ${
                        isSelected
                          ? "bg-[#101820] text-[#f4f1eb] border-[#101820] shadow-md scale-[1.02]"
                          : "bg-[#f4f1eb]/70 hover:bg-[#f4f1eb] border-[#101820]/10 text-[#101820]"
                      }`}
                    >
                      <span
                        className={`text-[0.65rem] uppercase tracking-wider font-medium ${
                          isSelected ? "text-[#b99a6b]" : "text-[#101820]/60"
                        }`}
                      >
                        {pill.dayName}
                      </span>
                      <span className="font-serif text-sm font-semibold mt-0.5">
                        {pill.dateFormatted}
                      </span>
                      {countForDay > 0 && (
                        <span
                          className={`mt-1 text-[0.62rem] px-2 py-0.5 rounded-full font-medium ${
                            isSelected
                              ? "bg-[#b99a6b] text-[#101820]"
                              : "bg-[#101820]/10 text-[#101820]"
                          }`}
                        >
                          {countForDay} patient{countForDay > 1 ? "s" : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
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
                    className="bg-white border border-[#101820]/10 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                  >
                    {/* Patient Info & Details */}
                    <div className="space-y-3 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        {/* Time Slot Badge */}
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#101820] text-[#f4f1eb] font-serif text-sm font-medium">
                          <Clock className="w-3.5 h-3.5 text-[#b99a6b]" />
                          {b.time || "Any time"}
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

                        {/* Treatment Name */}
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-[#f4f1eb] text-[#101820] text-xs font-serif font-medium border border-[#101820]/10">
                          {b.treatment}
                        </span>
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
                    </div>
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

              {/* Search Box */}
              <div className="relative w-full md:w-72">
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
                      <th className="py-4 px-6">Date & Time</th>
                      <th className="py-4 px-6">Status</th>
                      <th className="py-4 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#101820]/5 text-sm">
                    {filteredBookings.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[#101820]/50">
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

                          {/* Treatment */}
                          <td className="py-4 px-6">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f4f1eb] border border-[#101820]/10 text-xs font-serif text-[#101820]">
                              {b.treatment}
                            </span>
                          </td>

                          {/* Date & Time */}
                          <td className="py-4 px-6">
                            <div className="flex items-center gap-1.5 text-xs text-[#101820]">
                              <CalendarIcon className="w-3.5 h-3.5 text-[#b99a6b]" />
                              <span>{b.date}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-[0.72rem] text-[#101820]/50 mt-0.5">
                              <Clock className="w-3 h-3 text-[#101820]/30" />
                              <span>{b.time || "Any time"}</span>
                            </div>
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
      </div>

      {/* ── MODAL 1: VIEW BOOKING DETAILS ───────────────────────────────────── */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#101820]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white border border-[#101820]/15 rounded-3xl p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-[#101820]/10 pb-4">
              <div>
                <span className="text-[0.65rem] font-medium uppercase tracking-[0.2em] text-[#b99a6b]">
                  Appointment Details #{selectedBooking.id}
                </span>
                <h3 className="font-serif text-xl font-medium text-[#101820] mt-0.5">
                  {selectedBooking.full_name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedBooking(null)}
                className="p-1.5 rounded-full bg-[#f4f1eb] hover:bg-[#101820] hover:text-white text-[#101820]/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Details */}
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-[#f4f1eb]/70 rounded-2xl p-4 border border-[#101820]/10">
                <div>
                  <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50">
                    Treatment
                  </span>
                  <span className="font-serif text-base text-[#b99a6b] font-medium">
                    {selectedBooking.treatment}
                  </span>
                </div>

                <div>
                  <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50">
                    Status
                  </span>
                  <span
                    className={`inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full font-medium ${
                      selectedBooking.status === "confirmed"
                        ? "bg-emerald-500/20 text-emerald-800"
                        : selectedBooking.status === "completed"
                        ? "bg-blue-500/20 text-blue-800"
                        : selectedBooking.status === "cancelled"
                        ? "bg-red-500/20 text-red-700"
                        : "bg-amber-500/20 text-amber-800"
                    }`}
                  >
                    {selectedBooking.status.toUpperCase()}
                  </span>
                </div>

                <div>
                  <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50">
                    Date
                  </span>
                  <span className="text-[#101820] font-medium">
                    {selectedBooking.date}
                  </span>
                </div>

                <div>
                  <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50">
                    Time
                  </span>
                  <span className="text-[#101820] font-medium">
                    {selectedBooking.time || "Any time"}
                  </span>
                </div>
              </div>

              {/* Contact Actions */}
              <div className="space-y-2">
                <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50">
                  Contact Links
                </span>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`tel:${selectedBooking.phone}`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#f4f1eb] border border-[#101820]/15 hover:bg-[#101820] hover:text-white text-xs transition-colors"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-[#b99a6b]" />
                    <span>Call {selectedBooking.phone}</span>
                  </a>

                  <a
                    href={`https://wa.me/${selectedBooking.phone.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 hover:bg-emerald-500/20 text-xs transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Message Note */}
              {selectedBooking.message && (
                <div>
                  <span className="block text-[0.65rem] uppercase tracking-wider text-[#101820]/50 mb-1">
                    Patient Note
                  </span>
                  <div className="p-3.5 rounded-xl bg-[#f4f1eb]/70 border border-[#101820]/10 text-xs text-[#101820]/80 italic leading-relaxed">
                    &ldquo;{selectedBooking.message}&rdquo;
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action */}
            <div className="flex items-center justify-between border-t border-[#101820]/10 pt-4">
              <span className="text-xs text-[#101820]/50">Quick Status Update:</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleStatusChange(selectedBooking.id, "confirmed")}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  Confirm
                </button>
                <button
                  onClick={() => handleStatusChange(selectedBooking.id, "completed")}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm"
                >
                  Complete
                </button>
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
                  <label className="block text-[#101820]/60 mb-1">Treatment *</label>
                  <select
                    value={newForm.treatment}
                    onChange={(e) =>
                      setNewForm({ ...newForm, treatment: e.target.value })
                    }
                    className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  >
                    {TREATMENT_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[#101820]/60 mb-1">Preferred Time</label>
                  <select
                    value={newForm.time}
                    onChange={(e) => setNewForm({ ...newForm, time: e.target.value })}
                    className="w-full bg-[#f4f1eb] border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[#101820]/60 mb-1">Preferred Date *</label>
                <input
                  type="date"
                  required
                  value={newForm.date}
                  onChange={(e) => setNewForm({ ...newForm, date: e.target.value })}
                  className="w-full bg-[#f4f1eb]/60 border border-[#101820]/15 rounded-xl px-3 py-2 text-[#101820] outline-none focus:border-[#b99a6b]"
                />
              </div>

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
