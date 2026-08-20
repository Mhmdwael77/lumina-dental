/**
 * Lumina Dental - Backend API Client
 * Connects to FastAPI backend (http://127.0.0.1:8000) with fallback support.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type ServiceType = "treatment" | "consultation";
export type PaymentMethod = "clinic" | "online";
export type PaymentStatus = "pending" | "paid" | "failed";
export type ReminderStatus = "pending" | "sent" | "failed" | "not_applicable";

export interface Booking {
  id: number;
  full_name: string;
  phone: string;
  email?: string | null;
  treatment: string;
  service_type?: ServiceType;
  date: string;
  time?: string | null;
  message?: string | null;
  status: BookingStatus;
  queue_number?: number | null;
  estimated_arrival_start?: string | null;
  estimated_arrival_end?: string | null;
  patient_arrived: boolean;
  arrived_at?: string | null;
  consultation_hint_dismissed?: boolean;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  reminder_status: ReminderStatus;
  extra_charge_amount?: number | null;
  extra_charge_description?: string | null;
  extra_charge_paid?: boolean;
  consultation_fee?: number | null;
  created_at?: string;
  updated_at?: string;
}

/** Reduced confirmation returned by the public booking endpoint. */
export interface BookingConfirmation {
  id: number;
  full_name: string;
  treatment: string;
  service_type?: ServiceType;
  date: string;
  status: BookingStatus;
  queue_number: number;
  patients_ahead: number;
  estimated_arrival_start?: string | null;
  estimated_arrival_end?: string | null;
  consultation_fee?: number | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
}

export interface QueueStatus {
  id: number;
  date: string;
  queue_number: number;
  status: BookingStatus;
  patient_arrived: boolean;
  patients_ahead: number;
  currently_serving: number | null;
  estimated_arrival_start?: string | null;
  estimated_arrival_end?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
}

export interface Availability {
  date: string;
  is_working_day: boolean;
  opens: string | null;
  closes: string | null;
  patients_booked: number;
  next_queue_number: number | null;
  reason: string | null;
}

export interface ClinicSchedule {
  working_days: number[];
  hours_by_day: Record<string, { opens: string; closes: string } | null>;
  min_consultation_minutes: number;
  max_consultation_minutes: number;
  booking_window_days: number;
  consultation_fee: number;
  currency: string;
}

export interface BookingCreateData {
  full_name: string;
  phone: string;
  email?: string;
  treatment: string;
  service_type?: ServiceType;
  date: string;
  message?: string;
  payment_method: PaymentMethod;
}

/** A structured API error the UI can show directly to the user. */
export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseErrorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || fallback;
  } catch {
    return fallback;
  }
}

// ── Local Storage Token Management ──────────────────────────────────────────
export const getToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("lumina_admin_token");
};

export const setToken = (token: string): void => {
  if (typeof window === "undefined") return;
  localStorage.setItem("lumina_admin_token", token);
};

export const removeToken = (): void => {
  if (typeof window === "undefined") return;
  localStorage.removeItem("lumina_admin_token");
};

// ── Initial Data (Empty for fresh production database) ────────────────────────
export const INITIAL_DEMO_BOOKINGS: Booking[] = [];

// ── API Functions ────────────────────────────────────────────────────────────

/** Check if backend is alive */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/`, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/** Authenticate admin/staff user */
export async function loginAdmin(username: string, password: string): Promise<string> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Invalid credentials" }));
      throw new Error(err.detail || "Authentication failed");
    }

    const data = await res.json();
    setToken(data.access_token);
    return data.access_token;
  } catch (error: unknown) {
    if (error instanceof Error && error.message !== "Failed to fetch") {
      throw error;
    }
    // Fallback for demo login if server offline
    if ((username === "admin" && password === "admin123") || (username === "staff" && password === "staff123")) {
      const demoToken = `demo_token_${username}_${Date.now()}`;
      setToken(demoToken);
      return demoToken;
    }
    throw new Error("Invalid username or password");
  }
}

/**
 * Full booking history for a patient, pulled by phone number — the
 * identity key, since patients have no account. Unlike `fetchBookings`,
 * this is never paginated and never silently caps out, so it's the
 * authoritative source for the Patient Record modal (not a client-side
 * filter over whatever page of `fetchBookings` happens to be loaded).
 */
export async function fetchPatientBookings(token: string, phone: string): Promise<Booking[]> {
  const res = await fetch(`${API_BASE_URL}/bookings/patient/${encodeURIComponent(phone)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not load this patient's record."), res.status);
  return res.json();
}

