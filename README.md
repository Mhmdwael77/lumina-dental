<div align="center">

# 🦷 Lumina Dental

### A full‑stack dental clinic platform — marketing site, queue‑based booking, and a staff admin dashboard

![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)
![SQLAlchemy](https://img.shields.io/badge/SQLAlchemy-2.0-D71F00?style=for-the-badge)

</div>

> ⚠️ **Demo project.** Clinic name, doctor profile, reviews, and imagery are fictional placeholders for presentation purposes.

---

## ✨ Overview

Lumina Dental is a two-part project:

- **`frontend/`** — a Next.js marketing site with an immersive 3D hero, plus a public **queue-based booking flow** and a full **staff/admin dashboard**.
- **`backend/`** — a FastAPI service that owns every business rule: queue assignment, arrival/working-hours checks, payment state, and auth. The frontend never computes any of this itself — it only displays what the API returns, and falls back to a local demo store if the API is unreachable.

There are no fixed appointment time slots. A patient picks a **day**; the backend assigns the next **queue number** for that day and estimates an arrival window from the clinic's configured consultation duration — first-come, first-served, like a real walk-in queue.

---

## 🌟 Features

### Public site
- 🦷 Immersive 3D hero (React Three Fiber), cinematic GSAP/Lenis scroll, editorial sections (treatments, before/after, testimonials, FAQ…).
- 📅 **Booking form** — patients submit name/phone/treatment/date; the backend returns a queue number and estimated arrival window, with live queue-status polling on the confirmation screen.
- 💳 Simulated online payment, or "pay at clinic."

### Staff / Admin dashboard (`/admin`)
- 🔐 JWT login (`admin` / `staff` roles).
- 🗓️ **Day Agenda** — one day's queue at a time, with a scrollable date-pill picker (arrow buttons, mouse wheel, or drag), live queue/status/arrival/payment badges per patient.
- 📋 **All Bookings** table — filter by status, month, year, or date preset; search by name/phone/treatment.
- 🩺 **Consultations** view — consultation requests, plus completed exams whose patient also has a pending consultation follow-up.
- 🧾 **Extra charges** — staff can bill add-on work (e.g. a crown or filling done after the exam) on top of the base appointment, with an amount, a note, and a paid/unpaid flag. Shows as a badge everywhere that booking appears.
- 👤 **Patient Record** — full visit history for a patient (matched by phone across bookings), with per-visit status updates and extra-charge management.
- ✅ Arrival tracking ("Mark as Entered"), enforced server-side to the booking's date and the clinic's working hours.
- 📲 WhatsApp reminders for patients whose turn is approaching (no-ops until a WhatsApp Cloud API account is configured).

---

## 🛠️ Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend framework | **Next.js 16** (App Router) · **React 19** · **TypeScript 5** |
| Styling | **Tailwind CSS 4** |
| 3D / Animation | **Three.js** · **@react-three/fiber** · **GSAP** (ScrollTrigger) · **Lenis** (smooth scroll) |
| Backend framework | **FastAPI** · **Python 3.12** |
| Database | **SQLite** via **SQLAlchemy 2.0** (lightweight auto-migration on startup — no Alembic) |
| Auth | **JWT** (`python-jose`) + **bcrypt** (`passlib`) |
| Validation | **Pydantic v2** |
| Notifications | **WhatsApp Cloud API** (optional, via `httpx`) |

---

## 🚀 Getting Started

You need two terminals — one per service.

### 1) Backend (FastAPI)

```bash
cd backend
python -m venv venv && venv\Scripts\activate   # Windows; use `source venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

The first run creates `backend/database.db` and seeds two default accounts:

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `admin123` | Admin |
| `staff` | `staff123` | Staff |

API docs: **http://127.0.0.1:8000/docs**

#### Backend environment variables (`backend/.env`, all optional — see [`core/config.py`](backend/core/config.py) for defaults)

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Defaults to local SQLite (`sqlite:///./database.db`) |
| `SECRET_KEY` | JWT signing key — **set a real random value before deploying** |
| `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` | Allowed frontend origins |
| `WHATSAPP_API_URL` / `WHATSAPP_API_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Cloud API — reminders no-op until all three are set |

### 2) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** for the site, or **http://localhost:3000/admin** for the dashboard.

By default the frontend talks to `http://127.0.0.1:8000`; override with `NEXT_PUBLIC_API_URL` in `frontend/.env.local` if the backend runs elsewhere. If the backend is unreachable, the admin dashboard falls back to a local `localStorage` demo store so the UI stays usable offline.

---

## 📁 Project Structure

```
work/
├─ frontend/                 # Next.js app
│  ├─ app/
│  │  ├─ admin/page.tsx      # staff/admin dashboard (single-page, client-rendered)
│  │  ├─ booking/            # public booking flow
│  │  └─ page.tsx            # marketing site
│  ├─ components/            # 3D hero, sections, layout, providers (Lenis/GSAP)
│  └─ lib/                   # API client (lib/api.ts), constants, animation helpers
│
└─ backend/                  # FastAPI service
   ├─ main.py                # app entrypoint, CORS, router registration
   ├─ routers/                # booking.py, auth.py, clinic.py — HTTP layer only
   ├─ services/               # business logic (booking_service, reminder_service, whatsapp_service)
   ├─ core/
   │  ├─ database.py         # SQLAlchemy models + lightweight auto-migration
   │  ├─ crud/                # DB query helpers
   │  ├─ clinic_schedule.py  # working days/hours source of truth
   │  ├─ security.py         # password hashing, JWT
   │  └─ dependencies.py     # get_db, require_staff, get_current_user
   └─ schemas/                # Pydantic request/response models
```

---

## 🔌 API Overview

Full interactive docs at `/docs`. Highlights:

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/bookings/` | Public | Submit a queue-based booking request |
| `GET` | `/bookings/{id}/queue-status` | Public | Live queue position (polled by the confirmation page) |
| `POST` | `/bookings/{id}/pay` | Public | Confirm simulated online payment |
| `GET` | `/bookings/` | Staff | List all bookings (`?status=`, `?date=`) |
| `PATCH` | `/bookings/{id}/status` | Staff | Update booking status |
| `PATCH` | `/bookings/{id}/arrival` | Staff | Mark patient as entered / not entered |
| `PATCH` | `/bookings/{id}/extra-charge` | Staff | Set/update an extra charge on a booking |
| `PATCH` | `/bookings/{id}/consultation-hint` | Staff | Show/hide the "has consultation" reminder |
| `DELETE` | `/bookings/{id}` | Staff | Delete a booking record |
| `POST` | `/bookings/reminders/dispatch` | Staff | Send due WhatsApp reminders (meant to be cron-driven) |
| `GET` | `/clinic/schedule` | Public | Working days/hours, consultation duration |
| `GET` | `/clinic/availability?date=` | Public | Queue preview for a candidate date |
| `POST` | `/auth/login` | Public | Get a JWT access token |
| `GET` | `/auth/me` | Authenticated | Current user info |

---

## 📝 Notes

- **SQLite + auto-migration** — there's no Alembic; `core/database.py` adds any missing columns to an existing `database.db` on startup, so upgrading the schema never requires dropping data. Fine for a single-clinic deployment; swap to Postgres via `DATABASE_URL` for anything larger.
- **No real payment gateway** — online payment is simulated; wiring a real provider (Stripe, Paymob, …) means replacing `confirm_online_payment` in `services/booking_service.py` with a signed webhook/callback.
- **One active booking per phone** — patients have no accounts; the phone number is the identity key, tolerant of formatting differences (leading zero / country code).
- **Placeholder content** — treatment imagery, the doctor profile, and testimonials on the public site are demo content built to be swapped 1:1 for real photography and copy.

