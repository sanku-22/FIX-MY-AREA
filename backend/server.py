from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Response, Request, Cookie, Header, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import base64
import logging
import uuid
import requests
import io
from PIL import Image, ExifTags
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta

from storage import init_storage, put_object, get_object, APP_NAME

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
VISION_MODEL = ("openai", "gpt-5.4")
ADMIN_EMAIL = "sinpi3323@gmail.com"
NOMINATIM_UA = "CivicFix/1.0 (civic issue reporting app)"

# ---- Strict image-verification config ----
CIVIC_CATEGORIES = [
    "pothole_or_damaged_road",
    "broken_streetlight",
    "water_leak_or_pipeline_burst",
    "sewage_or_open_or_blocked_drain",
    "garbage_or_overflowing_bin",
    "broken_footpath_or_pavement",
    "damaged_public_property",
    "waterlogging_or_flooding",
]
CIVIC_CONFIDENCE_THRESHOLD = 0.85
AI_CONFIDENCE_THRESHOLD = 0.55
EDIT_SOFTWARE_MARKERS = ["photoshop", "gimp", "lightroom", "affinity", "midjourney", "dall-e", "dall·e", "stable diffusion"]

MIME_TYPES = {
    "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
    "gif": "image/gif", "webp": "image/webp",
}

CATEGORY_KEYWORDS = {
    "pothole": ["pothole", "pot hole", "road", "crack", "asphalt", "crater", "dig", "sinkhole"],
    "garbage": ["garbage", "trash", "waste", "rubbish", "dump", "litter", "dustbin", "smell", "sewage"],
    "streetlight": ["streetlight", "street light", "light", "lamp", "dark", "bulb", "pole"],
    "water": ["water", "leak", "pipe", "drain", "flood", "waterlogging", "overflow"],
    "signage": ["sign", "signage", "board", "signal", "traffic light", "marking"],
}

STATUS_ORDER = ["reported", "acknowledged", "in_progress", "resolved"]

VISION_SYSTEM = (
    "You are a strict image-moderation and classification system for a municipal civic-issue "
    "reporting app. Citizens upload a photo of a real public-infrastructure PROBLEM. Your job is to "
    "reject anything that is not clearly such a problem. Be conservative: when unsure, do NOT accept. "
    "You always reply with strict minified JSON only, no markdown."
)
VISION_PROMPT = (
    "Classify the attached image. Decide if it clearly depicts a REAL, currently-visible civic "
    "infrastructure PROBLEM belonging to exactly one of these categories:\n"
    "- pothole_or_damaged_road (visible pothole, crack, broken/damaged road surface)\n"
    "- broken_streetlight (damaged/fallen/non-functional street light or pole)\n"
    "- water_leak_or_pipeline_burst (leaking/burst pipe, water gushing)\n"
    "- sewage_or_open_or_blocked_drain (open manhole, overflowing sewage, blocked drain)\n"
    "- garbage_or_overflowing_bin (garbage pile, dumped trash, overflowing dustbin)\n"
    "- broken_footpath_or_pavement (damaged/broken sidewalk, tiles, kerb)\n"
    "- damaged_public_property (broken public bench, sign, railing, bus stop, etc.)\n"
    "- waterlogging_or_flooding (water logged / flooded road or street)\n\n"
    "REJECT (set is_civic_issue=false, category='none') for anything else, including but not limited to: "
    "mountains, hills, landscapes, scenery, sky, sunsets, beaches, rivers, fields, forests, gardens, "
    "flowers, animals/pets, food, selfies or portraits of people, group photos, indoor rooms, "
    "screenshots, documents, memes, product/object photos, vehicles in good condition, a normal clean "
    "road or street with NO visible damage, or any generic outdoor/nature photo. A plain intact road, "
    "footpath or streetlight with no visible defect is NOT a valid issue.\n\n"
    "Also judge whether the image is AI-generated, synthetic, or digitally manipulated/edited "
    "(GAN/diffusion artifacts, unnatural textures, impossible geometry, obvious compositing).\n\n"
    "Return strict JSON with EXACTLY these keys: "
    '{"is_civic_issue": boolean, "category": one of the 8 category ids above or "none", '
    '"confidence": number 0..1 (your confidence that the image truly shows THAT civic problem; '
    'use a LOW value for anything ambiguous, distant, unclear, or not clearly a problem), '
    '"ai_generated": boolean, "ai_confidence": number 0..1, '
    '"reason": short human-readable explanation of the decision}.'
)


