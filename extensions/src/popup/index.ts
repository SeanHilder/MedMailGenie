import { state } from "./state";
import {
  summaryText,
  priorityBadge,
  categoryBadge,
  tasksList,
  replyBox,
  toneSelect,
  approveBtn,
  regenerateBtn,
  copyBtn,
  clearBtn,
} from "./dom";
import { showFeedback, resetApproval, refreshReplyControls } from "./ui";
import { getCurrentEmailFromGmail, insertReplyIntoGmail } from "./gmail";
import { analyseCurrentEmail, generateDraftReply } from "./analysis";
import { cancelVoiceInput } from "./voice";

async function initialisePopup() {
  refreshReplyControls();
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
  if (state.voicePhase === "formatting") {
    cancelVoiceInput();
    showFeedback("Voice reply edited. Review it before approving.", "info");
  }
  state.replyReady =
    Boolean(state.gmailContextId && replyBox?.value.trim()) &&
    !state.isGeneratingReply;
  refreshReplyControls();
  if (state.replyApproved) {
    resetApproval();
    showFeedback(
      "Reply changed. Please approve the updated reply again.",
      "info",
    );
  }
});

approveBtn?.addEventListener("click", async () => {
  if (!approveBtn) return;
  if (state.isInsertingReply || state.isGeneratingReply || !state.replyReady)
    return;
  if (state.voicePhase !== "idle") {
    showFeedback(
      "Finish voice input and review the reply before approving.",
      "info",
    );
    return;
  }
  if (!replyBox || !replyBox.value.trim()) {
    showFeedback("The reply is empty. Add some text before approving.", "info");
    return;
  }
  const text = replyBox.value;
  state.isInsertingReply = true;
  resetApproval();
  refreshReplyControls();
  approveBtn.textContent = "Inserting...";
  showFeedback("Opening Gmail's reply editor...", "info");
  try {
    await insertReplyIntoGmail(text);
    state.replyApproved = replyBox.value === text;
    showFeedback(
      "Reply inserted into Gmail. Review it there, then click Send when ready.",
      "success",
      true,
    );
  } catch (error) {
    showFeedback(
      error instanceof Error
        ? error.message
        : "Could not insert the reply. Use Copy Reply instead.",
      "info",
      true,
    );
  } finally {
    state.isInsertingReply = false;
    refreshReplyControls();
    approveBtn.textContent = "Approve";
  }
});

regenerateBtn?.addEventListener("click", async () => {
  if (state.voicePhase !== "idle") return;
  resetApproval();
  await generateDraftReply(true);
});

toneSelect?.addEventListener("change", async () => {
  if (state.voicePhase !== "idle") return;
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
  if (state.isInsertingReply || state.isGeneratingReply) return;
  cancelVoiceInput();
  resetApproval();
  state.replyReady = false;
  if (approveBtn) approveBtn.disabled = true;
  if (replyBox) {
    replyBox.value = "";
    replyBox.focus();
  }
  showFeedback("Suggested reply cleared.", "info");
});

initialisePopup();
