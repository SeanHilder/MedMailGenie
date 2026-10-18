
import { state } from "./state";
import { replyBox, voiceBtn, readBtn } from "./dom";
import { showFeedback, resetApproval, setVoiceButtonListening } from "./ui";
import { postJson } from "../api";

// MARK: - Voice Transcript Cleanup

// Sends the recorded speech transcript to the backend
// to add punctuation and improve its formatting.
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

// MARK: - Speech-to-Text

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

      // Stop speech recognition if it is currently running.
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

      // Clear the previous transcript before starting a new recording.
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

// MARK: - Speech Recognition Events

chrome.runtime.onMessage.addListener((message) => {
  // Update the Voice button when recording starts.
  if (message.type === "SPEECH_STARTED") {
    setVoiceButtonListening(true);
    return;
  }

  // Receive and display speech-to-text results.
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

  // Clean up the transcript when recording finishes.
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

  // Handle speech recognition errors.
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

// Starts or stops reading the suggested reply aloud.
readBtn?.addEventListener("click", () => {
  // If speech is already active, stop it when clicked again.
  if (activeSpeech) {
    const speechToStop = activeSpeech;
    activeSpeech = null;

    window.speechSynthesis.cancel();
    setReadAloudButtonReading(false);

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
  activeSpeech = null;
  window.speechSynthesis.cancel();
});
