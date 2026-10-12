import { readCurrentEmail, insertApprovedReply } from "./content/gmail";
import { createSpeechMessageHandler } from "./content/speech";

// The popup may inject this script into an already-open tab. Register once per page.
const page = globalThis as typeof globalThis & {
  medMailGenieInitialized?: boolean;
};
if (!page.medMailGenieInitialized) {
  page.medMailGenieInitialized = true;
  const handleSpeechMessage = createSpeechMessageHandler();
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "INSERT_APPROVED_REPLY") {
      void insertApprovedReply(message.contextId, message.text).then(
        sendResponse,
      );
      return true;
    }
    if (message.type === "GET_CURRENT_EMAIL") {
      // Expanding a collapsed thread is asynchronous, so keep the channel open.
      void readCurrentEmail().then(sendResponse);
      return true;
    }
    handleSpeechMessage(message, sendResponse);
  });
}