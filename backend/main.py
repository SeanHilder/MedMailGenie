"""
main.py

FastAPI backend for MedMail Genie.
Implements:
- R7: Summarisation endpoint
- R2, R5: Draft reply generation endpoint (with tone adjustment)

Other modules (classification, priority detection, task extraction)
should be added here by the respective team members using the same
pattern: define request/response schemas, implement the logic
function, then add an @app.post(...) endpoint.

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

# Allow the frontend (Chrome extension) to call this API during development.
# Restrict allow_origins to the actual extension origin before deployment.
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


# --- Placeholder sections for teammates to fill in ---
# Each teammate should follow the same pattern: define request/response
# schemas above, implement the logic function, then add an @app.post(...)
# endpoint here.

# TODO (Martin): Category classification endpoint (R1)
# TODO (Martin): Priority detection endpoint (R1)
# TODO (Martin): Task/calendar extraction endpoint (R6)