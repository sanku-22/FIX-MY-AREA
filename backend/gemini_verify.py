"""Two-stage image verification. Uses Google Gemini (multimodal) when GEMINI_API_KEY is set,
otherwise falls back to the Emergent universal key (vision) running the same prompts."""
import os
import io
import json
import time
import uuid
import logging

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY") or ""
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY") or ""
EMERGENT_VISION_MODEL = ("openai", "gpt-5.4")

CIVIC_LABELS = {
    "pothole/road damage", "broken streetlight", "water leakage/pipeline burst",
    "sewage overflow/blocked drain", "garbage dumping/overflowing bin",
    "broken footpath/pavement damage", "damaged public property", "waterlogging/flooding",
}
CONF_THRESHOLD = 80        # civic confidence (0-100)
AI_CONF_THRESHOLD = 85     # reject ONLY when model is highly confident image is AI-generated
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
    "Determine whether this photo is FULLY AI-GENERATED or synthetically fabricated (e.g. Midjourney, DALL-E, "
    "Stable Diffusion). Assume it is a REAL photo by default. Ordinary real-photo traits are NOT evidence of AI "
    "and must be IGNORED: JPEG/compression artifacts, noise/grain, motion blur, low light, over/underexposure, "
    "lens distortion, low resolution, dirt, watermarks/timestamps, or being taken on a cheap phone camera. "
    "ONLY set is_ai_generated=true if there is STRONG, unmistakable evidence of synthesis such as clearly impossible "
    "geometry, melted/warped objects, garbled fake text, or plastic 'render' surfaces. When uncertain, set "
    "is_ai_generated=false with low confidence. 'confidence' = how confident you are that the image IS AI-generated "
    "(0 = certainly a real photo, 100 = certainly AI-generated). "
    "Respond ONLY as JSON: "
    '{"is_ai_generated": boolean, "confidence": integer 0-100, "indicators": [string, ...]}.'
)


def is_configured() -> bool:
    return bool(GEMINI_API_KEY or EMERGENT_LLM_KEY)


def _extract_json(text: str) -> str:
    text = (text or "").strip()
    s, e = text.find("{"), text.rfind("}")
    return text[s:e + 1] if s != -1 and e != -1 else text


def _call_gemini(data: bytes, mime: str, prompt: str) -> dict:
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[types.Part.from_bytes(data=data, mime_type=mime or "image/jpeg"), prompt],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0),
    )
    return json.loads(_extract_json(resp.text))


def _call_emergent(data: bytes, mime: str, prompt: str) -> dict:
    """Fallback vision call via the Emergent universal key (used only when GEMINI_API_KEY is absent)."""
    import asyncio
    import base64
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    b64 = base64.b64encode(data).decode()
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"verify-{uuid.uuid4().hex[:8]}",
                   system_message="You are a strict image analyzer. Reply with strict minified JSON only.").with_model(*EMERGENT_VISION_MODEL)
    resp = asyncio.run(chat.send_message(UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])))
    return json.loads(_extract_json(resp if isinstance(resp, str) else str(resp)))


def _call(data: bytes, mime: str, prompt: str, retries: int = 2) -> dict:
    provider = "gemini" if GEMINI_API_KEY else ("emergent" if EMERGENT_LLM_KEY else None)
    if provider is None:
        raise RuntimeError("No verification API key configured")
    last = None
    for attempt in range(retries + 1):
        try:
            return _call_gemini(data, mime, prompt) if provider == "gemini" else _call_emergent(data, mime, prompt)
        except Exception as e:
            last = e
            logger.error(f"[VERIFY:{provider}] call failed (attempt {attempt + 1}): {e}")
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

    # EXIF secondary signal: only flag if a KNOWN generative-AI tool wrote the metadata.
    # (Missing EXIF is normal — browsers/messaging apps strip it — so it is NOT used to reject.)
    ai_software = False
    if exif.get("software"):
        sw = exif["software"].lower()
        ai_software = any(m in sw for m in EDIT_SOFTWARE_MARKERS)

    if (ai_generated and ai_conf >= AI_CONF_THRESHOLD) or ai_software:
        result.update({"relevant": False, "reject_code": "ai_generated", "flagged_ai_generated": True,
                       "reason": "This image appears to be AI-generated. Please upload an original photo of the issue taken directly from your camera."})
        return result

    # Soft flag (still accepted) only when the model leans AI with moderate confidence.
    result.update({"relevant": True, "reason": reasoning, "flagged_ai_generated": ai_generated and ai_conf >= 70})
    logger.info(f"[GEMINI] accepted cat='{category}' conf={conf} ai={ai_generated}/{ai_conf}")
    return result