/** Fetch all bookings from backend (or fallback) */
export async function fetchBookings(token: string): Promise<Booking[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/bookings/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (res.ok) {
      return await res.json();
    }
    // Backend reached but rejected us. An expired/invalid session must NOT be
    // swallowed into an empty demo list — that makes real data look deleted.
    // Surface it so the dashboard can send the user back to sign in.
    if (res.status === 401 || res.status === 403) {
      throw new ApiError("Your session has expired. Please sign in again.", res.status);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err; // re-raise auth errors
    // Otherwise it's a network error → fall through to the offline demo store.
  }

  // Return stored local/demo bookings if backend offline
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("lumina_demo_bookings");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // ignore parse error
      }
    }
  }
  return INITIAL_DEMO_BOOKINGS;
}

/**
 * Submit a public queue-based booking request. The backend assigns the
 * queue number, estimated arrival window and payment state — nothing here
 * is computed on the client. Throws ApiError with a user-facing message on
 * failure (no fabricated fallback: a faked queue number would be
 * meaningless once the real backend is back online).
 */
export async function submitBooking(data: BookingCreateData): Promise<BookingConfirmation> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/bookings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    throw new ApiError("Could not reach the booking server. Please check your connection and try again.");
  }

  if (!res.ok) {
    throw new ApiError(await parseErrorDetail(res, "Could not complete your booking."), res.status);
  }
  return res.json();
}

/** Get the clinic's configured working days/hours & consultation duration. */
export async function getClinicSchedule(): Promise<ClinicSchedule> {
  const res = await fetch(`${API_BASE_URL}/clinic/schedule`, { cache: "no-store" });
  if (!res.ok) throw new ApiError("Could not load the clinic schedule.", res.status);
  return res.json();
}

/** Queue preview ("Patients already booked: N") for a candidate date. */
export async function getAvailability(date: string): Promise<Availability> {
  const res = await fetch(`${API_BASE_URL}/clinic/availability?date=${encodeURIComponent(date)}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not check availability."), res.status);
  return res.json();
}

/** Live queue position for a booking — used to poll the confirmation page. */
export async function getQueueStatus(bookingId: number): Promise<QueueStatus> {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/queue-status`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not load queue status."), res.status);
  return res.json();
}

/** Confirm the (simulated) online payment for a booking. */
export async function confirmOnlinePayment(bookingId: number, phone: string): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Payment could not be confirmed."), res.status);
  return res.json();
}

/** Update booking status */
export async function updateBookingStatus(
  token: string,
  bookingId: number,
  newStatus: BookingStatus
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (res.ok) return true;
  } catch {
    // fallback
  }

  // Local fallback update
  if (typeof window !== "undefined") {
    const current = await fetchBookings(token);
    const updated = current.map((b) => (b.id === bookingId ? { ...b, status: newStatus } : b));
    localStorage.setItem("lumina_demo_bookings", JSON.stringify(updated));
  }
  return true;
}

/**
 * Mark a patient as entered / not entered (staff only). The backend
 * enforces the "booking date == today AND within working hours" rule —
 * this call surfaces that rejection as an ApiError rather than silently
 * falling back, since arrival state must stay authoritative.
 */
