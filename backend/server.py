from fastapi import FastAPI, APIRouter, UploadFile, File, Form, HTTPException, Response, Request, Cookie, Header, Depends
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import base64
import logging
import uuid
import io
import asyncio
import requests
from PIL import Image, ExifTags
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from storage import init_storage, put_object, get_object, APP_NAME
import phone_auth
import security

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
VISION_MODEL = ("openai", "gpt-5.4")
SUPER_ADMIN_EMAIL = (os.environ.get("SUPER_ADMIN_EMAIL") or "").lower()
SUPER_ADMIN_PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD") or "Admin@12345"
NOMINATIM_UA = "FixMyArea/1.0 (civic issue reporting app)"

CITIZEN_TOKEN_MIN = 60 * 24 * 30
ADMIN_TOKEN_MIN = 60 * 8
OTP_MAX_PER_HOUR = 5

MIME_TYPES = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}

CATEGORY_KEYWORDS = {
    "pothole": ["pothole", "pot hole", "road", "crack", "asphalt", "crater", "dig", "sinkhole"],
    "garbage": ["garbage", "trash", "waste", "rubbish", "dump", "litter", "dustbin", "smell", "sewage"],
    "streetlight": ["streetlight", "street light", "light", "lamp", "dark", "bulb", "pole"],
    "water": ["water", "leak", "pipe", "drain", "flood", "waterlogging", "overflow"],
    "signage": ["sign", "signage", "board", "signal", "traffic light", "marking"],
}
STATUS_ORDER = ["reported", "acknowledged", "in_progress", "resolved"]

CIVIC_CATEGORIES = [
    "pothole_or_damaged_road", "broken_streetlight", "water_leak_or_pipeline_burst",
    "sewage_or_open_or_blocked_drain", "garbage_or_overflowing_bin", "broken_footpath_or_pavement",
    "damaged_public_property", "waterlogging_or_flooding",
]
CIVIC_CONFIDENCE_THRESHOLD = 0.85
AI_CONFIDENCE_THRESHOLD = 0.55
EDIT_SOFTWARE_MARKERS = ["photoshop", "gimp", "lightroom", "affinity", "midjourney", "dall-e", "dall·e", "stable diffusion"]

VISION_SYSTEM = (
    "You are a strict image-moderation and classification system for a municipal civic-issue reporting app. "
    "Citizens upload a photo of a real public-infrastructure PROBLEM. Reject anything that is not clearly such a "
    "problem. Be conservative: when unsure, do NOT accept. You always reply with strict minified JSON only."
)
VISION_PROMPT = (
    "Classify the attached image. Decide if it clearly depicts a REAL, currently-visible civic infrastructure "
    "PROBLEM belonging to exactly one of these categories: pothole_or_damaged_road, broken_streetlight, "
    "water_leak_or_pipeline_burst, sewage_or_open_or_blocked_drain, garbage_or_overflowing_bin, "
    "broken_footpath_or_pavement, damaged_public_property, waterlogging_or_flooding. "
    "REJECT (is_civic_issue=false, category='none') for anything else: mountains, landscapes, scenery, sky, beaches, "
    "forests, gardens, flowers, animals, food, selfies/portraits, indoor rooms, screenshots, documents, memes, "
    "product/object photos, or a normal clean road/footpath/streetlight with NO visible defect. "
    "Also judge whether the image is AI-generated, synthetic, or digitally manipulated/edited. "
    'Return strict JSON: {"is_civic_issue": boolean, "category": one of the ids above or "none", '
    '"confidence": number 0..1 (confidence it truly shows THAT civic problem; LOW if ambiguous), '
    '"ai_generated": boolean, "ai_confidence": number 0..1, "reason": short string}.'
)


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def classify(description: str) -> str:
    if not description:
        return "uncategorized"
    text = description.lower()
    for cat, keywords in CATEGORY_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                return cat
    return "uncategorized"


def _extract_json(text: str) -> str:
    text = text.strip()
    start, end = text.find("{"), text.rfind("}")
    return text[start:end + 1] if start != -1 and end != -1 else text


