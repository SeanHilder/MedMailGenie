"""Request and response models shared by the API and email service."""

from pydantic import BaseModel


class EmailInput(BaseModel):
    subject: str
    body: str


class SummaryResponse(BaseModel):
    summary: str


class ThreadMessage(BaseModel):
    sender: str = "unknown"
    subject: str = ""
    body: str = ""


class ThreadInput(BaseModel):
    messages: list[ThreadMessage]


class DraftInput(BaseModel):
    subject: str
    body: str
    tone: str = "professional"


class DraftResponse(BaseModel):
    draft_reply: str


class PriorityResponse(BaseModel):
    priority: str


class CategoryResponse(BaseModel):
    category: str


class CalendarEvent(BaseModel):
    title: str
    start: str
    end: str


class TaskExtractionResponse(BaseModel):
    tasks: list[str]
    deadlines: list[str]
    meeting_times: list[str]
    calendar_events: list[CalendarEvent]


class VoiceCleanupInput(BaseModel):
    transcript: str


class VoiceCleanupResponse(BaseModel):
    cleaned_text: str
