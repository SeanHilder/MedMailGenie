// Chrome's speech API is not included in TypeScript's standard DOM types.
interface SpeechResult {
  isFinal: boolean;
  [index: number]: { transcript: string };
}

interface SpeechRecognitionSession {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<SpeechResult>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechConstructor = new () => SpeechRecognitionSession;
const speechWindow = window as Window & {
  SpeechRecognition?: SpeechConstructor;
  webkitSpeechRecognition?: SpeechConstructor;
};

export function createSpeechMessageHandler() {
  let activeRecognition: SpeechRecognitionSession | null = null;
  let isSpeechRecognitionActive = false;
  return function handleSpeechMessage(
    message: { type: string },
    sendResponse: (response: { success: boolean; error?: string }) => void,
  ) {
    if (message.type === "START_SPEECH_RECOGNITION") {
      if (isSpeechRecognitionActive) {
        sendResponse({
          success: false,
          error: "Speech recognition is already running.",
        });
        return;
      }
      const SpeechRecognition =
        speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        sendResponse({
          success: false,
          error: "Speech recognition is not supported.",
        });
        return;
      }
      const recognition = new SpeechRecognition();
      activeRecognition = recognition;
      recognition.lang = "en-AU";
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.onstart = () => {
        isSpeechRecognitionActive = true;
        chrome.runtime.sendMessage({
          type: "SPEECH_STARTED",
        });
      };
      recognition.onresult = (event) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result?.isFinal && result[0]) {
            transcript += result[0].transcript + " ";
          }
        }
        transcript = transcript.trim();
        if (!transcript) {
          return;
        }
        chrome.runtime.sendMessage({
          type: "SPEECH_RESULT",
          transcript: transcript,
        });
      };
      recognition.onerror = (event) => {
        isSpeechRecognitionActive = false;
        activeRecognition = null;
        chrome.runtime.sendMessage({
          type: "SPEECH_ERROR",
          error: event.error,
        });
      };
      recognition.onend = () => {
        isSpeechRecognitionActive = false;
        activeRecognition = null;
        chrome.runtime.sendMessage({
          type: "SPEECH_ENDED",
        });
      };
      try {
        // Reserve the session while Chrome is still asking for microphone access.
        isSpeechRecognitionActive = true;
        recognition.start();
        sendResponse({
          success: true,
        });
      } catch (error) {
        console.error("Could not start speech recognition:", error);
        isSpeechRecognitionActive = false;
        activeRecognition = null;
        sendResponse({
          success: false,
          error: "Could not start speech recognition.",
        });
      }
      return;
    }
    if (message.type === "STOP_SPEECH_RECOGNITION") {
      if (!activeRecognition || !isSpeechRecognitionActive) {
        sendResponse({
          success: false,
          error: "Speech recognition is not currently running.",
        });
        return;
      }
      try {
        activeRecognition.stop();
        sendResponse({
          success: true,
        });
      } catch (error) {
        console.error("Could not stop speech recognition:", error);
        sendResponse({
          success: false,
          error: "Could not stop speech recognition.",
        });
      }
      return;
    }
  };
}