export async function updateArrivalStatus(token: string, bookingId: number, arrived: boolean): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/arrival`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ arrived }),
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not update arrival status."), res.status);
  return res.json();
}

/**
 * Show/hide the "patient also has a consultation" reminder shown on a
 * completed exam. UI-only flag — it never changes the consultation booking.
 * Falls back to the local demo store when the backend is offline, mirroring
 * updateBookingStatus so the dismissal still sticks in demo mode.
 */
export async function updateConsultationHintDismissed(
  token: string,
  bookingId: number,
  dismissed: boolean
): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/consultation-hint`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ dismissed }),
    });
    if (res.ok) return true;
  } catch {
    // fall through to local fallback
  }

  if (typeof window !== "undefined") {
    const current = await fetchBookings(token);
    const updated = current.map((b) =>
      b.id === bookingId ? { ...b, consultation_hint_dismissed: dismissed } : b
    );
    localStorage.setItem("lumina_demo_bookings", JSON.stringify(updated));
  }
  return true;
}

/**
 * Set/update the extra charge on a booking — e.g. a crown/filling/add-on
 * done during or after the exam, on top of the base appointment.
 */
export async function updateExtraCharge(
  token: string,
  bookingId: number,
  data: { amount: number; description?: string; paid: boolean }
): Promise<Booking> {
  const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}/extra-charge`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not save the extra charge."), res.status);
  return res.json();
}

// ── Finance / Expenses ────────────────────────────────────────────────────────
export interface Expense {
  id: number;
  name: string;
  category: string;
  amount: number;
  date: string;
  notes?: string | null;
  created_at?: string;
}

export interface ExpenseCreateData {
  name: string;
  category: string;
  amount: number;
  date: string;
  notes?: string;
}

export interface FinanceSummary {
  currency: string;
  kpis: {
    today_patients: number;
    today_appointments: number;
    today_revenue: number;
    week_revenue: number;
    month_revenue: number;
    total_revenue: number;
    pending_payments: number;
    total_expenses: number;
    net_profit: number;
    avg_revenue_per_patient: number;
    cancelled_appointments: number;
  };
  range: {
    start: string;
    end: string;
    revenue: number;
    expenses: number;
    net_profit: number;
    pending: number;
    appointments: number;
    patients: number;
    cancelled: number;
  };
  revenue_series: { label: string; revenue: number; expenses: number }[];
  appointments_series: { label: string; appointments: number; patients: number }[];
  payments_breakdown: { paid: number; pending: number };
  expenses_by_category: { category: string; amount: number }[];
  recent_transactions: {
    id: string;
    kind: "revenue" | "expense";
    date: string;
    title: string;
    subtitle?: string | null;
    amount: number;
    status: string;
  }[];
}

/** Financial dashboard summary for a date range (all figures from the real DB). */
export async function fetchFinanceSummary(
  token: string,
  start: string,
  end: string
): Promise<FinanceSummary> {
  const res = await fetch(
    `${API_BASE_URL}/finance/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not load financial summary."), res.status);
  return res.json();
}

/** List expenses, optionally within a date range. */
export async function fetchExpenses(token: string, start?: string, end?: string): Promise<Expense[]> {
  const qs = new URLSearchParams();
  if (start) qs.set("start", start);
  if (end) qs.set("end", end);
  const res = await fetch(`${API_BASE_URL}/finance/expenses?${qs.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not load expenses."), res.status);
  return res.json();
}

/** Add an expense. */
export async function createExpense(token: string, data: ExpenseCreateData): Promise<Expense> {
  const res = await fetch(`${API_BASE_URL}/finance/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not save the expense."), res.status);
  return res.json();
}

/** Set the clinic-wide base consultation fee (staff). */
export async function updateConsultationFee(
  token: string,
  fee: number
): Promise<{ consultation_fee: number; currency: string }> {
  const res = await fetch(`${API_BASE_URL}/clinic/consultation-fee`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fee }),
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not update the consultation fee."), res.status);
  return res.json();
}

/** Delete an expense. */
export async function deleteExpense(token: string, expenseId: number): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/finance/expenses/${expenseId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new ApiError(await parseErrorDetail(res, "Could not delete the expense."), res.status);
  return true;
}

/** Delete a booking */
export async function deleteBooking(token: string, bookingId: number): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/bookings/${bookingId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) return true;
  } catch {
    // fallback
  }

  if (typeof window !== "undefined") {
    const current = await fetchBookings(token);
    const updated = current.filter((b) => b.id !== bookingId);
    localStorage.setItem("lumina_demo_bookings", JSON.stringify(updated));
  }
  return true;
}
