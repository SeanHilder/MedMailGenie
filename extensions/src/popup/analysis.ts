import { state } from "./state";
import {
  summaryText,
  priorityBadge,
  categoryBadge,
  tasksList,
  calendarButtons,
  replyBox,
  toneSelect,
  regenerateBtn,
} from "./dom";
import {
  showFeedback,
  resetApproval,
  hasCurrentEmail,
  refreshReplyControls,
} from "./ui";
import { postJson } from "../api";
import type { EmailAnalysis, TaskExtraction } from "../types";

// Every analysis request carries the whole conversation so the backend can use
// earlier messages as context while focusing on the latest one.
function emailPayload() {
  return {
    subject: state.currentEmailSubject,
    body: state.currentEmailBody,
    messages: state.currentThreadMessages,
    user_email: state.currentAccountEmail,
  };
}

function showAnalysisLoading() {
  if (categoryBadge) categoryBadge.textContent = "Analysing...";
  if (priorityBadge) priorityBadge.textContent = "Analysing...";
  if (summaryText) summaryText.textContent = "Generating AI summary...";
  if (tasksList) tasksList.textContent = "Analysing tasks and deadlines...";
  if (calendarButtons) calendarButtons.innerHTML = "";
}

function showAnalysisMessage(message: {
  category: string;
  priority: string;
  summary: string;
  tasks: string;
}) {
  if (categoryBadge) categoryBadge.textContent = message.category;
  if (priorityBadge) priorityBadge.textContent = message.priority;
  if (summaryText) summaryText.textContent = message.summary;
  if (tasksList) tasksList.textContent = message.tasks;
  if (calendarButtons) calendarButtons.innerHTML = "";
}

function renderPriority(value: string) {
  if (!priorityBadge) {
    return;
  }
  priorityBadge.textContent = value || "Unknown";
  priorityBadge.classList.remove(
    "priority-high",
    "priority-medium",
    "priority-low",
  );
  const priority = String(value || "").toLowerCase();
  if (priority === "high") {
    priorityBadge.classList.add("priority-high");
  } else if (priority === "medium") {
    priorityBadge.classList.add("priority-medium");
  } else if (priority === "low") {
    priorityBadge.classList.add("priority-low");
  }
}

function buildGoogleCalendarLink(
  title: string,
  startIso: string,
  endIso: string,
): string {
  const formatForCalendar = (iso: string) =>
    iso.replace(/[-:]/g, "").split(".")[0];
  const start = formatForCalendar(startIso);
  const end = formatForCalendar(endIso);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${start}/${end}`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderTasks(data: TaskExtraction) {
  if (!tasksList) {
    return;
  }
  const tasks: string[] = Array.isArray(data.tasks) ? data.tasks : [];
  const deadlines: string[] = Array.isArray(data.deadlines)
    ? data.deadlines
    : [];
  const meetings: string[] = Array.isArray(data.meeting_times)
    ? data.meeting_times
    : [];
  const calendarEvents = Array.isArray(data.calendar_events)
    ? data.calendar_events
    : [];
  const allItems = [
    ...tasks.map((task: string) => `Task: ${task}`),
    ...deadlines.map((deadline: string) => `Deadline: ${deadline}`),
    ...meetings.map((meeting: string) => `Meeting: ${meeting}`),
  ];
  if (allItems.length === 0) {
    tasksList.textContent = "No tasks, deadlines, or meetings found.";
  } else {
    tasksList.innerHTML = "";
    allItems.forEach((item) => {
      const listItem = document.createElement("li");
      listItem.textContent = item;
      tasksList?.appendChild(listItem);
    });
  }
  if (calendarButtons && calendarEvents.length > 0) {
    calendarEvents.forEach(
      (event: { title?: string; start?: string; end?: string }) => {
        if (!event.title || !event.start || !event.end) {
          return;
        }
        const button = document.createElement("button");
        button.className = "utility-button";
        button.textContent = "Add to calendar";
        button.style.width = "100%";
        button.addEventListener("click", () => {
          const link = buildGoogleCalendarLink(
            event.title!,
            event.start!,
            event.end!,
          );
          chrome.tabs.create({
            url: link,
          });
        });
        calendarButtons?.appendChild(button);
      },
    );
  }
}

// Category, priority, summary and tasks come from ONE backend request, which
// keeps the popup within the Gemini free tier's requests-per-minute limit.
async function loadAnalysis() {
  if (!hasCurrentEmail()) {
    showAnalysisMessage({
      category: "Unknown",
      priority: "Unknown",
      summary: "Open an email to generate a summary.",
      tasks: "Open an email to extract tasks.",
    });
    return;
  }
  showAnalysisLoading();
  try {
    const data = await postJson<EmailAnalysis>(
      "/analyze/email",
      emailPayload(),
    );
    if (categoryBadge) categoryBadge.textContent = data.category || "Other";
    renderPriority(data.priority);
    if (summaryText) {
      summaryText.textContent = data.summary || "No summary was generated.";
    }
    renderTasks(data);
  } catch (error) {
    console.error("Failed to analyse email:", error);
    showAnalysisMessage({
      category: "Unknown",
      priority: "Unknown",
      summary: "Could not generate the AI summary.",
      tasks: "Could not extract tasks or deadlines.",
    });
  }
}

export async function generateDraftReply(showFeedbackMessages: boolean = true) {
  if (!replyBox) {
    return;
  }
  if (!hasCurrentEmail()) {
    replyBox.value = "Open an email before generating a reply.";
    return;
  }
  if (
    state.isGeneratingReply ||
    state.isInsertingReply ||
    state.voicePhase !== "idle"
  ) {
    return;
  }
  state.isGeneratingReply = true;
  state.replyReady = false;
  refreshReplyControls();
  const selectedTone = toneSelect?.value || "professional";
  resetApproval();
  if (showFeedbackMessages) {
    showFeedback(`Generating ${selectedTone} reply...`, "info");
  }
  if (regenerateBtn) {
    regenerateBtn.disabled = true;
    regenerateBtn.title = "Generating reply...";
  }
  replyBox.value = "Generating suggested reply...";
  try {
    const data = await postJson<{ draft_reply: string }>("/draft/generate", {
      ...emailPayload(),
      tone: selectedTone,
    });
    replyBox.value = data.draft_reply || "No suggested reply was generated.";
    state.replyReady = Boolean(data.draft_reply?.trim());
    if (showFeedbackMessages) {
      showFeedback(`${selectedTone} reply generated.`, "success");
    }
  } catch (error) {
    console.error("Failed to generate reply:", error);
    replyBox.value = "Could not generate a suggested reply.";
    if (showFeedbackMessages) {
      showFeedback(
        "Could not generate reply. Check that the backend is running.",
        "info",
      );
    }
  } finally {
    state.isGeneratingReply = false;
    refreshReplyControls();
    if (regenerateBtn) {
      regenerateBtn.disabled = false;
      regenerateBtn.title = "Regenerate reply";
    }
  }
}

export async function analyseCurrentEmail() {
  await Promise.all([loadAnalysis(), generateDraftReply(false)]);
}
