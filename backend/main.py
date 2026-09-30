"""
main.py

FastAPI backend for MedMail Genie.

Implements:
- R1: Email category classification
- R1: Priority classification
- R2: Draft reply generation
- R5: Tone adjustment
- R6: Task / calendar extraction
- R7: Email summarisation
- Voice transcript cleanup

Run:
    uvicorn main:app --reload

FastAPI documentation:
    http://127.0.0.1:8000/docs
"""

import os
import json
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

import google.generativeai as genai


# ==================================================
# Environment / Gemini Configuration
# ==================================================

load_dotenv()

GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not GOOGLE_API_KEY:
    print(
        "WARNING: GOOGLE_API_KEY was not found in the .env file."
    )

genai.configure(
    api_key=GOOGLE_API_KEY
)


MODEL_NAME = "gemini-3.5-flash-lite"

model = genai.GenerativeModel(
    MODEL_NAME
)



# ==================================================
# FastAPI Application
# ==================================================

app = FastAPI(
    title="MedMail Genie API"
)


app.add_middleware(
    CORSMiddleware,

    allow_origins=[
        "*"
    ],

    allow_methods=[
        "*"
    ],

    allow_headers=[
        "*"
    ],
)



# ==================================================
# Request / Response Schemas
# ==================================================


# --------------------------------------------------
# Email Input
# --------------------------------------------------

class EmailInput(BaseModel):

    subject: str

    body: str



# --------------------------------------------------
# Summary
# --------------------------------------------------

class SummaryResponse(BaseModel):

    summary: str



# --------------------------------------------------
# Email Thread
# --------------------------------------------------

class ThreadMessage(BaseModel):

    sender: str = "unknown"

    subject: str = ""

    body: str = ""



class ThreadInput(BaseModel):

    messages: list[ThreadMessage]



# --------------------------------------------------
# Draft Reply
# --------------------------------------------------

class DraftInput(BaseModel):

    subject: str

    body: str

    tone: str = "professional"



class DraftResponse(BaseModel):

    draft_reply: str



# --------------------------------------------------
# Priority
# --------------------------------------------------

class PriorityResponse(BaseModel):

    priority: str



# --------------------------------------------------
# Category
# --------------------------------------------------

class CategoryResponse(BaseModel):

    category: str



# --------------------------------------------------
# Tasks / Calendar
# --------------------------------------------------

class CalendarEvent(BaseModel):

    title: str

    start: str

    end: str


class TaskExtractionResponse(BaseModel):

    tasks: list[str]

    deadlines: list[str]

    meeting_times: list[str]

    calendar_events: list[CalendarEvent]



# --------------------------------------------------
# Voice Transcript Cleanup
# --------------------------------------------------

class VoiceCleanupInput(BaseModel):

    transcript: str



class VoiceCleanupResponse(BaseModel):

    cleaned_text: str



# ==================================================
# Summarisation Logic
# ==================================================

def summarize_email(
    subject: str,
    body: str,
    max_sentences: int = 2
) -> str:

    prompt = f"""
Summarise the following email in {max_sentences} sentences or fewer.

Focus on:
- the main point
- important information
- action items
- deadlines

Do not add information that is not present in the email.

Return plain text only.

Do not include markdown.

Do not include a preamble such as:
"Here is a summary".

Subject:
{subject}

Body:
{body}
"""


    response = model.generate_content(
        prompt
    )


    return response.text.strip()



# ==================================================
# Thread Summarisation
# ==================================================

def summarize_thread(
    messages: list[ThreadMessage],
    max_sentences: int = 3
) -> str:

    thread_text = ""


    for index, message in enumerate(
        messages,
        start=1
    ):

        thread_text += (
            f"\n--- Message {index} "
            f"from {message.sender} ---\n"
        )

        thread_text += (
            f"Subject: {message.subject}\n"
        )

        thread_text += (
            f"{message.body}\n"
        )


    prompt = f"""
The following is an email thread containing
multiple messages in chronological order.

Summarise the entire thread in
{max_sentences} sentences or fewer.

Focus on:
- the main topic
- decisions made
- outstanding actions
- deadlines

Do not invent information.

Return plain text only.

{thread_text}
"""


    response = model.generate_content(
        prompt
    )


    return response.text.strip()



# ==================================================
# Draft Reply Generation
# ==================================================