def _extract_exif(data: bytes) -> dict:
    info = {"has_exif": False, "camera": None, "datetime": None, "gps": False, "software": None}
    try:
        img = Image.open(io.BytesIO(data))
        exif = img._getexif() if hasattr(img, "_getexif") else None
        if not exif:
            return info
        tagmap = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
        info["has_exif"] = True
        make, model = tagmap.get("Make"), tagmap.get("Model")
        if make or model:
            info["camera"] = f"{make or ''} {model or ''}".strip()
        info["datetime"] = str(tagmap.get("DateTimeOriginal") or tagmap.get("DateTime") or "") or None
        info["software"] = str(tagmap.get("Software") or "") or None
        info["gps"] = bool(tagmap.get("GPSInfo"))
    except Exception:
        pass
    return info


async def verify_photo(data: bytes, mime: str) -> dict:
    exif = _extract_exif(data)
    import gemini_verify
    return await asyncio.to_thread(gemini_verify.verify, data, mime, exif)


def reverse_geocode(lat: float, lng: float) -> dict:
    try:
        r = requests.get("https://nominatim.openstreetmap.org/reverse",
                         params={"format": "jsonv2", "lat": lat, "lon": lng, "addressdetails": 1},
                         headers={"User-Agent": NOMINATIM_UA, "Accept": "application/json"}, timeout=15)
        r.raise_for_status()
        data = r.json()
        addr = data.get("address", {}) or {}
        state = addr.get("state") or addr.get("state_district") or ""
        district = addr.get("state_district") or addr.get("county") or addr.get("city") or addr.get("town") or ""
        return {"address": data.get("display_name") or f"Lat {lat:.5f}, Lng {lng:.5f}", "state": state, "district": district}
    except Exception as e:
        logger.error(f"Geocode failed: {e}")
        return {"address": f"Lat {lat:.5f}, Lng {lng:.5f}", "state": "", "district": ""}


def search_geocode(q: str, limit: int = 5) -> list:
    try:
        r = requests.get("https://nominatim.openstreetmap.org/search",
                         params={"format": "jsonv2", "q": q, "addressdetails": 1,
                                 "limit": limit, "countrycodes": "in"},
                         headers={"User-Agent": NOMINATIM_UA, "Accept": "application/json"}, timeout=15)
        r.raise_for_status()
        results = []
        for item in r.json():
            try:
                results.append({
                    "label": item.get("display_name", ""),
                    "lat": float(item["lat"]),
                    "lng": float(item["lon"]),
                })
            except (KeyError, ValueError):
                continue
        return results
    except Exception as e:
        logger.error(f"Geocode search failed: {e}")
        return []


# ---------------- Models ----------------
class PhoneStart(BaseModel):
    phone: str
    channel: Optional[str] = "call"


class PhoneVerify(BaseModel):
    phone: str
    code: str


class ProfileIn(BaseModel):
    name: str


class IssueCreate(BaseModel):
    photo_path: str
    latitude: float
    longitude: float
    address_text: str
    description: Optional[str] = ""
    state: Optional[str] = ""
    district: Optional[str] = ""
    flagged_ai_generated: Optional[bool] = False


class CommentCreate(BaseModel):
    text: str


class StatusUpdateIn(BaseModel):
    status: str
    note: Optional[str] = ""


class CategoryUpdateIn(BaseModel):
    category: str


class AdminLogin(BaseModel):
    email: str
    password: str


class TwoFAVerify(BaseModel):
    temp_token: str
    code: str


# ---------------- Auth dependencies ----------------
async def get_current_citizen(access_token: Optional[str] = Cookie(None), authorization: Optional[str] = Header(None)):
    token = access_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        return None
    try:
        payload = security.decode_token(token)
        if payload.get("type") != "citizen":
            return None
        return await db.users.find_one({"user_id": payload["sub"]}, {"_id": 0})
    except Exception:
        return None


async def require_citizen(user=Depends(get_current_citizen)):
    if not user:
        raise HTTPException(status_code=401, detail="Please sign in with your phone number to continue.")
    return user


async def get_current_admin(admin_token: Optional[str] = Cookie(None), authorization: Optional[str] = Header(None)):
    token = admin_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = security.decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    if payload.get("type") != "admin":
        raise HTTPException(status_code=401, detail="Not an admin session")
    admin = await db.admins.find_one({"admin_id": payload["sub"]}, {"_id": 0, "password_hash": 0, "totp_secret": 0})
    if not admin or admin.get("status") != "approved":
        raise HTTPException(status_code=403, detail="Admin account not active")
    return admin


