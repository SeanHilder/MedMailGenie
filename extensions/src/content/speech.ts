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
  onresult: ((event: { results: ArrayLike<SpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechConstructor = new () => SpeechRecognitionSession;
const speechWindow = window as Window & {
  SpeechRecognition?: SpeechConstructor;
  webkitSpeechRecognition?: SpeechConstructor;
};

export function createSpeechPortHandler() {
  let activePort: chrome.runtime.Port | null = null;

  return (port: chrome.runtime.Port) => {
    if (port.name !== "medmailgenie-voice") return;

    let recognition: SpeechRecognitionSession | null = null;
    let finished = false;
    let stopping = false;
    let transcript = "";
    let startTimer: number | undefined;
    let stopTimer: number | undefined;

    function dispose() {
      finished = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(stopTimer);
      const previous = recognition;
      recognition = null;
      if (activePort === port) activePort = null;
      if (previous) {
        // Detach before aborting: a delayed end/error must not affect a new session.
        previous.onstart = null;
        previous.onresult = null;
        previous.onerror = null;
        previous.onend = null;
        try {
          previous.abort();
        } catch {
          // Chrome may already have ended this recognition session.
        }
      }
    }

    function send(message: object) {
      try {
        port.postMessage(message);
      } catch {
        dispose();
      }
    }

    function finish(error?: string) {
      if (finished) return;
      dispose();
      send({
        type: error ? "SPEECH_ERROR" : "SPEECH_ENDED",
        transcript,
        ...(error ? { error } : {}),
      });
    }

    function stop() {
      if (finished || stopping || !recognition) return;
      stopping = true;
      window.clearTimeout(startTimer);
      // stop() can wait for a final result. Abort if Chrome never sends onend.
      stopTimer = window.setTimeout(() => finish(), 2000);
      try {
        recognition.stop();
      } catch {
        // A microphone permission prompt may still be pending.
        // onstart retries the stop; the timeout also cancels pending startup.
      }
    }

    port.onDisconnect.addListener(() => {
      // A closed popup must never leave its microphone session running.
      void chrome.runtime.lastError;
      dispose();
    });

    port.onMessage.addListener((message: { type: string }) => {
      if (finished) return;
      if (message.type === "STOP_SPEECH_RECOGNITION") {
        stop();
        return;
      }
      if (message.type !== "START_SPEECH_RECOGNITION" || recognition) return;
      if (activePort) {
        finish("already-running");
        return;
      }
      const SpeechRecognition =
        speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        finish("unsupported");
        return;
      }

      try {
        const current = new SpeechRecognition();
        recognition = current;
        activePort = port;
        current.lang = "en-AU";
        current.continuous = true;
        current.interimResults = true;
        current.onstart = () => {
          if (finished) return;
          window.clearTimeout(startTimer);
          if (stopping) {
            try {
              current.stop();
            } catch {
              // The stop timeout will abort if Chrome is already stopping.
            }
            return;
          }
          send({ type: "SPEECH_STARTED" });
        };
        current.onresult = (event) => {
          if (finished) return;
          // Results describe the entire session, including revised interim words.
          // Send a snapshot, rather than appending potentially repeated segments.
          transcript = Array.from(event.results)
            .map((result) => result[0]?.transcript.trim() || "")
            .filter(Boolean)
            .join(" ");
          send({ type: "SPEECH_RESULT", transcript });
        };
        current.onerror = (event) => {
          finish(
            stopping && event.error === "aborted" ? undefined : event.error,
          );
        };
        current.onend = () => finish();
        startTimer = window.setTimeout(() => finish("start-timeout"), 15000);
        current.start();
      } catch {
        finish("start-failed");
      }
    });
  };
}
