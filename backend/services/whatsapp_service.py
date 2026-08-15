"""
WhatsApp notification provider.

Thin wrapper around the WhatsApp Cloud API. Credentials come from
environment variables only (see core/config.py) — never from the frontend
or request bodies. If they're not configured, `send_whatsapp_message`
no-ops and returns False so the rest of the app can keep working without a
provider hooked up; wiring in a real account only means setting the three
env vars, nothing else in this codebase has to change.
"""

import logging

import httpx

from core.config import settings

logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"


def is_configured() -> bool:
    return bool(settings.WHATSAPP_API_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)


def send_whatsapp_message(phone: str, message: str) -> bool:
    """Send a WhatsApp text message. Returns True only on a confirmed send."""
    if not is_configured():
        logger.warning("WhatsApp provider not configured — skipping reminder to %s", phone)
        return False

    url = f"https://graph.facebook.com/{GRAPH_API_VERSION}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": phone.lstrip("+"),
        "type": "text",
        "text": {"body": message},
    }
    headers = {"Authorization": f"Bearer {settings.WHATSAPP_API_TOKEN}"}

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=10.0)
        response.raise_for_status()
        return True
    except httpx.HTTPError:
        logger.exception("Failed to send WhatsApp reminder to %s", phone)
        return False
