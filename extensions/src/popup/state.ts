// State is scoped to the lifetime of a single popup.
export const state = {
  currentEmailSubject: "",
  currentEmailBody: "",
  currentEmailSender: "",
  replyApproved: false,
  isGeneratingReply: false,
  isListening: false,
  currentVoiceTranscript: "",
};