def generate_draft_reply(
    subject: str,
    body: str,
    tone: str = "professional"
) -> str:

    prompt = f"""
Write a {tone} reply to the following email.

The reply must:
- directly address the email
- be appropriate for a professional workplace
- respond only to information actually contained
  in the email
- avoid inventing facts, commitments, dates,
  names or actions that were not provided

Return only the reply.

Do not include:
- markdown
- explanations
- a subject line
- commentary about the reply

Subject:
{subject}

Body:
{body}
"""


    response = model.generate_content(
        prompt
    )


    return response.text.strip()



# ==================================================
# Priority Classification
# ==================================================

def classify_priority(
    subject: str,
    body: str
) -> str:

    prompt = f"""
Classify the priority of the following email.

Return exactly ONE of these values:

High
Medium
Low

Use these guidelines:

High:
- urgent issue
- deadline within a day or two
- safety or compliance issue
- serious stock shortage
- system outage
- issue requiring immediate action

Medium:
- normal business request
- meeting request
- routine follow-up
- task with a future deadline
- ordinary workplace action required

Low:
- informational email
- FYI notification
- casual communication
- newsletter
- no action required

Return ONLY:

High

or

Medium

or

Low

Subject:
{subject}

Body:
{body}
"""


    response = model.generate_content(
        prompt
    )


    result = response.text.strip()


    for level in [
        "High",
        "Medium",
        "Low"
    ]:

        if (
            level.lower()
            in result.lower()
        ):

            return level


    return "Medium"



# ==================================================
# Category Classification
# ==================================================

def classify_category(
    subject: str,
    body: str
) -> str:

    prompt = f"""
Classify the following email into ONE useful
business email category.

Choose the category that best describes the
main purpose of the email.

Possible categories include:

- Meeting Request
- Human Resources
- Stock / Inventory
- Distribution / Logistics
- Pharmacy Operations
- Compliance
- Finance
- IT / Technical Support
- Customer / Client Request
- Administration
- Education / Training
- Results / Assessment
- General Information
- Other

Important:

Do NOT classify an email as "Meeting Request"
just because it contains a date, time, appointment,
calendar reference, or meeting-related wording.

Only use "Meeting Request" when the primary purpose
of the email is actually to organise, request,
reschedule, confirm, or discuss a meeting.

Return ONLY the category name.

Do not provide an explanation.

Subject:
{subject}

Body:
{body}
"""


    print(
        "[CATEGORY DEBUG] Subject:",
        subject
    )


    response = model.generate_content(
        prompt
    )


    result = response.text.strip()


    print(
        "[CATEGORY DEBUG] Gemini returned:",
        result
    )


    if not result:

        return "Other"


    return result



# ==================================================
# Task / Calendar Extraction
# ==================================================
def extract_tasks(
    subject: str,
    body: str
) -> dict:

    today_str = datetime.now().strftime("%Y-%m-%d (%A)")

    prompt = f"""
Today's date is {today_str}.

Extract structured information from the following email.

Return ONLY a valid JSON object with these exact fields:

{{
    "tasks": [],
    "deadlines": [],
    "meeting_times": [],
    "calendar_events": []
}}

Rules:

"tasks":
- action items
- requests
- things the recipient needs to do
- short strings only

"deadlines":
- due dates
- deadlines
- phrases such as "by Friday"
- dates associated with required actions

"meeting_times":
- actual meetings
- appointments
- scheduled events
- include date/time information where available

"calendar_events":
- include meetings or events that have a clearly identifiable date and time
- resolve relative dates using today's date shown above
- each event must contain:
    - "title": a short descriptive title
    - "start": an ISO 8601 datetime such as "2026-10-06T10:00:00"
    - "end": an ISO 8601 datetime
- if no duration is given, assume the event lasts 1 hour
- only include an event when its real date can be confidently resolved
- if a time is mentioned but its date cannot be resolved, it may still
  appear in "meeting_times" but should not appear in "calendar_events"

Do not invent information.

If something is not present, return an empty list.

Subject:
{subject}

Body:
{body}
"""

    response = model.generate_content(
        prompt
    )

    text = response.text.strip()

    # Remove markdown code fences if Gemini returns them
    if text.startswith("```"):

        text = text.strip("`")

        if text.lower().startswith("json"):

            text = text[4:].strip()

    try:

        result = json.loads(
            text
        )

    except json.JSONDecodeError:

        print(
            "[TASK DEBUG] Could not parse:",
            text
        )

        result = {
            "tasks": [],
            "deadlines": [],
            "meeting_times": [],
            "calendar_events": []
        }

    result.setdefault(
        "tasks",
        []
    )

    result.setdefault(
        "deadlines",
        []
    )

    result.setdefault(
        "meeting_times",
        []
    )

    result.setdefault(
        "calendar_events",
        []
    )

    return result