def _extract_exif(data: bytes) -> dict:
    info = {"has_exif": False, "camera": None, "datetime": None, "gps": False, "software": None}
    try:
        img = Image.open(io.BytesIO(data))
        exif = img._getexif() if hasattr(img, "_getexif") else None
        if not exif:
            return info
        tagmap = {ExifTags.TAGS.get(k, k): v for k, v in exif.items()}
        info["has_exif"] = True
        make = tagmap.get("Make"); model = tagmap.get("Model")
        if make or model:
            info["camera"] = f"{make or ''} {model or ''}".strip()
        info["datetime"] = str(tagmap.get("DateTimeOriginal") or tagmap.get("DateTime") or "") or None
        info["software"] = str(tagmap.get("Software") or "") or None
        info["gps"] = bool(tagmap.get("GPSInfo"))
    except Exception:
        pass
    return info


async def verify_photo(data: bytes, mime: str) -> dict:
    """Strict multi-step pipeline: civic classification + confidence threshold + AI-generated/edited check + EXIF signal."""
    exif = _extract_exif(data)
    result = {
        "relevant": True, "reason": "", "flagged_ai_generated": False,
        "reject_code": "", "category": "none", "confidence": 0.0,
        "ai_generated": False, "exif": exif, "skipped": False,
    }
    if not EMERGENT_LLM_KEY:
        result["skipped"] = True
        return result
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
        b64 = base64.b64encode(data).decode()
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"verify-{uuid.uuid4().hex[:8]}",
            system_message=VISION_SYSTEM,
        ).with_model(*VISION_MODEL)
        resp = await chat.send_message(
            UserMessage(text=VISION_PROMPT, file_contents=[ImageContent(image_base64=b64)])
        )
        parsed = json.loads(_extract_json(resp if isinstance(resp, str) else str(resp)))

        is_civic = bool(parsed.get("is_civic_issue", False))
        category = str(parsed.get("category", "none"))
        confidence = float(parsed.get("confidence", 0.0) or 0.0)
        ai_generated = bool(parsed.get("ai_generated", False))
        ai_conf = float(parsed.get("ai_confidence", 0.0) or 0.0)
        model_reason = str(parsed.get("reason", ""))

        # EXIF-based edit signal (metadata inconsistency) — reinforces AI/edited detection
        edited_by_software = False
        if exif.get("software"):
            sw = exif["software"].lower()
            edited_by_software = any(m in sw for m in EDIT_SOFTWARE_MARKERS)

        result.update({
            "category": category, "confidence": confidence,
            "ai_generated": ai_generated, "model_reason": model_reason,
        })

        # ---- Final validation flow (order: civic relevance, then authenticity, then confidence) ----
        if not is_civic or category not in CIVIC_CATEGORIES:
            result.update({
                "relevant": False, "reject_code": "not_civic",
                "reason": "This photo doesn't show a civic issue we can act on (e.g. pothole, garbage, broken streetlight, water/drain problem). Please upload a clear photo of the actual problem.",
            })
        elif (ai_generated and ai_conf >= AI_CONFIDENCE_THRESHOLD) or edited_by_software:
            result.update({
                "relevant": False, "reject_code": "ai_generated", "flagged_ai_generated": True,
                "reason": "This image appears to be AI-generated or edited. Please upload an original photo of the issue taken directly from your camera.",
            })
        elif confidence < CIVIC_CONFIDENCE_THRESHOLD:
            result.update({
                "relevant": False, "reject_code": "low_confidence",
                "reason": "We couldn't clearly identify the issue in this photo. Please retake a clearer, closer photo of the problem.",
            })
        else:
            result.update({"relevant": True, "reason": model_reason})
        logger.info(
            f"verify_photo -> relevant={result['relevant']} code={result['reject_code']} "
            f"cat={category} conf={confidence:.2f} ai={ai_generated}/{ai_conf:.2f} exif_sw={exif.get('software')}"
        )
        return result
    except Exception as e:
        logger.error(f"Photo verification failed (fail-open): {e}")
        result["skipped"] = True
        return result


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
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        return text[start:end + 1]
    return text


# ---------- Models ----------
class IssueCreate(BaseModel):
    photo_path: str
    latitude: float
    longitude: float
    address_text: str
    description: Optional[str] = ""
    reporter_id: Optional[str] = None
    reporter_name: Optional[str] = "Anonymous"
    reporter_picture: Optional[str] = None
    flagged_ai_generated: Optional[bool] = False


class StatusUpdateIn(BaseModel):
    status: str
    note: Optional[str] = ""


class CategoryUpdateIn(BaseModel):
    category: str


class CommentCreate(BaseModel):
    text: str
    user_id: Optional[str] = None
    user_name: Optional[str] = "Anonymous"


