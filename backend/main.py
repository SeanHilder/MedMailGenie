"""
main.py

FastAPI backend for MedMail Genie.
Implements:
- R7: Summarisation endpoint
- R2, R5: Draft reply generation endpoint (with tone adjustment)
- R1: Priority classification endpoint
- R6: Task / calendar extraction endpoint

Still to add:
- R1: Category classification (James)

Setup:
    pip install -r requirements.txt

Before running:
    Create a '.env' file in the backend/ folder with:
        GOOGLE_API_KEY=your_key_here

Run:
    uvicorn main:app --reload

Then test at http://127.0.0.1:8000/docs (FastAPI's auto-generated API docs)
"""

import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()
genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))

MODEL_NAME = "gemini-3.5-flash-lite"
model = genai.GenerativeModel(MODEL_NAME)

app = FastAPI(title="MedMail Genie API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/response schemas ---

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
    priority: str  # "High" | "Medium" | "Low"


class TaskExtractionResponse(BaseModel):
    tasks: list[str]
    deadlines: list[str]
    meeting_times: list[str]


# --- Summarisation logic (R7) ---

def summarize_email(subject: str, body: str, max_sentences: int = 2) -> str:
    prompt = f"""
Summarise the following email in {max_sentences} sentences or fewer.
Focus on the main point, any action items, and any deadlines mentioned.
Do not add information that isn't in the email. Return plain text only,
no markdown, no preamble like "Here is a summary:".

Subject: {subject}
Body: {body}
"""
    response = model.generate_content(prompt)
    return response.text.strip()


def summarize_thread(messages: list[ThreadMessage], max_sentences: int = 3) -> str:
    thread_text = ""
    for i, msg in enumerate(messages, start=1):
        thread_text += f"\n--- Message {i} from {msg.sender} ---\n"
        thread_text += f"Subject: {msg.subject}\n{msg.body}\n"

    prompt = f"""
The following is an email thread with multiple messages in chronological
order. Summarise the entire thread in {max_sentences} sentences or fewer.
Focus on: the main topic being discussed, any decisions made, and any
outstanding action items or deadlines. Return plain text only, no markdown.

{thread_text}
"""
    response = model.generate_content(prompt)
    return response.text.strip()


# --- Draft reply generation logic (R2, R5) ---

def generate_draft_reply(subject: str, body: str, tone: str = "professional") -> str:
    prompt = f"""
Write a {tone} reply to the following email. The reply should directly
address the content of the email. Return only the reply text, no
subject line, no markdown, no preamble.

Subject: {subject}
Body: {body}
"""
    response = model.generate_content(prompt)
    return response.text.strip()


# --- Priority classification logic (R1) ---

def classify_priority(subject: str, body: str) -> str:
    prompt = f"""
Classify the priority/urgency of the following email as exactly one of:
High, Medium, or Low.

Guidance:
- High: urgent issues, deadlines within a day or two, safety/compliance
  issues, stock shortages, system outages, anything requiring immediate
  action.
- Medium: normal business requests, meeting requests, routine follow-ups
  with a deadline further out.
- Low: FYI notifications, casual/personal messages, no action required.

Return ONLY the single word: High, Medium, or Low. No punctuation, no
explanation.

Subject: {subject}
Body: {body}
"""
    response = model.generate_content(prompt)
    result = response.text.strip()

    for level in ["High", "Medium", "Low"]:
        if level.lower() in result.lower():
            return level

    return "Medium"


# --- Task / calendar extraction logic (R6) ---

def extract_tasks(subject: str, body: str) -> dict:
    prompt = f"""
Extract structured information from the following email. Return ONLY a
valid JSON object (no markdown, no extra text) with these exact fields:

- "tasks": a list of action items or to-dos mentioned in the email.
  Each item should be a short string. Empty list if none.
- "deadlines": a list of any deadlines or due dates mentioned, as short
  strings (e.g. "Friday", "by end of week", "17 October"). Empty list
  if none.
- "meeting_times": a list of any meeting times or scheduled events
  mentioned, as short strings. Empty list if none.

Do not invent information that isn't in the email.

Subject: {subject}
Body: {body}
"""
    response = model.generate_content(prompt)
    text = response.text.strip()

    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()

    try:
        result = json.loads(text)
    except json.JSONDecodeError:
        result = {"tasks": [], "deadlines": [], "meeting_times": []}

    result.setdefault("tasks", [])
    result.setdefault("deadlines", [])
    result.setdefault("meeting_times", [])

    return result


# --- API endpoints ---

@app.get("/")
def health_check():
    return {"status": "MedMail Genie backend is running"}


@app.post("/summarize/email", response_model=SummaryResponse)
def summarize_single_email(email: EmailInput):
    """Summarise a single email. Used for inbox list previews."""
    try:
        summary = summarize_email(email.subject, email.body)
        return SummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/summarize/thread", response_model=SummaryResponse)
def summarize_email_thread(thread: ThreadInput):
    """Summarise a full email thread. Used when a user opens a conversation."""
    try:
        summary = summarize_thread(thread.messages)
        return SummaryResponse(summary=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/draft/generate", response_model=DraftResponse)
def generate_draft(draft_input: DraftInput):
    """Generate a draft reply to an email, in the requested tone."""
    try:
        draft = generate_draft_reply(
            draft_input.subject, draft_input.body, draft_input.tone
        )
        return DraftResponse(draft_reply=draft)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/classify/priority", response_model=PriorityResponse)
def classify_priority_endpoint(email: EmailInput):
    """Classify an email's priority as High, Medium, or Low."""
    try:
        priority = classify_priority(email.subject, email.body)
        return PriorityResponse(priority=priority)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/extract/tasks", response_model=TaskExtractionResponse)
def extract_tasks_endpoint(email: EmailInput):
    """Extract tasks, deadlines, and meeting times from an email."""
    try:
        result = extract_tasks(email.subject, email.body)
        return TaskExtractionResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# --- Placeholder sections for teammates to fill in ---
