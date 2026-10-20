import { state } from "./state";
import { replyBox, voiceBtn, readBtn } from "./dom";
import {
  showFeedback,
  resetApproval,
  setVoicePhase,
  refreshReplyControls,
} from "./ui";
import { postJson } from "../api";

interface VoiceSession {
  port: chrome.runtime.Port | null;
  transcript: string;
  originalReply: string;
  originalReady: boolean;
  cleanup?: AbortController;
}

let activeVoice: VoiceSession | null = null;

function updateTranscript(session: VoiceSession, transcript: string) {
  session.transcript = transcript.trim();
  if (!replyBox) return;
  replyBox.value = session.transcript || session.originalReply;
  state.replyReady = session.transcript
    ? Boolean(state.gmailContextId)
    : session.originalReady;
  if (session.transcript) resetApproval();
  refreshReplyControls();
}

function disconnectVoice(session: VoiceSession) {
  const port = session.port;
  session.port = null;
  port?.disconnect();
}

export function cancelVoiceInput() {
  const session = activeVoice;
  activeVoice = null;
  if (session) {
    session.cleanup?.abort();
    disconnectVoice(session);
  }
  setVoicePhase("idle");
}

const speechErrors: Record<string, string> = {
  "not-allowed":
    "Microphone access was blocked. Allow microphone access for Gmail, then try Voice again.",
  "service-not-allowed":
    "Chrome blocked speech recognition. Check microphone permissions and try again.",
  "audio-capture":
    "No microphone is available. Check your microphone and try again.",
  network:
    "Speech recognition lost its connection. Check your connection and try again.",
  "no-speech":
    "No speech was detected. Try again and speak after the button says Stop Listening.",
  unsupported:
    "Voice input is not supported in this browser. Try Google Chrome.",
  "already-running":
    "Another voice session is running. Close the other popup and try again.",
  "start-timeout":
    "Voice input did not start. Check microphone permission and try again.",
  disconnected:
    "Voice input disconnected. Refresh Gmail and reopen MedMailGenie, then try again.",
};

async function finishVoice(session: VoiceSession, error?: string) {
  if (activeVoice !== session || state.voicePhase === "formatting") return;
  disconnectVoice(session);
  if (error || !session.transcript) {
    activeVoice = null;
    setVoicePhase("idle");
    showFeedback(
      error
        ? speechErrors[error] || "Voice input stopped unexpectedly. Try again."
        : "Voice input finished. No speech was detected.",
      "info",
      true,
    );
    return;
  }

  setVoicePhase("formatting");
  showFeedback("Microphone stopped. Formatting your reply...", "info", true);
  const controller = new AbortController();
  session.cleanup = controller;
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  let cleanedText = session.transcript;
  let formatted = false;
  try {
    const data = await postJson<{ cleaned_text: string }>(
      "/voice/cleanup",
      {
        transcript: session.transcript,
      },
      controller.signal,
    );
    const cleaned = String(data.cleaned_text || "").trim();
    if (cleaned) {
      cleanedText = cleaned;
      formatted = true;
    }
  } catch {
    // Keep the captured words if formatting fails or times out.
  } finally {
    window.clearTimeout(timeout);
  }
  // Editing, clearing or closing the popup invalidates the pending cleanup.
  if (activeVoice !== session) return;
  if (replyBox?.value === session.transcript)
    updateTranscript(session, cleanedText);
  activeVoice = null;
  setVoicePhase("idle");
  showFeedback(
    formatted
      ? "Voice reply formatted and ready to review."
      : "Voice captured. Formatting was unavailable, so review the captured text.",
    formatted ? "success" : "info",
    true,
  );
}

