from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger("pet_finder.gemini")

# Language names mapping
LANG_NAMES = {
    "en": "English",
    "kn": "Kannada (ಕನ್ನಡ)",
    "hi": "Hindi (हिन्दी)",
}


def _client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini is not configured. Set GEMINI_API_KEY in the backend environment.")
    from google import genai
    return genai.Client(api_key=api_key)


def _generate(model: str, contents: list[Any]) -> str:
    from google.genai import types
    response = _client().models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    if not response.text:
        raise RuntimeError("Gemini returned an empty response.")
    return response.text


async def analyze_pet_image(image_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    from google.genai import types
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    prompt = (
        "Analyze this pet photograph for a lost-and-found listing. Return JSON only with these keys: "
        "animal_type, colours, fur_pattern, visible_markings, approximate_breed, visible_accessories, "
        "description, confidence_note. Use concise strings; use 'Not clear' when not visible. "
        "Do not infer identity, exact breed, age, or facts not visible in the image. "
        "The description should describe observable appearance only."
    )
    text = await asyncio.to_thread(
        _generate,
        model,
        [prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)],
    )
    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Gemini did not return valid JSON.") from exc
    expected = (
        "animal_type",
        "colours",
        "fur_pattern",
        "visible_markings",
        "approximate_breed",
        "visible_accessories",
        "description",
        "confidence_note",
    )
    if not isinstance(result, dict) or any(not isinstance(result.get(key), str) for key in expected):
        raise RuntimeError("Gemini returned an incomplete visual analysis.")
    return {key: result[key].strip() for key in expected}


async def explain_pet_match(
    lost_image_bytes: bytes,
    lost_mime: str,
    found_image_bytes: bytes,
    found_mime: str,
    lost_desc: str,
    found_desc: str,
) -> Dict[str, Any]:
    from google.genai import types
    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    prompt = (
        "Compare these two pet images (lost pet vs found pet). "
        "Explain visible visual similarities and differences (markings, fur pattern, coat color, ear shape). "
        "Separate image observations from the owner-provided report notes below; do not treat notes as visual proof. "
        "Return JSON with keys: similarities (list of strings), differences (list of strings), "
        "summary (string), verification_advice (string). Remind user that visual similarity is not biological proof."
    )
    contents = [
        prompt,
        types.Part.from_bytes(data=lost_image_bytes, mime_type=lost_mime),
        types.Part.from_bytes(data=found_image_bytes, mime_type=found_mime),
        f"Lost report details: {lost_desc}\nFound report details: {found_desc}",
    ]
    text = await asyncio.to_thread(_generate, model, contents)
    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Gemini did not return valid match-analysis JSON.") from exc
    if (
        not isinstance(result, dict)
        or not isinstance(result.get("similarities"), list)
        or not isinstance(result.get("differences"), list)
        or not all(isinstance(item, str) for item in result["similarities"] + result["differences"])
        or not isinstance(result.get("summary"), str)
        or not isinstance(result.get("verification_advice"), str)
    ):
        raise RuntimeError("Gemini returned an incomplete match explanation.")
    return result


def _get_gemini_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Gemini is not configured. Set GEMINI_API_KEY in the backend environment.")
    from google import genai
    return genai.Client(api_key=api_key)


async def chat_assistant(
    conversation_history: List[Dict[str, str]],
    user_message: str,
    language: str = "en",
) -> Dict[str, str]:
    """
    Conversational GenAI Pet Recovery Assistant.
    Supports English, Kannada, and Hindi.
    """
    client = _get_gemini_client()
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    lang_name = LANG_NAMES.get(language, "English")

    system_instruction = (
        f"You are Paw AI, an empathetic Pet-Finder platform guide. "
        f"Respond in {lang_name}. "
        "Help with reporting lost or found pets, understanding potential matches, safe communication, and platform navigation. "
        "Do not invent platform features, nearby services, distances, animal behavior, or facts about a pet. "
        "State uncertainty when relevant and remind users that visual similarity does not confirm identity."
    )
    history_text = "\n".join(
        f"{item.get('role', 'user')}: {item.get('content', '')}"
        for item in conversation_history[-8:]
    )
    prompt_content = f"{history_text}\nuser: {user_message}\n\nAnswer clearly and practically in {lang_name}."
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents=[system_instruction, prompt_content],
        )
    except Exception as exc:
        logger.exception("Gemini assistant request failed.")
        raise RuntimeError("Paw AI is temporarily unavailable. Please try again later.") from exc
    if not response or not response.text:
        raise RuntimeError("Gemini returned an empty assistant response.")
    return {"reply": response.text.strip(), "language": language, "provider": "gemini"}


async def generate_social_announcement(pet: Dict[str, Any], language: str = "en") -> Dict[str, str]:
    """
    Generates tailored social media and messenger announcements for a missing pet.
    """
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    prompt = (
        "Draft a concise missing-pet announcement using only the supplied report details. "
        "Do not invent a reward, contact information, exact sighting, behavior, or detail. "
        "Return JSON with keys headline, body, hashtags, whatsapp_snippet, twitter_snippet. "
        f"Write in {LANG_NAMES.get(language, 'English')}. Report JSON: "
        + json.dumps({
            key: pet.get(key)
            for key in ("pet_name", "pet_type", "breed", "colour", "location", "date", "description")
        }, ensure_ascii=False)
    )
    text = await asyncio.to_thread(_generate, model_name, [prompt])
    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("Gemini did not return valid announcement JSON.") from exc
    required_keys = {"headline", "body", "hashtags", "whatsapp_snippet", "twitter_snippet"}
    if not isinstance(result, dict) or not required_keys.issubset(result):
        raise RuntimeError("Gemini returned an incomplete announcement.")
    return {key: str(result[key]) for key in required_keys}


async def translate_text(text: str, target_lang: str, source_lang: str = "en") -> str:
    """
    Translates text between English, Kannada, and Hindi.
    """
    if not text or target_lang == source_lang:
        return text

    client = _get_gemini_client()
    target_name = LANG_NAMES.get(target_lang, "English")
    source_name = LANG_NAMES.get(source_lang, "English")
    prompt = f"Translate accurately from {source_name} to {target_name}. Output only the translation:\n\n{text}"
    try:
        response = await asyncio.to_thread(
            client.models.generate_content,
            model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
            contents=prompt,
        )
    except Exception as exc:
        logger.exception("Gemini translation request failed.")
        raise RuntimeError("Translation is temporarily unavailable.") from exc
    if not response or not response.text:
        raise RuntimeError("Gemini returned an empty translation.")
    return response.text.strip()
