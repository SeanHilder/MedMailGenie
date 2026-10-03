import { state } from "./state";
import {
  summaryText,
  priorityBadge,
  categoryBadge,
  tasksList,
  replyBox,
  toneSelect,
  editBtn,
  approveBtn,
  regenerateBtn,
  copyBtn,
  clearBtn,
} from "./dom";
import { showFeedback, resetApproval, setVoiceButtonListening } from "./ui";
import { getCurrentEmailFromGmail } from "./gmail";
import { analyseCurrentEmail, generateDraftReply } from "./analysis";
import "./voice";

async function initialisePopup() {
  setVoiceButtonListening(false);
  if (categoryBadge) {
    categoryBadge.textContent = "Loading...";
  }
  if (summaryText) {
    summaryText.textContent = "Reading current email...";
  }
  if (tasksList) {
    tasksList.textContent = "Reading current email...";
  }
  if (priorityBadge) {
    priorityBadge.textContent = "Loading...";
  }
  if (replyBox) {
    replyBox.value = "Reading current email...";
  }
  const emailFound = await getCurrentEmailFromGmail();
  if (!emailFound) {
    if (categoryBadge) {
      categoryBadge.textContent = "Unknown";
    }
    if (summaryText) {
      summaryText.textContent = "Open a Gmail email and reopen MedMail Genie.";
    }
    if (tasksList) {
      tasksList.textContent = "No email detected.";
    }
    if (priorityBadge) {
      priorityBadge.textContent = "Unknown";
    }
    if (replyBox) {
      replyBox.value = "Open a Gmail email to generate a suggested reply.";
    }
    return;
  }
  await analyseCurrentEmail();
}

replyBox?.addEventListener("input", () => {
  if (state.replyApproved) {
    resetApproval();
    showFeedback(
      "Reply changed. Please approve the updated reply again.",
      "info",
    );
  }
});

editBtn?.addEventListener("click", () => {
  replyBox?.focus();
  if (state.replyApproved) {
    resetApproval();
  }
  showFeedback("You can now edit the suggested reply.", "info");
});

approveBtn?.addEventListener("click", () => {
  if (!replyBox || !replyBox.value.trim()) {
    showFeedback("The reply is empty. Add some text before approving.", "info");
    return;
  }
  state.replyApproved = true;
  showFeedback(
    "Reply approved. Copy it into Gmail when you are ready to send.",
    "success",
  );
});

regenerateBtn?.addEventListener("click", async () => {
  resetApproval();
  await generateDraftReply(true);
});

toneSelect?.addEventListener("change", async () => {
  resetApproval();
  const selectedTone = toneSelect?.value || "professional";
  showFeedback(`Changing reply tone to ${selectedTone}...`, "info");
  await generateDraftReply(false);
  showFeedback(`Reply changed to ${selectedTone} tone.`, "success");
});

copyBtn?.addEventListener("click", async () => {
  if (!replyBox || !replyBox.value.trim()) {
    showFeedback("There is no reply to copy.", "info");
    return;
  }
  try {
    await navigator.clipboard.writeText(replyBox.value);
    showFeedback("Reply copied to clipboard.", "success");
  } catch (error) {
    console.error("Unable to copy reply:", error);
    showFeedback("Could not copy the reply.", "info");
  }
});

clearBtn?.addEventListener("click", () => {
  resetApproval();
  state.currentVoiceTranscript = "";
  if (replyBox) {
    replyBox.value = "";
    replyBox.focus();
  }
  showFeedback("Suggested reply cleared.", "info");
});

initialisePopup();
