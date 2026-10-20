import {
  feedbackMessage,
  voiceBtn,
  readBtn,
  replyBox,
  approveBtn,
  regenerateBtn,
  toneSelect,
  clearBtn,
} from "./dom";
import { state } from "./state";

let feedbackTimer: number | undefined;

export function showFeedback(
  message: string,
  type: "success" | "info" = "info",
  persistent = false,
) {
  if (!feedbackMessage) {
    return;
  }
  feedbackMessage.textContent = message;
  feedbackMessage.className = "feedback";
  feedbackMessage.classList.add("show", type);
  window.clearTimeout(feedbackTimer);
  if (!persistent) {
    feedbackTimer = window.setTimeout(() => {
      feedbackMessage?.classList.remove("show");
    }, 2500);
  }
}

export function resetApproval() {
  state.replyApproved = false;
}

export function refreshReplyControls() {
  const phase = state.voicePhase;
  const recording =
    phase === "starting" || phase === "listening" || phase === "stopping";
  const busy = state.isGeneratingReply || state.isInsertingReply;
  if (approveBtn)
    approveBtn.disabled = !state.replyReady || busy || phase !== "idle";
  if (regenerateBtn) regenerateBtn.disabled = busy || phase !== "idle";
  if (toneSelect) toneSelect.disabled = busy || phase !== "idle";
  if (clearBtn) clearBtn.disabled = busy;
  if (replyBox) replyBox.readOnly = busy || recording;
  if (readBtn) readBtn.disabled = busy || phase !== "idle";
  if (voiceBtn) {
    voiceBtn.disabled = busy || phase === "stopping" || phase === "formatting";
    voiceBtn.textContent =
      phase === "starting"
        ? "Cancel Voice"
        : phase === "listening"
          ? "Stop Listening"
          : phase === "stopping"
            ? "Stopping..."
            : "Voice";
    voiceBtn.classList.toggle("listening", recording);
    voiceBtn.setAttribute("aria-pressed", String(recording));
  }
}

export function setVoicePhase(phase: typeof state.voicePhase) {
  state.voicePhase = phase;
  refreshReplyControls();
}

export function hasCurrentEmail(): boolean {
  return Boolean(
    state.currentEmailSubject.trim() || state.currentEmailBody.trim(),
  );
}
