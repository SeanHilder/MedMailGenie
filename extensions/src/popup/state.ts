import type { ThreadMessage } from "../types";

// State is scoped to the lifetime of a single popup.
export const state = {
  gmailTabId: null as number | null,
  gmailContextId: "",
  isInsertingReply: false,
  replyReady: false,
  currentEmailSubject: "",
  currentEmailBody: "",
  currentEmailSender: "",
  // Signed-in Gmail address, so the AI knows which messages the user wrote.
  currentAccountEmail: "",
  // All messages in the open conversation, oldest first (one entry for a single email).
  currentThreadMessages: [] as ThreadMessage[],
  replyApproved: false,
  isGeneratingReply: false,
  isListening: false,
  currentVoiceTranscript: "",
};