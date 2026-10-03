"""The only module that talks to Gemini; initialized on the first AI request."""

from functools import lru_cache

from .config import GEMINI_MODEL, GOOGLE_API_KEY


@lru_cache(maxsize=1)
def get_model():
    if not GOOGLE_API_KEY:
        raise RuntimeError(
            "Set GOOGLE_API_KEY in backend/.env before using AI features."
        )

    import google.generativeai as genai

    genai.configure(api_key=GOOGLE_API_KEY)
    return genai.GenerativeModel(GEMINI_MODEL)


def generate_text(prompt: str) -> str:
    return get_model().generate_content(prompt).text.strip()
