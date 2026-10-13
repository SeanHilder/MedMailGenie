"""Email prompts and response parsing, independent of HTTP routing."""

import json
from collections.abc import Sequence
from datetime import datetime

from .gemini import generate_text
from .schemas import ThreadMessage

# Keep long conversations within a sensible prompt size; the oldest messages go first.
MAX_THREAD_CHARS = 30_000


def _is_from_user(message: ThreadMessage, user_email: str) -> bool:
    """True when the signed-in user wrote this message."""
    return bool(user_email) and user_email.lower() in message.sender.lower()


def _latest_is_from_user(messages: Sequence[ThreadMessage], user_email: str) -> bool:
    return bool(messages) and _is_from_user(messages[-1], user_email)


def _thread_text(messages: Sequence[ThreadMessage], user_email: str = "") -> str:
    """Number the messages oldest first and mark the latest one."""
    total = len(messages)
    blocks: list[str] = []
    used = 0

    # Walk back from the newest message so the latest context is always kept.
    for index in range(total, 0, -1):
        message = messages[index - 1]
        header = f"--- Message {index} of {total}"
        header += " (LATEST) ---" if index == total else " ---"
        sender = message.sender
        if _is_from_user(message, user_email):
            sender += " (written by the user)"
        lines = [header, f"From: {sender}"]
        if message.date:
            lines.append(f"Date: {message.date}")
        if message.subject:
            lines.append(f"Subject: {message.subject}")
        block = "\n".join(lines) + f"\n\n{message.body.strip()}\n"

        if blocks and used + len(block) > MAX_THREAD_CHARS:
            blocks.append(
                f"(Messages 1 to {index} are older and were left out to keep "
                "this prompt short.)\n"
            )
            break
        blocks.append(block[:MAX_THREAD_CHARS])
        used += len(block)

    intro = (
        f"This is an email conversation with {total} messages, oldest first. "
        f"Message {total} is the LATEST message."
    )
    if user_email:
        intro += (
            f"\nThe user of this assistant is {user_email}. Messages from that "
            "address were written by the user; all others were sent to them."
        )
    if _latest_is_from_user(messages, user_email):
        intro += (
            "\nThe LATEST message was written by the user, so the user is now "
            "waiting for the other people to respond."
        )

    return intro + "\n\n" + "\n".join(reversed(blocks))


def _is_thread(messages: Sequence[ThreadMessage]) -> bool:
    return len(messages) > 1