async def require_super_admin(admin=Depends(get_current_admin)):
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super-admin access required")
    return admin


def set_cookie(response: Response, name: str, token: str, minutes: int):
    response.set_cookie(name, token, httponly=True, secure=True, samesite="none", path="/", max_age=minutes * 60)


# ---------------- Startup ----------------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
    try:
        await db.users.create_index("phone", unique=True)
        await db.admins.create_index("email", unique=True)
    except Exception as e:
        logger.error(f"Index error: {e}")
    # Seed super admin
    if SUPER_ADMIN_EMAIL:
        existing = await db.admins.find_one({"email": SUPER_ADMIN_EMAIL})
        if not existing:
            await db.admins.insert_one({
                "admin_id": f"adm_{uuid.uuid4().hex[:12]}", "email": SUPER_ADMIN_EMAIL,
                "password_hash": security.hash_password(SUPER_ADMIN_PASSWORD), "name": "Super Admin",
                "designation": "Super Administrator", "department": "Municipal HQ",
                "jurisdiction": {"state": "", "district": "", "ward": ""},
                "proof_path": None, "role": "super_admin", "status": "approved",
                "totp_secret": None, "totp_enabled": False, "created_at": now_iso(), "approved_by": "system",
            })
            logger.info("Super admin seeded")


# ---------------- Basic ----------------
@api_router.get("/")
async def root():
    return {"message": "Fix My Area API"}


@api_router.get("/geocode/reverse")
async def geocode_reverse(lat: float, lng: float):
    return reverse_geocode(lat, lng)


@api_router.get("/geocode/search")
async def geocode_search(q: str):
    q = (q or "").strip()
    if len(q) < 3:
        return []
    return await asyncio.to_thread(search_geocode, q)


# ---------------- Citizen phone auth ----------------
async def _otp_rate_ok(phone: str) -> bool:
    hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    count = await db.otp_verifications.count_documents({"phone": phone, "created_at": {"$gte": hour_ago}})
    return count < OTP_MAX_PER_HOUR


@api_router.post("/auth/phone/start")
async def phone_start(payload: PhoneStart):
    phone = payload.phone.strip()
    if not phone_auth.valid_phone(phone):
        raise HTTPException(status_code=400, detail="Enter a valid number with country code, e.g. +919876543210")
    if not await _otp_rate_ok(phone):
        raise HTTPException(status_code=429, detail="Too many attempts. Please try again in an hour.")
    channel = "sms" if payload.channel == "sms" else "call"
    try:
        res = phone_auth.start_verification(phone, channel=channel)
    except Exception as e:
        logger.error(f"Twilio verification start failed: {e}")
        raise HTTPException(status_code=502, detail="We couldn't place the verification right now. Please try again, or use the SMS option. (Trial Twilio accounts can only reach verified numbers.)")
    doc = {"phone": phone, "channel": channel, "status": "pending", "attempts": 0, "created_at": now_iso()}
    if res.get("demo"):
        doc["code"] = res["demo_code"]
    await db.otp_verifications.insert_one(doc)
    out = {"status": "pending", "demo": bool(res.get("demo")), "channel": channel}
    if res.get("demo"):
        out["demo_code"] = res["demo_code"]  # returned only in demo mode for testability
    return out


@api_router.post("/auth/phone/verify")
async def phone_verify(payload: PhoneVerify, response: Response):
    phone = payload.phone.strip()
    rec = await db.otp_verifications.find_one({"phone": phone, "status": "pending"}, sort=[("created_at", -1)])
    expected = rec.get("code") if rec else None
    ok = phone_auth.check_verification(phone, payload.code.strip(), expected=expected)
    if not ok:
        if rec:
            await db.otp_verifications.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Incorrect code. Please try again.")
    if rec:
        await db.otp_verifications.update_one({"_id": rec["_id"]}, {"$set": {"status": "approved"}})
    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    is_new = False
    if not user:
        is_new = True
        user = {"user_id": f"user_{uuid.uuid4().hex[:12]}", "phone": phone, "name": None,
                "role": "citizen", "home_state": None, "created_at": now_iso()}
        await db.users.insert_one(dict(user))
        user.pop("_id", None)
    token = security.create_token({"sub": user["user_id"], "type": "citizen"}, CITIZEN_TOKEN_MIN)
    set_cookie(response, "access_token", token, CITIZEN_TOKEN_MIN)
    return {"user": user, "is_new": is_new, "token": token}


