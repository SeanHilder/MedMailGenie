import { feedbackMessage, voiceBtn } from "./dom";
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

export function setVoiceButtonListening(listening: boolean) {
  state.isListening = listening;
  if (!voiceBtn) {
    return;
  }
  if (listening) {
    voiceBtn.textContent = "Stop Listening";
    voiceBtn.classList.add("listening");
  } else {
    voiceBtn.textContent = "Voice";
    voiceBtn.classList.remove("listening");
  }
}

export function hasCurrentEmail(): boolean {
  return Boolean(
    state.currentEmailSubject.trim() || state.currentEmailBody.trim(),
  );
}
