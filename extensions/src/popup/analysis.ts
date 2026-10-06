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
  approveBtn,
} from "./dom";
import { showFeedback, resetApproval, hasCurrentEmail } from "./ui";
import { postJson } from "../api";
import type { TaskExtraction } from "../types";

async function loadCategory() {
  if (!categoryBadge) {
    return;
  }
  if (!hasCurrentEmail()) {
    categoryBadge.textContent = "Unknown";
    return;
  }
  categoryBadge.textContent = "Analysing...";
  try {
    const data = await postJson<{ category: string }>("/classify/category", {
      subject: state.currentEmailSubject,
      body: state.currentEmailBody,
    });
    categoryBadge.textContent = data.category || "Other";
  } catch (error) {
    console.error("Failed to classify category:", error);
    categoryBadge.textContent = "Unknown";
  }
}

async function loadSummary() {
  if (!summaryText) {
    return;
  }
  if (!hasCurrentEmail()) {
    summaryText.textContent = "Open an email to generate a summary.";
    return;
  }
  summaryText.textContent = "Generating AI summary...";
  try {
    const data = await postJson<{ summary: string }>("/summarize/email", {
      subject: state.currentEmailSubject,
      body: state.currentEmailBody,
    });
    summaryText.textContent = data.summary || "No summary was generated.";
  } catch (error) {
    console.error("Failed to load summary:", error);
    summaryText.textContent = "Could not generate the AI summary.";
  }
}

async function loadPriority() {
  if (!priorityBadge) {
    return;
  }
  if (!hasCurrentEmail()) {
    priorityBadge.textContent = "Unknown";
    return;
  }
  priorityBadge.textContent = "Analysing...";
  try {
    const data = await postJson<{ priority: string }>("/classify/priority", {
      subject: state.currentEmailSubject,
      body: state.currentEmailBody,
    });
    priorityBadge.textContent = data.priority || "Unknown";
    priorityBadge.classList.remove(
      "priority-high",
      "priority-medium",
      "priority-low",
    );
    const priority = String(data.priority || "").toLowerCase();
    if (priority === "high") {
      priorityBadge.classList.add("priority-high");
    } else if (priority === "medium") {
      priorityBadge.classList.add("priority-medium");
    } else if (priority === "low") {
      priorityBadge.classList.add("priority-low");
    }
  } catch (error) {
    console.error("Failed to load priority:", error);
    priorityBadge.textContent = "Unknown";
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
async function loadTasks() {
  if (!tasksList) {
    return;
  }
  if (calendarButtons) {
    calendarButtons.innerHTML = "";
  }
  if (!hasCurrentEmail()) {
    tasksList.textContent = "Open an email to extract tasks.";
    return;
  }
  tasksList.textContent = "Analysing tasks and deadlines...";
  try {
    const data = await postJson<TaskExtraction>("/extract/tasks", {
      subject: state.currentEmailSubject,
      body: state.currentEmailBody,
    });
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
  } catch (error) {
    console.error("Failed to load tasks:", error);
    tasksList.textContent = "Could not extract tasks or deadlines.";
    if (calendarButtons) {
      calendarButtons.innerHTML = "";
    }
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
  if (state.isGeneratingReply) {
    return;
  }
  state.isGeneratingReply = true;
  state.replyReady = false;
  if (approveBtn) approveBtn.disabled = true;
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
      subject: state.currentEmailSubject,
      body: state.currentEmailBody,
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
    if (approveBtn) approveBtn.disabled = !state.replyReady;
    if (regenerateBtn) {
      regenerateBtn.disabled = false;
      regenerateBtn.title = "Regenerate reply";
    }
  }
}

export async function analyseCurrentEmail() {
  await Promise.all([
    loadCategory(),
    loadSummary(),
    loadPriority(),
    loadTasks(),
    generateDraftReply(false),
  ]);
}