def _email_text(
    subject: str,
    body: str,
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> str:
    """The email section of a prompt: one email, or the whole conversation."""
    if not _is_thread(messages):
        email = f"Subject:\n{subject}\n\nBody:\n{body}"
        if _latest_is_from_user(messages, user_email):
            # For example, an email opened from the user's Sent folder.
            email = f"This email was written and sent by the user.\n\n{email}"
        return email

    return f"Subject:\n{subject}\n\n{_thread_text(messages, user_email)}"


def _thread_rules(messages: Sequence[ThreadMessage], rules: str) -> str:
    """Extra instructions that only apply when a whole conversation is sent."""
    return f"{rules.strip()}\n" if _is_thread(messages) else ""


def _sent_by_user_rules(
    messages: Sequence[ThreadMessage], user_email: str, rules: str
) -> str:
    """Extra instructions for when the user wrote the latest message."""
    return f"{rules.strip()}\n" if _latest_is_from_user(messages, user_email) else ""


def summarize_email(
    subject: str,
    body: str,
    max_sentences: int = 2,
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> str:
    if _is_thread(messages):
        return summarize_thread(messages, subject=subject, user_email=user_email)

    sent_rules = _sent_by_user_rules(
        messages,
        user_email,
        """
The user wrote this email. Summarise what the user sent or asked for, not
what the user needs to do in response to it.
""",
    )
    prompt = f"""
Summarise the following email in {max_sentences} sentences or fewer.
{sent_rules}
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

{_email_text(subject, body, messages, user_email)}
"""

    return generate_text(prompt)


def summarize_thread(
    messages: Sequence[ThreadMessage],
    max_sentences: int = 3,
    subject: str = "",
    user_email: str = "",
) -> str:
    thread_text = _thread_text(messages, user_email)
    if subject:
        thread_text = f"Subject:\n{subject}\n\n{thread_text}"
    sent_rules = _sent_by_user_rules(
        messages,
        user_email,
        """
The user wrote the LATEST message. Make clear what the user last sent and
what the user is now waiting for from the other people.
""",
    )

    prompt = f"""
The following is an email thread containing
multiple messages in chronological order.

Summarise the entire thread in
{max_sentences} sentences or fewer.
{sent_rules}
Focus on:
- the main topic
- decisions made
- where things stand after the LATEST message
- outstanding actions and who needs to take them
- deadlines

Do not invent information.

Return plain text only.

Do not include markdown.

{thread_text}
"""

    return generate_text(prompt)


def generate_draft_reply(
    subject: str,
    body: str,
    tone: str = "professional",
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> str:
    thread_rules = _thread_rules(
        messages,
        """
This is a conversation. Reply to the LATEST message and use the earlier
messages only as context:
- do not repeat answers, questions or information already given earlier
""",
    )
    sent_rules = _sent_by_user_rules(
        messages,
        user_email,
        """
The user wrote the LATEST message, so do not answer it as if it had been
sent to the user. Instead write a short follow-up from the user to the
other people, politely checking on what the user is waiting for.
""",
    )
    prompt = f"""
Write a {tone} reply to the following email.
{thread_rules}{sent_rules}
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

{_email_text(subject, body, messages, user_email)}
"""

    return generate_text(prompt)


def classify_priority(
    subject: str,
    body: str,
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> str:
    thread_rules = _thread_rules(
        messages,
        """
This is a conversation. Judge the priority as of the LATEST message: what
still needs attention now. Do not raise the priority for issues that later
messages show are already resolved.
""",
    )
    sent_rules = _sent_by_user_rules(
        messages,
        user_email,
        """
The user wrote the LATEST message and is waiting for others to respond.
Judge the priority by what the USER still has to do. If the user has no
outstanding action or close deadline of their own, choose Low.
""",
    )
    prompt = f"""
Classify the priority of the following email.
{thread_rules}{sent_rules}
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

{_email_text(subject, body, messages, user_email)}
"""

    result = generate_text(prompt)

    for level in ["High", "Medium", "Low"]:
        if level.lower() in result.lower():
            return level

    return "Medium"


def classify_category(
    subject: str,
    body: str,
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> str:
    thread_rules = _thread_rules(
        messages,
        """
This is a conversation. Classify the conversation as a whole by its primary
purpose, not by a single message.
""",
    )
    prompt = f"""
Classify the following email into exactly ONE business email category.
{thread_rules}
Choose the category that best describes the email's PRIMARY PURPOSE.

The primary purpose is the main reason the email was sent and the main
action, request, or information the recipient is expected to respond to
or act on.

Do NOT choose a category simply because a keyword, date, person, meeting,
result, or other topic is mentioned in the email.

Possible categories and their guidelines:

1. Meeting Request
Use when the primary purpose is to organise, request, reschedule,
confirm, or discuss a meeting or appointment.

Do NOT use this category when a meeting, date, or appointment is only
mentioned as secondary information.

2. Human Resources
Use for emails primarily about employees, staffing, recruitment,
leave, payroll-related employee matters, performance, or workplace
employee issues.

Do NOT use this category when the email is primarily about general
business administration or finance.

3. Stock / Inventory
Use for emails primarily about stock levels, stock availability,
ordering, receiving, shortages, inventory management, or product
supplies.

Do NOT use this category when the primary purpose is transporting or
distributing stock.

4. Distribution / Logistics
Use for emails primarily about deliveries, shipping, transport,
warehousing, distribution, dispatch, or the movement of products.

Do NOT use this category when the primary purpose is managing stock
levels or inventory.

5. Pharmacy Operations
Use for emails primarily about the day-to-day operation of a pharmacy,
including pharmacy workflows, dispensing processes, pharmacy services,
or operational issues specific to pharmacy practice.

Do NOT use this category simply because an email mentions a medicine
or pharmacy.

6. Compliance
Use for emails primarily about regulations, policies, legal or
regulatory requirements, audits, accreditation, safety requirements,
or compliance obligations.

Do NOT use this category when compliance is only mentioned as a
secondary consideration.

7. Finance
Use for emails primarily about invoices, payments, billing, budgets,
expenses, financial transactions, or other financial matters.

Do NOT use this category when the email is primarily about ordering,
stock, or administration and only mentions a financial amount.

8. IT / Technical Support
Use for emails primarily about software, hardware, systems, accounts,
technical problems, access issues, or technical support.

Do NOT use this category when technology is only mentioned as part of
another business process.

9. Customer / Client Request
Use when the primary purpose is responding to, handling, or requesting
something from a customer, patient, client, or external recipient.

Do NOT use this category when a more specific operational category
clearly describes the primary purpose of the email.

10. Administration
Use for general business or operational administration that does not
fit a more specific category, such as documentation, records,
procedures, forms, or routine administrative coordination.

Do NOT use this category when another category more specifically
describes the primary purpose.

11. Education / Training
Use for emails primarily about training, courses, workshops,
educational sessions, learning materials, or staff education.

Do NOT use this category simply because an email contains instructions
or information that someone needs to read.

12. Results / Assessment
Use for emails primarily about test results, assessment results,
reports, evaluations, or reviewing or communicating results.

Do NOT use this category when a result is only mentioned as supporting
information for another primary request.

13. General Information
Use when the primary purpose is to provide or request general
information and no more specific category applies.

Do NOT use this category when the email clearly belongs to one of the
more specific categories above.

14. Other
Use only when the email does not reasonably fit any of the categories
above.

Use "Other" as a last resort.

Important classification rules:

- Return exactly ONE category.
- Always classify based on the email's primary purpose.
- Consider the entire email, including both the subject and body.
- Do not classify based on keywords alone.
- If multiple categories appear relevant, choose the category that best
  represents the main action or purpose of the email.
- Prefer a specific category over General Information or Other when
  there is enough information to do so.
- Do not invent information that is not present in the email.

Examples of overlapping categories:

Example 1:
"Can we reschedule tomorrow's meeting to 3pm? We will discuss the
patient's test results."
Category: Meeting Request

Example 2:
"Please review the patient's test results before our appointment
tomorrow."
Category: Results / Assessment

Example 3:
"We are running low on vaccine stock. Please arrange another order."
Category: Stock / Inventory

Example 4:
"The order has been dispatched and will arrive tomorrow."
Category: Distribution / Logistics

Example 5:
"Please complete the mandatory compliance training before the audit."
Category: Compliance

Return ONLY the category name.

Do not provide an explanation.
Do not return multiple categories.
Do not return markdown.

{_email_text(subject, body, messages, user_email)}
"""

    result = generate_text(prompt)

    if not result:
        return "Other"

    return result


def extract_tasks(
    subject: str,
    body: str,
    messages: Sequence[ThreadMessage] = (),
    user_email: str = "",
) -> dict:
    today_str = datetime.now().strftime("%Y-%m-%d (%A)")
    thread_rules = _thread_rules(
        messages,
        """
This is a conversation. Only include items that are still current as of the
LATEST message:
- leave out tasks that later messages show were done, cancelled or replaced
- when a meeting was rescheduled, use only the most recently agreed time
""",
    )
    sent_rules = _sent_by_user_rules(
        messages,
        user_email,
        """
The user wrote the LATEST message. "tasks" are only things the USER still
needs to do. Requests or promises the user made to other people are not
tasks for the user, so leave them out.
""",
    )

    prompt = f"""
Today's date is {today_str}.

Extract structured information from the following email.
{thread_rules}{sent_rules}
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

{_email_text(subject, body, messages, user_email)}
"""

    text = generate_text(prompt)

    # Remove markdown code fences if Gemini returns them
    if text.startswith("```"):
        text = text.strip("`")

        if text.lower().startswith("json"):
            text = text[4:].strip()

    try:
        result = json.loads(text)

    except json.JSONDecodeError:
        result = {
            "tasks": [],
            "deadlines": [],
            "meeting_times": [],
            "calendar_events": [],
        }

    result.setdefault("tasks", [])

    result.setdefault("deadlines", [])

    result.setdefault("meeting_times", [])

    result.setdefault("calendar_events", [])

    return result


def clean_voice_transcript(transcript: str) -> str:
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

    cleaned_text = generate_text(prompt)

    if not cleaned_text:
        return transcript.strip()

    return cleaned_text