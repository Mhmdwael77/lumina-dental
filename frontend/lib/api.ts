/**
 * Lumina Dental - Backend API Client
 * Connects to FastAPI backend (http://127.0.0.1:8000) with fallback support.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";
export type PaymentMethod = "clinic" | "online";
export type PaymentStatus = "pending" | "paid" | "failed";
export type ReminderStatus = "pending" | "sent" | "failed" | "not_applicable";

export interface Booking {
  id: number;
  full_name: string;
  phone: string;
  email?: string | null;
  treatment: string;
  date: string;
  time?: string | null;
  message?: string | null;
  status: BookingStatus;
  queue_number?: number | null;
  estimated_arrival_start?: string | null;
  estimated_arrival_end?: string | null;
  patient_arrived: boolean;
  arrived_at?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  reminder_status: ReminderStatus;
  created_at?: string;
  updated_at?: string;
}

/** Reduced confirmation returned by the public booking endpoint. */
export interface BookingConfirmation {
  id: number;
  full_name: string;
  treatment: string;
  date: string;
  status: BookingStatus;
  queue_number: number;
  patients_ahead: number;
  estimated_arrival_start?: string | null;
  estimated_arrival_end?: string | null;
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
}

export interface BookingCreateData {
  full_name: string;
  phone: string;
  email?: string;
  treatment: string;
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
  } catch {
    // Backend offline fallback
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