voiceBtn?.addEventListener("click", () => {
  if (state.voicePhase === "stopping" || state.voicePhase === "formatting")
    return;
  if (activeVoice?.port) {
    const session = activeVoice;
    setVoicePhase("stopping");
    showFeedback("Stopping microphone...", "info", true);
    try {
      session.port!.postMessage({ type: "STOP_SPEECH_RECOGNITION" });
    } catch {
      void finishVoice(session, "disconnected");
    }
    return;
  }
  if (state.isGeneratingReply || state.isInsertingReply) return;
  if (state.gmailTabId === null || !state.gmailContextId) {
    showFeedback("Open a Gmail email before using Voice.", "info");
    return;
  }

  stopReading();
  const session: VoiceSession = {
    port: null,
    transcript: "",
    originalReply: replyBox?.value || "",
    originalReady: state.replyReady,
  };
  activeVoice = session;
  setVoicePhase("starting");
  showFeedback(
    "Starting microphone. Allow access if Chrome asks.",
    "info",
    true,
  );
  try {
    // A dedicated connection isolates this recording from other tabs/popups and
    // lets the content script release the microphone when the popup closes.
    const port = chrome.tabs.connect(state.gmailTabId, {
      name: "medmailgenie-voice",
      frameId: 0,
    });
    session.port = port;
    port.onDisconnect.addListener(() => {
      void chrome.runtime.lastError;
      if (activeVoice !== session || session.port !== port) return;
      session.port = null;
      void finishVoice(session, "disconnected");
    });
    port.onMessage.addListener((message) => {
      if (activeVoice !== session || session.port !== port) return;
      if (message.type === "SPEECH_STARTED") {
        // A delayed start cannot undo a user's Stop request.
        if (state.voicePhase === "starting") {
          setVoicePhase("listening");
          showFeedback("Listening... Speak your reply.", "info", true);
        }
      } else if (message.type === "SPEECH_RESULT") {
        updateTranscript(session, String(message.transcript || ""));
      } else if (
        message.type === "SPEECH_ENDED" ||
        message.type === "SPEECH_ERROR"
      ) {
        updateTranscript(session, String(message.transcript || ""));
        void finishVoice(
          session,
          message.type === "SPEECH_ERROR" ? String(message.error) : undefined,
        );
      }
    });
    port.postMessage({ type: "START_SPEECH_RECOGNITION" });
  } catch {
    void finishVoice(session, "disconnected");
  }
});

// MARK: - Text-to-Speech

// Tracks the speech currently being read aloud.
let activeSpeech: SpeechSynthesisUtterance | null = null;

// Updates the Read Aloud button's appearance and label.
function setReadAloudButtonReading(isReading: boolean): void {
  if (!readBtn) {
    return;
  }

  readBtn.textContent = isReading ? "Stop Reading" : "Read Aloud";
  readBtn.setAttribute("aria-pressed", String(isReading));
}

function stopReading() {
  activeSpeech = null;
  window.speechSynthesis.cancel();
  setReadAloudButtonReading(false);
}

// Starts or stops reading the suggested reply aloud.
readBtn?.addEventListener("click", () => {
  if (state.voicePhase !== "idle") return;
  // If speech is already active, stop it when clicked again.
  if (activeSpeech) {
    stopReading();
    showFeedback("Reading aloud stopped.", "info");
    return;
  }

  // Check that there is a reply available to read.
  if (!replyBox || !replyBox.value.trim()) {
    showFeedback("There is no reply to read aloud.", "info");
    return;
  }

  // Create a speech utterance using the current reply text.
  const speech = new SpeechSynthesisUtterance(replyBox.value);

  // Use Australian English where available.
  speech.lang = "en-AU";

  // Track the current speech so it can be stopped.
  activeSpeech = speech;

  // Update the button immediately while speech starts.
  setReadAloudButtonReading(true);

  // Confirm when speech actually begins.
  speech.onstart = () => {
    if (activeSpeech !== speech) {
      return;
    }

    showFeedback("Reading aloud...", "info");
  };

  // Restore the button after speech finishes naturally.
  speech.onend = () => {
    if (activeSpeech !== speech) {
      return;
    }

    activeSpeech = null;
    setReadAloudButtonReading(false);

    showFeedback("Finished reading aloud.", "success");
  };

  // Restore the button if speech synthesis fails.
  speech.onerror = (event) => {
    if (activeSpeech !== speech) {
      return;
    }

    activeSpeech = null;
    setReadAloudButtonReading(false);

    console.error("Text-to-speech error:", event.error);
    showFeedback("Could not read the reply aloud.", "info");
  };

  // Stop any previous queued speech before starting this reply.
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
});

// Stop any active speech when the extension popup closes.
window.addEventListener("pagehide", () => {
  cancelVoiceInput();
  stopReading();
});
