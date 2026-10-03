export function readCurrentEmail() {
  const subjectElement = document.querySelector("h2.hP");
  const bodyElement = document.querySelector("div.a3s");
  const subject = subjectElement?.textContent?.trim() || "";
  const body = bodyElement?.textContent?.trim() || "";
  const senderElement = document.querySelector(".gD[email]");
  const senderEmail = senderElement?.getAttribute("email") || "";
  const senderName = senderElement?.textContent?.trim() || "";
  if (!subject && !body) {
    return {
      success: false,
      error: "No open email found. Please open an email first.",
    };
  }
  return {
    success: true,
    subject: subject,
    body: body,
    senderEmail: senderEmail,
    senderName: senderName,
  };
}
