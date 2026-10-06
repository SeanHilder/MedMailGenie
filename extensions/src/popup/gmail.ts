import { state } from "./state";
import { emailSender, emailSubject } from "./dom";

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
                  // No open email is an expected empty state, not an extension error.
                  if (response?.success !== false) {
                    console.error(
                      "Invalid response when reading the Gmail email.",
                    );
                  }
                  resolve(false);
                  return;
                }
                state.currentEmailSubject = response.subject || "";
                state.gmailTabId = tab.id!;
                state.gmailContextId = response.contextId || "";
                state.currentEmailBody = response.body || "";
                state.currentEmailSender =
                  response.senderName?.trim() || response.senderEmail || "";
                if (emailSubject) {
                  emailSubject.textContent =
                    state.currentEmailSubject || "No subject";
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

export function insertReplyIntoGmail(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (state.gmailTabId === null || !state.gmailContextId) {
      reject(
        new Error("Reopen MedMailGenie on the Gmail email before approving."),
      );
      return;
    }
    chrome.tabs.sendMessage(
      state.gmailTabId,
      {
        type: "INSERT_APPROVED_REPLY",
        contextId: state.gmailContextId,
        text,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              "Could not reach Gmail. Refresh Gmail and reopen MedMailGenie, or use Copy Reply.",
            ),
          );
        } else if (!response?.success) {
          reject(
            new Error(
              response?.error ||
                "Could not insert the reply. Use Copy Reply instead.",
            ),
          );
        } else {
          resolve();
        }
      },
    );
  });
}