@api_router.post("/auth/phone/resend")
async def phone_resend(payload: PhoneStart):
    return await phone_start(payload)


@api_router.post("/auth/profile")
async def set_profile(payload: ProfileIn, user=Depends(require_citizen)):
    await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": payload.name.strip()}})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})


@api_router.get("/auth/me")
async def citizen_me(user=Depends(get_current_citizen)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@api_router.post("/auth/logout")
async def citizen_logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}


# ---------------- Upload / files ----------------
@api_router.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(require_citizen)):
    ext = (file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg")
    content_type = MIME_TYPES.get(ext, file.content_type or "image/jpeg")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")
    verdict = await verify_photo(data, content_type)
    if not verdict["relevant"]:
        return {"relevant": False, "reject_code": verdict.get("reject_code", "not_civic"),
                "reason": verdict.get("reason"), "flagged_ai_generated": verdict.get("flagged_ai_generated", False),
                "needs_review": verdict.get("needs_review", False),
                "category": verdict.get("category", "none"), "confidence": verdict.get("confidence", 0.0)}
    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type)
    return {"photo_path": result["path"], "relevant": True, "reason": verdict.get("reason", ""),
            "flagged_ai_generated": verdict.get("flagged_ai_generated", False),
            "category": verdict.get("category", "none"), "confidence": verdict.get("confidence", 0.0)}


@api_router.get("/files/{path:path}")
async def download(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


# ---------------- Issues (citizen + public read) ----------------
@api_router.post("/issues")
async def create_issue(payload: IssueCreate, user=Depends(require_citizen)):
    issue_id = str(uuid.uuid4())
    ts = now_iso()
    state = payload.state or ""
    district = payload.district or ""
    if not state:
        geo = reverse_geocode(payload.latitude, payload.longitude)
        state, district = geo["state"], geo["district"]
    if not user.get("home_state") and state:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"home_state": state}})
    doc = {
        "id": issue_id, "short_id": issue_id.split("-")[0].upper(),
        "reporter_id": user["user_id"], "reporter_name": user.get("name") or "Anonymous", "reporter_picture": None,
        "photo_path": payload.photo_path, "latitude": payload.latitude, "longitude": payload.longitude,
        "address_text": payload.address_text, "description": payload.description or "",
        "state": state, "district": district,
        "category": classify(payload.description), "status": "open",
        "confirm_count": 0, "confirmed_by": [], "flagged_ai_generated": bool(payload.flagged_ai_generated),
        "timeline": [{"status": "reported", "note": "Issue reported by citizen", "created_at": ts}],
        "comments": [], "created_at": ts, "updated_at": ts,
    }
    await db.issues.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/issues")
async def list_issues(category: Optional[str] = None, status: Optional[str] = None, reporter_id: Optional[str] = None):
    query = {}
    if category and category != "all":
        query["category"] = category
    if status and status != "all":
        query["status"] = status
    if reporter_id:
        query["reporter_id"] = reporter_id
    return await db.issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.get("/issues/{issue_id}")
async def get_issue(issue_id: str):
    issue = await db.issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@api_router.post("/issues/{issue_id}/confirm")
async def confirm_issue(issue_id: str, user=Depends(require_citizen)):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    confirmed_by = issue.get("confirmed_by", [])
    if user["user_id"] in confirmed_by:
        return {"confirm_count": issue.get("confirm_count", 0), "already": True}
    confirmed_by.append(user["user_id"])
    await db.issues.update_one({"id": issue_id}, {"$set": {"confirmed_by": confirmed_by, "confirm_count": len(confirmed_by), "updated_at": now_iso()}})
    return {"confirm_count": len(confirmed_by), "already": False}


@api_router.post("/issues/{issue_id}/comments")
async def add_comment(issue_id: str, payload: CommentCreate, user=Depends(require_citizen)):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    comment = {"id": str(uuid.uuid4()), "user_id": user["user_id"], "user_name": user.get("name") or "Anonymous",
               "text": payload.text.strip(), "created_at": now_iso()}
    await db.issues.update_one({"id": issue_id}, {"$push": {"comments": comment}, "$set": {"updated_at": now_iso()}})
    return comment