class ConfirmIn(BaseModel):
    device_id: str


# ---------- Auth ----------
async def get_current_user(session_token: Optional[str] = Cookie(None), authorization: Optional[str] = Header(None)):
    token = session_token
    if not token and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1]
    if not token:
        return None
    sess = await db.user_sessions.find_one({"session_token": token})
    if not sess:
        return None
    exp = sess.get("expires_at")
    if isinstance(exp, str):
        exp = datetime.fromisoformat(exp)
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < datetime.now(timezone.utc):
        return None
    return await db.users.find_one({"user_id": sess["user_id"]}, {"_id": 0})


@api_router.post("/auth/session")
async def auth_session(request: Request, response: Response):
    session_id = request.headers.get("X-Session-ID")
    if not session_id:
        raise HTTPException(status_code=400, detail="Missing session id")
    r = requests.get(
        "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
        headers={"X-Session-ID": session_id}, timeout=30,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid session")
    d = r.json()
    email = d["email"]
    is_admin = email == ADMIN_EMAIL
    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if not existing:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user = {
            "user_id": user_id, "email": email, "name": d.get("name"),
            "picture": d.get("picture"), "is_admin": is_admin, "created_at": now_iso(),
        }
        await db.users.insert_one(dict(user))
    else:
        user_id = existing["user_id"]
        await db.users.update_one(
            {"email": email},
            {"$set": {"name": d.get("name"), "picture": d.get("picture"), "is_admin": is_admin}},
        )
        user = {**existing, "name": d.get("name"), "picture": d.get("picture"), "is_admin": is_admin}
    token = d["session_token"]
    expires = datetime.now(timezone.utc) + timedelta(days=7)
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": token,
        "expires_at": expires.isoformat(), "created_at": now_iso(),
    })
    response.set_cookie(
        "session_token", token, httponly=True, secure=True,
        samesite="none", path="/", max_age=7 * 24 * 3600,
    )
    user.pop("_id", None)
    return user


@api_router.get("/auth/me")
async def auth_me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


@api_router.post("/auth/logout")
async def auth_logout(response: Response, session_token: Optional[str] = Cookie(None)):
    if session_token:
        await db.user_sessions.delete_many({"session_token": session_token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    try:
        init_storage()
        logger.info("Storage initialized")
    except Exception as e:
        logger.error(f"Storage init failed: {e}")


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "CivicFix API"}


@api_router.get("/geocode/reverse")
async def geocode_reverse(lat: float, lng: float):
    try:
        r = requests.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"format": "jsonv2", "lat": lat, "lon": lng, "addressdetails": 1},
            headers={"User-Agent": NOMINATIM_UA, "Accept": "application/json"},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        address = data.get("display_name") or f"Lat {lat:.5f}, Lng {lng:.5f}"
        return {"address": address}
    except Exception as e:
        logger.error(f"Geocode failed: {e}")
        return {"address": f"Lat {lat:.5f}, Lng {lng:.5f}"}


@api_router.post("/upload")
async def upload(file: UploadFile = File(...)):
    ext = (file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else "jpg")
    content_type = MIME_TYPES.get(ext, file.content_type or "image/jpeg")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large")

    verdict = await verify_photo(data, content_type)
    if not verdict["relevant"]:
        return {
            "relevant": False,
            "reject_code": verdict.get("reject_code", "not_civic"),
            "reason": verdict.get("reason") or "This photo does not look like a civic issue.",
            "flagged_ai_generated": verdict.get("flagged_ai_generated", False),
            "category": verdict.get("category", "none"),
            "confidence": verdict.get("confidence", 0.0),
        }

    path = f"{APP_NAME}/uploads/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, content_type)
    return {
        "photo_path": result["path"],
        "relevant": True,
        "reason": verdict.get("reason", ""),
        "flagged_ai_generated": verdict.get("flagged_ai_generated", False),
        "category": verdict.get("category", "none"),
        "confidence": verdict.get("confidence", 0.0),
    }


@api_router.get("/files/{path:path}")
async def download(path: str):
    try:
        data, content_type = get_object(path)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found")
    return Response(content=data, media_type=content_type)


