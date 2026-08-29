"""Phone (citizen) verification + Twilio Verify voice with demo fallback."""
import os
import re
import random
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID") or ""
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN") or ""
TWILIO_VERIFY = os.environ.get("TWILIO_VERIFY_SERVICE") or ""

E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def is_configured() -> bool:
    return bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_VERIFY)


def valid_phone(phone: str) -> bool:
    return bool(E164.match(phone or ""))


def _client():
    from twilio.rest import Client
    return Client(TWILIO_SID, TWILIO_TOKEN)


def start_verification(phone: str, channel: str = "call") -> dict:
    """channel: 'call' (voice OTP) or 'sms' (fallback). Returns dict with demo_code when in demo mode."""
    if is_configured():
        try:
            v = _client().verify.v2.services(TWILIO_VERIFY).verifications.create(to=phone, channel=channel)
            return {"status": v.status, "demo": False}
        except Exception as e:
            logger.error(f"Twilio start failed: {e}")
            raise
    # demo mode
    code = f"{random.randint(0, 999999):06d}"
    logger.info(f"[DEMO OTP] phone={phone} channel={channel} code={code}")
    return {"status": "pending", "demo": True, "demo_code": code}


def check_verification(phone: str, code: str, expected: str = None) -> bool:
    if is_configured():
        try:
            check = _client().verify.v2.services(TWILIO_VERIFY).verification_checks.create(to=phone, code=code)
            return check.status == "approved"
        except Exception as e:
            logger.error(f"Twilio check failed: {e}")
            return False
    return bool(expected) and code == expected
