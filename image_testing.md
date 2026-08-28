# Image Integration Testing Playbook

## Rules
- Use base64-encoded images (JPEG/PNG/WEBP only).
- No SVG/BMP/HEIC. No blank/solid-color images. Must contain real visual features.
- Re-detect MIME after any transform. Animated → first frame only. Resize oversized payloads.

## CivicFix specifics
- POST /api/upload (multipart image) runs AI verification and returns:
  { photo_path, relevant: bool, reason: str, flagged_ai_generated: bool }
- If relevant=false → frontend blocks submission with a message.
- If flagged_ai_generated=true → still allowed; stored on issue for admin review.
- Vision model: gpt-5.4 (OpenAI) via emergentintegrations LlmChat + ImageContent, non-streaming send_message returning JSON.
- Test with a real photo of a pothole/garbage/street (relevant=true) and an unrelated screenshot (relevant=false).