# ---------------- Admin auth ----------------
async def _admin_login_ok(email: str) -> bool:
    hour_ago = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    fails = await db.admin_login_attempts.count_documents({"email": email, "ok": False, "created_at": {"$gte": hour_ago}})
    return fails < 5


@api_router.post("/admin/register")
async def admin_register(
    full_name: str = Form(...), email: str = Form(...), password: str = Form(...),
    designation: str = Form(...), department: str = Form(...),
    state: str = Form(...), district: str = Form(""), ward: str = Form(""),
    official_id: str = Form(""), proof: Optional[UploadFile] = File(None),
):
    email = email.lower().strip()
    if await db.admins.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An admin with this email already exists.")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    proof_path = None
    if proof is not None:
        pdata = await proof.read()
        pext = (proof.filename.split(".")[-1].lower() if proof.filename and "." in proof.filename else "bin")
        proof_path = f"{APP_NAME}/admin_proofs/{uuid.uuid4()}.{pext}"
        put_object(proof_path, pdata, proof.content_type or "application/octet-stream")
    await db.admins.insert_one({
        "admin_id": f"adm_{uuid.uuid4().hex[:12]}", "email": email,
        "password_hash": security.hash_password(password), "name": full_name.strip(),
        "official_id": official_id.strip(), "designation": designation.strip(), "department": department.strip(),
        "jurisdiction": {"state": state.strip(), "district": district.strip(), "ward": ward.strip()},
        "proof_path": proof_path, "role": "admin", "status": "pending",
        "totp_secret": None, "totp_enabled": False, "created_at": now_iso(), "approved_by": None,
    })
    return {"status": "pending", "message": "Your request has been submitted for super-admin approval."}


@api_router.post("/admin/login")
async def admin_login(payload: AdminLogin):
    email = payload.email.lower().strip()
    if not await _admin_login_ok(email):
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in 15 minutes.")
    admin = await db.admins.find_one({"email": email})
    ok = admin and security.verify_password(payload.password, admin["password_hash"])
    await db.admin_login_attempts.insert_one({"email": email, "ok": bool(ok), "created_at": now_iso()})
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if admin["status"] == "pending":
        raise HTTPException(status_code=403, detail="Your admin request is pending super-admin approval.")
    if admin["status"] == "rejected":
        raise HTTPException(status_code=403, detail="Your admin request was rejected.")
    temp = security.create_token({"sub": admin["admin_id"], "type": "admin_2fa"}, 10)
    if not admin.get("totp_enabled"):
        secret = admin.get("totp_secret") or security.new_totp_secret()
        await db.admins.update_one({"admin_id": admin["admin_id"]}, {"$set": {"totp_secret": secret}})
        return {"stage": "setup", "temp_token": temp, "otpauth_uri": security.totp_uri(secret, email), "secret": secret}
    return {"stage": "verify", "temp_token": temp}


@api_router.post("/admin/2fa/verify")
async def admin_2fa(payload: TwoFAVerify, response: Response):
    try:
        data = security.decode_token(payload.temp_token)
        assert data.get("type") == "admin_2fa"
    except Exception:
        raise HTTPException(status_code=401, detail="2FA session expired. Please log in again.")
    admin = await db.admins.find_one({"admin_id": data["sub"]})
    if not admin:
        raise HTTPException(status_code=404, detail="Admin not found")
    if not security.verify_totp(admin.get("totp_secret"), payload.code):
        raise HTTPException(status_code=400, detail="Invalid 6-digit code from your authenticator app.")
    if not admin.get("totp_enabled"):
        await db.admins.update_one({"admin_id": admin["admin_id"]}, {"$set": {"totp_enabled": True}})
    token = security.create_token({"sub": admin["admin_id"], "type": "admin"}, ADMIN_TOKEN_MIN)
    set_cookie(response, "admin_token", token, ADMIN_TOKEN_MIN)
    admin.pop("_id", None); admin.pop("password_hash", None); admin.pop("totp_secret", None)
    return {"admin": admin, "token": token}


@api_router.get("/admin/me")
async def admin_me(admin=Depends(get_current_admin)):
    return admin


