import { state } from "./state";
import { replyBox, voiceBtn, readBtn } from "./dom";
import { showFeedback, resetApproval, setVoiceButtonListening } from "./ui";
import { postJson } from "../api";

async function cleanVoiceTranscript(transcript: string): Promise<string> {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return "";
  }
  try {
    const data = await postJson<{ cleaned_text: string }>("/voice/cleanup", {
      transcript: trimmedTranscript,
    });
    const cleanedText = String(data.cleaned_text || "").trim();
    return cleanedText || trimmedTranscript;
  } catch (error) {
    console.error("Voice cleanup failed:", error);
    return trimmedTranscript;
  }
}

voiceBtn?.addEventListener("click", () => {
  chrome.tabs.query(
    {
      active: true,
      currentWindow: true,
    },
    (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) {
        showFeedback("Could not find the current tab.", "info");
        return;
      }
      if (state.isListening) {
        showFeedback("Stopping voice input...", "info");
        chrome.tabs.sendMessage(
          tab.id,
          {
            type: "STOP_SPEECH_RECOGNITION",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Could not stop speech recognition:",
                chrome.runtime.lastError.message,
              );
              setVoiceButtonListening(false);
              showFeedback("Could not stop voice input.", "info");
              return;
            }
            if (response?.success) {
              setVoiceButtonListening(false);
              showFeedback("Voice input stopped.", "success");
            } else {
              setVoiceButtonListening(false);
              showFeedback(
                response?.error || "Voice input is not currently running.",
                "info",
              );
            }
          },
        );
        return;
      }
      state.currentVoiceTranscript = "";
      chrome.tabs.sendMessage(
        tab.id,
        {
          type: "START_SPEECH_RECOGNITION",
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Could not communicate with content script:",
              chrome.runtime.lastError.message,
            );
            setVoiceButtonListening(false);
            showFeedback(
              "Could not start voice input. Reopen MedMail Genie and try again.",
              "info",
            );
            return;
          }
          if (response?.success) {
            setVoiceButtonListening(true);
            showFeedback("Listening... Speak your reply.", "info");
          } else {
            setVoiceButtonListening(false);
            showFeedback(
              response?.error || "Could not start voice input.",
              "info",
            );
          }
        },
      );
    },
  );
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "SPEECH_STARTED") {
    setVoiceButtonListening(true);
    return;
  }
  if (message.type === "SPEECH_RESULT") {
    const transcript = String(message.transcript || "").trim();
    if (!transcript) {
      return;
    }
    state.currentVoiceTranscript = state.currentVoiceTranscript
      ? `${state.currentVoiceTranscript} ${transcript}`
      : transcript;
    if (replyBox) {
      replyBox.value = state.currentVoiceTranscript;
      resetApproval();
    }
    return;
  }
  if (message.type === "SPEECH_ENDED") {
    setVoiceButtonListening(false);
    const transcriptToClean = state.currentVoiceTranscript.trim();
    if (!transcriptToClean) {
      showFeedback("Voice input finished. No speech was detected.", "info");
      return;
    }
    if (replyBox) {
      replyBox.value = transcriptToClean;
    }
    showFeedback(
      "Voice captured. Adding punctuation and formatting...",
      "info",
    );
    void (async () => {
      const cleanedText = await cleanVoiceTranscript(transcriptToClean);
      if (replyBox) {
        replyBox.value = cleanedText;
        resetApproval();
      }
      showFeedback("Voice reply formatted and ready to review.", "success");
    })();
    return;
  }
  if (message.type === "SPEECH_ERROR") {
    console.error("Speech recognition error:", message.error);
    setVoiceButtonListening(false);
    if (replyBox && state.currentVoiceTranscript.trim()) {
      replyBox.value = state.currentVoiceTranscript.trim();
    }
    showFeedback(`Speech error: ${message.error}`, "info");
    return;
  }
});

readBtn?.addEventListener("click", () => {
  if (!replyBox || !replyBox.value.trim()) {
    showFeedback("There is no reply to read aloud.", "info");
    return;
  }
  const speech = new SpeechSynthesisUtterance(replyBox.value);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(speech);
  showFeedback("Reading the suggested reply aloud.", "info");
});
