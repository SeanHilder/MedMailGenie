import { state } from "./state";
import { emailSender, emailSubject, emailBody } from "./dom";

export function getCurrentEmailFromGmail(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true,
      },
      (tabs) => {
        const tab = tabs[0];
        if (!tab?.id) {
          console.error("MedMail Genie could not find the active tab.");
          resolve(false);
          return;
        }
        chrome.scripting.executeScript(
          {
            target: {
              tabId: tab.id,
            },
            files: ["content.js"],
          },
          () => {
            if (chrome.runtime.lastError) {
              console.error(
                "Could not inject content script:",
                chrome.runtime.lastError.message,
              );
              resolve(false);
              return;
            }
            chrome.tabs.sendMessage(
              tab.id!,
              {
                type: "GET_CURRENT_EMAIL",
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "Could not read current Gmail email:",
                    chrome.runtime.lastError.message,
                  );
                  resolve(false);
                  return;
                }
                if (!response?.success) {
                  console.error("No Gmail email was found:", response?.error);
                  resolve(false);
                  return;
                }
                state.currentEmailSubject = response.subject || "";
                state.currentEmailBody = response.body || "";
                if (response.senderName) {
                  state.currentEmailSender = response.senderEmail
                    ? `${response.senderName} <${response.senderEmail}>`
                    : response.senderName;
                } else {
                  state.currentEmailSender = response.senderEmail || "";
                }
                if (emailSubject) {
                  emailSubject.textContent =
                    state.currentEmailSubject || "No subject";
                }
                if (emailBody) {
                  emailBody.textContent =
                    state.currentEmailBody || "No email body found.";
                }
                if (emailSender) {
                  emailSender.textContent =
                    state.currentEmailSender || "Unknown sender";
                }
                resolve(true);
              },
            );
          },
        );
      },
    );
  });
}
