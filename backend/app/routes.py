"""HTTP endpoints; keep business logic in services.py."""

from fastapi import APIRouter, HTTPException

from . import services
from .schemas import (
    CategoryResponse,
    DraftInput,
    DraftResponse,
    EmailInput,
    PriorityResponse,
    SummaryResponse,
    TaskExtractionResponse,
    ThreadInput,
    VoiceCleanupInput,
    VoiceCleanupResponse,
)

router = APIRouter()


@router.get("/")
def health_check():
    return {"status": "MedMail Genie backend is running"}


@router.post("/summarize/email", response_model=SummaryResponse)
def summarize_single_email(email: EmailInput):
    try:
        summary = services.summarize_email(email.subject, email.body)

        return SummaryResponse(summary=summary)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/summarize/thread", response_model=SummaryResponse)
def summarize_email_thread(thread: ThreadInput):
    try:
        summary = services.summarize_thread(thread.messages)

        return SummaryResponse(summary=summary)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/draft/generate", response_model=DraftResponse)
def generate_draft(draft_input: DraftInput):
    try:
        draft = services.generate_draft_reply(
            draft_input.subject, draft_input.body, draft_input.tone
        )

        return DraftResponse(draft_reply=draft)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/classify/priority", response_model=PriorityResponse)
def classify_priority_endpoint(email: EmailInput):
    try:
        priority = services.classify_priority(email.subject, email.body)

        return PriorityResponse(priority=priority)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/classify/category", response_model=CategoryResponse)
def classify_category_endpoint(email: EmailInput):
    try:
        category = services.classify_category(email.subject, email.body)

        return CategoryResponse(category=category)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/extract/tasks", response_model=TaskExtractionResponse)
def extract_tasks_endpoint(email: EmailInput):
    try:
        result = services.extract_tasks(email.subject, email.body)

        return TaskExtractionResponse(**result)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/voice/cleanup", response_model=VoiceCleanupResponse)
def cleanup_voice_transcript(voice_input: VoiceCleanupInput):
    try:
        transcript = voice_input.transcript.strip()

        if not transcript:
            return VoiceCleanupResponse(cleaned_text="")

        cleaned_text = services.clean_voice_transcript(transcript)

        return VoiceCleanupResponse(cleaned_text=cleaned_text)

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
