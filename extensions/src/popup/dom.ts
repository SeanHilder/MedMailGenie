// Popup element references live here so feature modules share one UI.

export const emailSender = document.getElementById("emailSender");
export const emailSubject = document.getElementById("emailSubject");
export const emailBody = document.getElementById("emailBody");
export const summaryText = document.getElementById("summaryText");
export const priorityBadge = document.querySelector(".badge.priority");
export const categoryBadge = document.querySelector(".badge.category");
export const tasksList = document.getElementById("tasksList");
export const calendarButtons = document.getElementById("calendarButtons");
export const replyBox = document.getElementById(
  "replyBox",
) as HTMLTextAreaElement | null;
export const toneSelect = document.getElementById(
  "toneSelect",
) as HTMLSelectElement | null;
export const editBtn = document.getElementById("editBtn");
export const approveBtn = document.getElementById("approveBtn");
export const regenerateBtn = document.getElementById(
  "regenerateBtn",
) as HTMLButtonElement | null;
export const voiceBtn = document.getElementById(
  "voiceBtn",
) as HTMLButtonElement | null;
export const readBtn = document.getElementById("readBtn");
export const copyBtn = document.getElementById("copyBtn");
export const clearBtn = document.getElementById("clearBtn");

export const feedbackMessage = document.getElementById("feedbackMessage");