@api_router.post("/issues")
async def create_issue(payload: IssueCreate, user=Depends(get_current_user)):
    issue_id = str(uuid.uuid4())
    short_id = issue_id.split("-")[0].upper()
    ts = now_iso()
    category = classify(payload.description)
    reporter_id = payload.reporter_id
    reporter_name = payload.reporter_name or "Anonymous"
    reporter_picture = payload.reporter_picture
    if user:
        reporter_id = user["user_id"]
        reporter_name = user.get("name") or reporter_name
        reporter_picture = user.get("picture")
    doc = {
        "id": issue_id,
        "short_id": short_id,
        "reporter_id": reporter_id,
        "reporter_name": reporter_name,
        "reporter_picture": reporter_picture,
        "photo_path": payload.photo_path,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "address_text": payload.address_text,
        "description": payload.description or "",
        "category": category,
        "status": "open",
        "confirm_count": 0,
        "confirmed_by": [],
        "flagged_ai_generated": bool(payload.flagged_ai_generated),
        "timeline": [{"status": "reported", "note": "Issue reported by citizen", "created_at": ts}],
        "comments": [],
        "created_at": ts,
        "updated_at": ts,
    }
    await db.issues.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.get("/issues")
async def list_issues(category: Optional[str] = None, status: Optional[str] = None,
                      reporter_id: Optional[str] = None, flagged: Optional[bool] = None):
    query = {}
    if category and category != "all":
        query["category"] = category
    if status and status != "all":
        query["status"] = status
    if reporter_id:
        query["reporter_id"] = reporter_id
    if flagged is not None:
        query["flagged_ai_generated"] = flagged
    issues = await db.issues.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return issues


@api_router.get("/issues/{issue_id}")
async def get_issue(issue_id: str):
    issue = await db.issues.find_one({"id": issue_id}, {"_id": 0})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return issue


@api_router.post("/issues/{issue_id}/confirm")
async def confirm_issue(issue_id: str, payload: ConfirmIn):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    confirmed_by = issue.get("confirmed_by", [])
    if payload.device_id in confirmed_by:
        return {"confirm_count": issue.get("confirm_count", 0), "already": True}
    confirmed_by.append(payload.device_id)
    await db.issues.update_one(
        {"id": issue_id},
        {"$set": {"confirmed_by": confirmed_by, "confirm_count": len(confirmed_by), "updated_at": now_iso()}},
    )
    return {"confirm_count": len(confirmed_by), "already": False}


@api_router.post("/issues/{issue_id}/comments")
async def add_comment(issue_id: str, payload: CommentCreate, user=Depends(get_current_user)):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    user_name = payload.user_name or "Anonymous"
    user_id = payload.user_id
    if user:
        user_name = user.get("name") or user_name
        user_id = user["user_id"]
    comment = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "user_name": user_name,
        "text": payload.text.strip(),
        "created_at": now_iso(),
    }
    await db.issues.update_one(
        {"id": issue_id},
        {"$push": {"comments": comment}, "$set": {"updated_at": now_iso()}},
    )
    return comment


@api_router.patch("/issues/{issue_id}/status")
async def update_status(issue_id: str, payload: StatusUpdateIn):
    issue = await db.issues.find_one({"id": issue_id})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    if payload.status not in STATUS_ORDER:
        raise HTTPException(status_code=400, detail="Invalid status")
    entry = {"status": payload.status, "note": payload.note or "", "created_at": now_iso()}
    top_status = "resolved" if payload.status == "resolved" else ("in_progress" if payload.status in ("in_progress", "acknowledged") else "open")
    await db.issues.update_one(
        {"id": issue_id},
        {"$push": {"timeline": entry}, "$set": {"status": top_status, "updated_at": now_iso()}},
    )
    return await db.issues.find_one({"id": issue_id}, {"_id": 0})


@api_router.patch("/issues/{issue_id}/category")
async def update_category(issue_id: str, payload: CategoryUpdateIn):
    result = await db.issues.update_one(
        {"id": issue_id},
        {"$set": {"category": payload.category, "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Issue not found")
    return await db.issues.find_one({"id": issue_id}, {"_id": 0})


@api_router.get("/admin/metrics")
async def admin_metrics():
    all_issues = await db.issues.find({}, {"_id": 0}).to_list(1000)
    total = len(all_issues)
    open_count = len([i for i in all_issues if i["status"] == "open"])
    in_progress = len([i for i in all_issues if i["status"] == "in_progress"])
    resolved = len([i for i in all_issues if i["status"] == "resolved"])
    flagged = len([i for i in all_issues if i.get("flagged_ai_generated")])
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    resolved_this_week = len([
        i for i in all_issues if i["status"] == "resolved" and i.get("updated_at", "") >= week_ago
    ])
    by_category = {}
    for i in all_issues:
        c = i.get("category", "uncategorized")
        by_category[c] = by_category.get(c, 0) + 1
    return {
        "total": total, "open": open_count, "in_progress": in_progress,
        "resolved": resolved, "resolved_this_week": resolved_this_week,
        "flagged": flagged, "by_category": by_category,
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
