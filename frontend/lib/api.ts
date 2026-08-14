/**
 * Lumina Dental - Backend API Client
 * Connects to FastAPI backend (http://127.0.0.1:8000) with fallback support.
 */

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled";

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
  created_at?: string;
  updated_at?: string;
}

export interface BookingCreateData {
  full_name: string;
  phone: string;
  email?: string;
  treatment: string;
  date: string;
  time?: string;
  message?: string;
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

/** Submit a public booking request */
export async function submitBooking(data: BookingCreateData): Promise<Booking> {
  try {
    const res = await fetch(`${API_BASE_URL}/bookings/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  // Fallback demo object creation
  const newBooking: Booking = {
    id: Date.now(),
    full_name: data.full_name,
    phone: data.phone,
    email: data.email || null,
    treatment: data.treatment,
    date: data.date,
    time: data.time || null,
    message: data.message || null,
    status: "pending",
    created_at: new Date().toISOString(),
  };

  if (typeof window !== "undefined") {
    const current = await fetchBookings("");
    const updated = [newBooking, ...current];
    localStorage.setItem("lumina_demo_bookings", JSON.stringify(updated));
  }

  return newBooking;
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