# ==================================================
# Voice Transcript Cleanup
# ==================================================

def clean_voice_transcript(
    transcript: str
) -> str:

    """
    Cleans raw speech-to-text without changing
    the user's intended message.

    Gemini may add:
    - punctuation
    - capitalisation
    - paragraph breaks
    - obvious email formatting

    Gemini must NOT:
    - rewrite the meaning
    - invent information
    - add new commitments
    - answer the email itself
    """

    prompt = f"""
You are a text-cleanup component for a
voice-controlled email assistant.

Clean the following speech-to-text transcript
so that it is suitable to place inside an email.

You MAY:

- add punctuation
- add commas
- add full stops
- add question marks where clearly appropriate
- correct capitalisation
- add paragraph breaks
- format greetings naturally
- format sign-offs naturally
- fix obvious speech-recognition spacing issues

You MUST preserve the user's words, meaning,
intent, facts and commitments.

IMPORTANT:

Do NOT write a new reply.

Do NOT answer the email.

Do NOT add information.

Do NOT add facts.

Do NOT add dates.

Do NOT add promises or commitments.

Do NOT make the message longer unless formatting
requires it.

Do NOT change the tone or meaning.

If the transcript already contains good
punctuation and formatting, leave it essentially
unchanged.

Return ONLY the cleaned text.

No markdown.

No explanation.

Raw speech-to-text transcript:

{transcript}
"""


    response = model.generate_content(
        prompt
    )


    cleaned_text = (
        response.text.strip()
    )


    if not cleaned_text:

        return transcript.strip()


    return cleaned_text



# ==================================================
# API Endpoints
# ==================================================


# --------------------------------------------------
# Health Check
# --------------------------------------------------

@app.get("/")
def health_check():

    return {
        "status":
            "MedMail Genie backend is running"
    }



# --------------------------------------------------
# Summarise Email
# --------------------------------------------------

@app.post(
    "/summarize/email",
    response_model=SummaryResponse
)
def summarize_single_email(
    email: EmailInput
):

    try:

        summary = summarize_email(
            email.subject,
            email.body
        )


        return SummaryResponse(
            summary=summary
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Summarise Thread
# --------------------------------------------------

@app.post(
    "/summarize/thread",
    response_model=SummaryResponse
)
def summarize_email_thread(
    thread: ThreadInput
):

    try:

        summary = summarize_thread(
            thread.messages
        )


        return SummaryResponse(
            summary=summary
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Generate Draft
# --------------------------------------------------

@app.post(
    "/draft/generate",
    response_model=DraftResponse
)
def generate_draft(
    draft_input: DraftInput
):

    try:

        draft = generate_draft_reply(
            draft_input.subject,
            draft_input.body,
            draft_input.tone
        )


        return DraftResponse(
            draft_reply=draft
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Classify Priority
# --------------------------------------------------

@app.post(
    "/classify/priority",
    response_model=PriorityResponse
)
def classify_priority_endpoint(
    email: EmailInput
):

    try:

        priority = classify_priority(
            email.subject,
            email.body
        )


        return PriorityResponse(
            priority=priority
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Classify Category
# --------------------------------------------------

@app.post(
    "/classify/category",
    response_model=CategoryResponse
)
def classify_category_endpoint(
    email: EmailInput
):

    try:

        category = classify_category(
            email.subject,
            email.body
        )


        return CategoryResponse(
            category=category
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Extract Tasks
# --------------------------------------------------

@app.post(
    "/extract/tasks",
    response_model=TaskExtractionResponse
)
def extract_tasks_endpoint(
    email: EmailInput
):

    try:

        result = extract_tasks(
            email.subject,
            email.body
        )


        return TaskExtractionResponse(
            **result
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )



# --------------------------------------------------
# Clean Voice Transcript
# --------------------------------------------------

@app.post(
    "/voice/cleanup",
    response_model=VoiceCleanupResponse
)
def cleanup_voice_transcript(
    voice_input: VoiceCleanupInput
):

    try:

        transcript = (
            voice_input.transcript.strip()
        )


        if not transcript:

            return VoiceCleanupResponse(
                cleaned_text=""
            )


        print(
            "[VOICE DEBUG] Raw transcript:",
            transcript
        )


        cleaned_text = (
            clean_voice_transcript(
                transcript
            )
        )


        print(
            "[VOICE DEBUG] Cleaned transcript:",
            cleaned_text
        )


        return VoiceCleanupResponse(
            cleaned_text=cleaned_text
        )


    except Exception as error:

        raise HTTPException(
            status_code=500,
            detail=str(error)
        )