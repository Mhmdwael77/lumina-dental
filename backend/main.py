"""
Lumina Dental – FastAPI Entrypoint

Run with:
  uvicorn main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import init_db
from routers import booking, auth

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    filename="error.log",
    level=logging.WARNING,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)


# ── Lifespan (startup / shutdown) ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("🦷  Lumina Dental API starting up …")
    init_db()           # create tables if they don't exist
    yield
    logger.info("🦷  Lumina Dental API shutting down …")


# ── App instance ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Lumina Dental API",
    description="Booking & clinic management backend for the Lumina Dental website.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(booking.router)
app.include_router(auth.router)


# ── Health check ──────────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "Lumina Dental API"}
