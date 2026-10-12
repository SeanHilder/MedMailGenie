"""Request and response models shared by the API and email service."""

from pydantic import BaseModel, Field


class ThreadMessage(BaseModel):
    sender: str = "unknown"
    date: str = ""
    subject: str = ""
    body: str = ""


class EmailInput(BaseModel):
    subject: str
    body: str
    # Optional conversation context, oldest first. subject/body describe the latest
    # message, so clients that send a single email keep working unchanged.
    messages: list[ThreadMessage] = Field(default_factory=list)
    # Signed-in Gmail address, used to tell which thread messages the user wrote.
    user_email: str = ""


class SummaryResponse(BaseModel):
    summary: str


class ThreadInput(BaseModel):
    messages: list[ThreadMessage]


class DraftInput(EmailInput):
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