@api_router.post("/admin/logout")
async def admin_logout(response: Response):
    response.delete_cookie("admin_token", path="/")
    return {"ok": True}


# ---------------- Admin: super-admin approvals ----------------
@api_router.get("/admin/requests")
async def admin_requests(admin=Depends(require_super_admin)):
    return await db.admins.find({"status": "pending"}, {"_id": 0, "password_hash": 0, "totp_secret": 0}).to_list(500)


@api_router.post("/admin/requests/{admin_id}/approve")
async def approve_admin(admin_id: str, admin=Depends(require_super_admin)):
    res = await db.admins.update_one({"admin_id": admin_id}, {"$set": {"status": "approved", "approved_by": admin["admin_id"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"ok": True}


@api_router.post("/admin/requests/{admin_id}/reject")
async def reject_admin(admin_id: str, admin=Depends(require_super_admin)):
    res = await db.admins.update_one({"admin_id": admin_id}, {"$set": {"status": "rejected", "approved_by": admin["admin_id"]}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Request not found")
    return {"ok": True}


# ---------------- Admin: jurisdiction-scoped data ----------------
def _jurisdiction_query(admin: dict) -> dict:
    if admin.get("role") == "super_admin":
        return {}
    j = admin.get("jurisdiction", {})
    q = {}
    if j.get("state"):
        q["state"] = j["state"]
    if j.get("district"):
        q["district"] = j["district"]
    return q


@api_router.get("/admin/issues")
async def admin_issues(status: Optional[str] = None, category: Optional[str] = None, admin=Depends(get_current_admin)):
    query = _jurisdiction_query(admin)
    if status and status != "all":
        query["status"] = status
    if category and category != "all":
        query["category"] = category
    return await db.issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)


@api_router.get("/admin/metrics")
async def admin_metrics(admin=Depends(get_current_admin)):
    base = _jurisdiction_query(admin)
    all_issues = await db.issues.find(base, {"_id": 0}).to_list(2000)
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    by_category = {}
    for i in all_issues:
        c = i.get("category", "uncategorized")
        by_category[c] = by_category.get(c, 0) + 1
    return {
        "total": len(all_issues),
        "open": len([i for i in all_issues if i["status"] == "open"]),
        "in_progress": len([i for i in all_issues if i["status"] == "in_progress"]),
        "resolved": len([i for i in all_issues if i["status"] == "resolved"]),
        "resolved_this_week": len([i for i in all_issues if i["status"] == "resolved" and i.get("updated_at", "") >= week_ago]),
        "flagged": len([i for i in all_issues if i.get("flagged_ai_generated")]),
        "by_category": by_category,
        "jurisdiction": admin.get("jurisdiction"),
        "role": admin.get("role"),
    }


async def _assert_in_jurisdiction(admin: dict, issue: dict):
    if admin.get("role") == "super_admin":
        return
    j = admin.get("jurisdiction", {})
    if j.get("state") and issue.get("state") != j["state"]:
        raise HTTPException(status_code=403, detail="This issue is outside your jurisdiction.")


@api_router.patch("/admin/issues/{issue_id}/status")
async def admin_update_status(issue_id: str, payload: StatusUpdateIn, admin=Depends(get_current_admin)):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    await _assert_in_jurisdiction(admin, issue)
    if payload.status not in STATUS_ORDER:
        raise HTTPException(status_code=400, detail="Invalid status")
    entry = {"status": payload.status, "note": payload.note or "", "created_at": now_iso(), "by": admin.get("name")}
    top = "resolved" if payload.status == "resolved" else ("in_progress" if payload.status in ("in_progress", "acknowledged") else "open")
    await db.issues.update_one({"id": issue_id}, {"$push": {"timeline": entry}, "$set": {"status": top, "updated_at": now_iso()}})
    return await db.issues.find_one({"id": issue_id}, {"_id": 0})


@api_router.patch("/admin/issues/{issue_id}/category")
async def admin_update_category(issue_id: str, payload: CategoryUpdateIn, admin=Depends(get_current_admin)):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    await _assert_in_jurisdiction(admin, issue)
    await db.issues.update_one({"id": issue_id}, {"$set": {"category": payload.category, "updated_at": now_iso()}})
    return await db.issues.find_one({"id": issue_id}, {"_id": 0})


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware, allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"], allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
