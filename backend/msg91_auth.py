"""MSG91 OTP Widget — server-side access-token verification.

The MSG91 AuthKey stays here on the server only. The browser widget verifies the OTP
and returns a short-lived access-token; we validate that token against MSG91 using the
AuthKey before trusting it. Never log the AuthKey or the access-token.
"""
import os
import logging
import requests

logger = logging.getLogger(__name__)

MSG91_AUTHKEY = os.environ.get("MSG91_AUTHKEY") or ""
MSG91_VERIFY_URL = (
    os.environ.get("MSG91_VERIFY_ACCESS_TOKEN_URL")
    or "https://control.msg91.com/api/v5/widget/verifyAccessToken"
)


def is_configured() -> bool:
    return bool(MSG91_AUTHKEY)


def verify_access_token(access_token: str) -> dict:
    """Validate a MSG91 widget access-token. Returns the MSG91 response dict on success,
    raises ValueError on any failure."""
    if not access_token:
        raise ValueError("Missing verification token")
    try:
        r = requests.post(
            MSG91_VERIFY_URL,
            json={"authkey": MSG91_AUTHKEY, "access-token": access_token},
            headers={"Content-Type": "application/json", "Accept": "application/json"},
            timeout=15,
        )
    except Exception as e:
        logger.error(f"[MSG91] verify request failed: {e}")
        raise ValueError("Verification service is temporarily unavailable")

    try:
        data = r.json()
    except Exception:
        logger.error(f"[MSG91] non-JSON response status={r.status_code}")
        raise ValueError("Verification failed. Please try again.")

    if r.status_code == 200 and str(data.get("type", "")).lower() == "success":
        return data

    # Redacted logging — never include the token.
    logger.error(f"[MSG91] rejected status={r.status_code} type={data.get('type')} message={data.get('message')}")
    raise ValueError("Invalid or expired code. Please try again.")
