"""Two-stage image verification using Google Gemini (multimodal). No Emergent LLM here."""
import os
import json
import time
import logging

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or ""
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

CIVIC_LABELS = {
    "pothole/road damage", "broken streetlight", "water leakage/pipeline burst",
    "sewage overflow/blocked drain", "garbage dumping/overflowing bin",
    "broken footpath/pavement damage", "damaged public property", "waterlogging/flooding",
}
CONF_THRESHOLD = 80        # civic confidence (0-100)
AI_CONF_THRESHOLD = 30     # reject if AI-generated confidence >= this
EDIT_SOFTWARE_MARKERS = ["photoshop", "gimp", "lightroom", "affinity", "midjourney", "dall-e", "dall·e", "stable diffusion"]

STAGE1_PROMPT = (
    "You are a strict municipal civic-issue image classifier. Classify the image into EXACTLY one of: "
    "'Pothole/Road Damage', 'Broken Streetlight', 'Water Leakage/Pipeline Burst', "
    "'Sewage Overflow/Blocked Drain', 'Garbage Dumping/Overflowing Bin', "
    "'Broken Footpath/Pavement Damage', 'Damaged Public Property', 'Waterlogging/Flooding', or 'NONE'. "
    "Return 'NONE' for landscapes, nature/scenery, sky, unrelated objects, people/selfies, screenshots, "
    "documents, food, indoor rooms, or anything WITHOUT a clearly visible civic defect. Do NOT infer an issue "
    "that is not clearly shown. Respond ONLY as JSON: "
    '{"category": string, "confidence": integer 0-100, "reasoning": string, "is_valid_civic_issue": boolean}.'
)
STAGE2_PROMPT = (
    "Analyze this image for signs of AI generation or synthetic manipulation: unnatural textures, inconsistent "
    "lighting/shadows, warped or impossible structures, blurred/garbled text, and other synthetic artifacts. "
    "Respond ONLY as JSON: "
    '{"is_ai_generated": boolean, "confidence": integer 0-100, "indicators": [string, ...]}.'
)


def is_configured() -> bool:
    return bool(GEMINI_API_KEY)


def _extract_json(text: str) -> str:
    text = (text or "").strip()
    s, e = text.find("{"), text.rfind("}")
    return text[s:e + 1] if s != -1 and e != -1 else text


def _call(data: bytes, mime: str, prompt: str, retries: int = 2) -> dict:
    from google import genai
    from google.genai import types
    last = None
    for attempt in range(retries + 1):
        try:
            client = genai.Client(api_key=GEMINI_API_KEY)
            resp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[types.Part.from_bytes(data=data, mime_type=mime or "image/jpeg"), prompt],
                config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
            )
            return json.loads(_extract_json(resp.text))
        except Exception as e:
            last = e
            logger.error(f"[GEMINI] call failed (attempt {attempt + 1}): {e}")
            time.sleep(0.6 * (attempt + 1))
    raise last


def verify(data: bytes, mime: str, exif: dict) -> dict:
    result = {"relevant": True, "reason": "", "flagged_ai_generated": False, "reject_code": "",
              "category": "none", "confidence": 0.0, "ai_generated": False, "exif": exif,
              "skipped": False, "needs_review": False, "gemini": {}}

    if not is_configured():
        logger.error("[GEMINI] GEMINI_API_KEY not set — queuing photo for manual review (not auto-accepting).")
        result.update({"relevant": False, "reject_code": "review", "needs_review": True,
                       "reason": "Photo verification is temporarily unavailable. Please try again in a moment."})
        return result

    # ---- Stage 1: civic issue detection ----
    try:
        s1 = _call(data, mime, STAGE1_PROMPT)
    except Exception as e:
        logger.error(f"[GEMINI] Stage 1 failed permanently: {e}")
        result.update({"relevant": False, "reject_code": "review", "needs_review": True,
                       "reason": "We couldn't verify your photo right now. Please try again in a moment."})
        return result

    logger.info(f"[GEMINI S1] {json.dumps(s1)}")
    result["gemini"]["stage1"] = s1
    category = str(s1.get("category", "NONE") or "NONE")
    is_valid = bool(s1.get("is_valid_civic_issue", False))
    conf = float(s1.get("confidence", 0) or 0)
    reasoning = str(s1.get("reasoning", ""))
    result.update({"category": category, "confidence": round(conf / 100.0, 3)})

    if (not is_valid) or category.strip().upper() == "NONE" or category.strip().lower() not in CIVIC_LABELS:
        result.update({"relevant": False, "reject_code": "not_civic",
                       "reason": "This photo doesn't show a civic issue we can act on (e.g. pothole, garbage, broken streetlight, water/drain problem). Please upload a clear photo of the actual problem."})
        return result
    if conf < CONF_THRESHOLD:
        result.update({"relevant": False, "reject_code": "low_confidence",
                       "reason": "We couldn't clearly identify the issue in this photo. Please retake a clearer, closer photo of the problem."})
        return result

    # ---- Stage 2: AI-generated detection ----
    try:
        s2 = _call(data, mime, STAGE2_PROMPT)
    except Exception as e:
        logger.error(f"[GEMINI] Stage 2 failed permanently: {e}")
        result.update({"relevant": False, "reject_code": "review", "needs_review": True,
                       "reason": "We couldn't verify your photo right now. Please try again in a moment."})
        return result

    logger.info(f"[GEMINI S2] {json.dumps(s2)}")
    result["gemini"]["stage2"] = s2
    ai_generated = bool(s2.get("is_ai_generated", False))
    ai_conf = float(s2.get("confidence", 0) or 0)
    result["ai_generated"] = ai_generated

    # EXIF secondary signal: editor software => treat as edited/synthetic
    edited_by_software = False
    if exif.get("software"):
        sw = exif["software"].lower()
        edited_by_software = any(m in sw for m in EDIT_SOFTWARE_MARKERS)
    exif_missing = not (exif.get("camera") or exif.get("gps") or exif.get("datetime"))

    if (ai_generated and ai_conf >= AI_CONF_THRESHOLD) or edited_by_software:
        result.update({"relevant": False, "reject_code": "ai_generated", "flagged_ai_generated": True,
                       "reason": "This image appears to be AI-generated or edited. Please upload an original photo of the issue taken directly from your camera."})
        return result

    result.update({"relevant": True, "reason": reasoning, "flagged_ai_generated": exif_missing and ai_conf >= 15})
    logger.info(f"[GEMINI] accepted cat='{category}' conf={conf} ai={ai_generated}/{ai_conf} exif_missing={exif_missing}")
    return result
