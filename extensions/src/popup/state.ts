// State is scoped to the lifetime of a single popup.
export const state = {
  gmailTabId: null as number | null,
  gmailContextId: "",
  isInsertingReply: false,
  replyReady: false,
  currentEmailSubject: "",
  currentEmailBody: "",
  currentEmailSender: "",
  replyApproved: false,
  isGeneratingReply: false,
  isListening: false,
  currentVoiceTranscript: "",
};
