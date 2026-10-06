// Gmail has no public DOM contract. Keep selectors and conversation checks here.
const editorSelector = '[contenteditable="true"][role="textbox"]';
const replySelector = '[data-tooltip="Reply"], [aria-label="Reply"]';

function visible(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0;
}

function emailText(body: HTMLElement): string {
  // Clean a detached copy so the original email in Gmail is never changed.
  const copy = body.cloneNode(true) as HTMLElement;
  copy
    .querySelectorAll(
      "img, picture, svg, canvas, video, audio, iframe, script, style, template, [hidden], [aria-hidden='true']",
    )
    .forEach((node) => node.remove());
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  // Keep paragraph, list and table boundaries when converting HTML to text.
  copy
    .querySelectorAll(
      "p, div, section, article, header, footer, blockquote, h1, h2, h3, h4, h5, h6, ul, ol, li, table, tr, hr",
    )
    .forEach((node) => {
      const separator = node.tagName === "P" ? "\n\n" : "\n";
      node.before(separator);
      node.after(separator);
    });
  copy.querySelectorAll("td, th").forEach((node) => node.after(" "));
  return (copy.textContent || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u200b\ufeff]/g, "")
    .split("\n")
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function currentMessage() {
  if (location.hostname !== "mail.google.com") return null;
  const subjects = [...document.querySelectorAll("h2.hP")].filter(visible);
  if (subjects.length !== 1) return null;
  const subject = subjects[0]!;
  const root = subject.closest<HTMLElement>('[role="main"]');
  if (!root) return null;
  // Reply to the last expanded message, which is also the message we analyse.
  const body = [...root.querySelectorAll("div.a3s")].filter(visible).at(-1);
  const message = body?.closest<HTMLElement>(".adn");
  if (!body || !message) return null;
  const sender = message.querySelector(".gD[email]");
  return {
    root,
    message,
    body,
    subject: subject.textContent?.trim() || "",
    text: emailText(body),
    senderEmail: sender?.getAttribute("email") || "",
    senderName: sender?.textContent?.trim() || "",
  };
}

type Message = NonNullable<ReturnType<typeof currentMessage>>;
let snapshot: { id: string; url: string; email: Message } | undefined;
let inserting = false;

export function readCurrentEmail() {
  const email = currentMessage();
  if (!email) {
    snapshot = undefined;
    return {
      success: false,
      error: "No open email found. Please open a Gmail email first.",
    };
  }
  snapshot = { id: crypto.randomUUID(), url: location.href, email };
  return {
    success: true,
    contextId: snapshot.id,
    subject: email.subject,
    body: email.text,
    senderEmail: email.senderEmail,
    senderName: email.senderName,
  };
}

function checkedMessage(contextId: unknown): Message {
  const current = currentMessage();
  const previous = snapshot?.email;
  if (
    !snapshot ||
    contextId !== snapshot.id ||
    snapshot.url !== location.href ||
    !current ||
    !previous ||
    current.message !== previous.message ||
    current.body !== previous.body ||
    current.text !== previous.text ||
    current.subject !== previous.subject ||
    current.senderEmail !== previous.senderEmail
  ) {
    throw new Error(
      "The Gmail conversation changed. Reopen MedMailGenie to review the current email.",
    );
  }
  return current;
}

function editors(root: HTMLElement) {
  return [...root.querySelectorAll(editorSelector)].filter(
    (node): node is HTMLElement =>
      visible(node) && !node.closest('[role="dialog"]'),
  );
}

function hasDraft(editor: HTMLElement) {
  const copy = editor.cloneNode(true) as HTMLElement;
  // Preserve Gmail's signature and quoted history when inserting above them.
  copy
    .querySelectorAll(
      '.gmail_signature, [data-smartmail="gmail_signature"], .gmail_quote',
    )
    .forEach((node) => node.remove());
  return Boolean(
    copy.textContent?.replace(/[\s\u200b\u00a0]/g, "") ||
    copy.querySelector("img, table, hr"),
  );
}

export async function insertApprovedReply(contextId: unknown, text: unknown) {
  if (typeof text !== "string" || !text.trim()) {
    return { success: false, error: "The approved reply is empty." };
  }
  if (inserting)
    return { success: false, error: "A reply is already being inserted." };
  inserting = true;
  try {
    const email = checkedMessage(contextId);
    const existing = editors(email.root);
    let editor = existing.find((node) => email.message.contains(node));
    if (existing.length > 1 || (existing.length && !editor)) {
      throw new Error(
        "Another reply editor is open. Close it first, then approve again, or use Copy Reply.",
      );
    }
    if (!editor) {
      const buttons = [...email.message.querySelectorAll(replySelector)].filter(
        (node): node is HTMLElement =>
          visible(node) &&
          !email.body.contains(node) &&
          !node.closest(editorSelector),
      );
      const button = buttons[0];
      if (!button)
        throw new Error(
          "Could not find Gmail's Reply button. Open Reply manually and try again, or use Copy Reply.",
        );
      button.click();
      // Gmail creates the inline composer asynchronously. Recheck the target on every wait.
      for (let attempt = 0; attempt < 30; attempt++) {
        const current = checkedMessage(contextId);
        const candidates = editors(current.root);
        if (candidates.length > 1)
          throw new Error(
            "Multiple reply editors are open. Keep only the intended reply open and try again.",
          );
        editor = candidates[0];
        if (editor) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    checkedMessage(contextId);
    if (!editor || !editor.isConnected || !visible(editor)) {
      throw new Error(
        "Gmail's reply editor did not open. Try again or use Copy Reply.",
      );
    }
    if (hasDraft(editor)) {
      throw new Error(
        "Gmail already contains a draft. Your text was preserved. Clear it yourself before approving, or use Copy Reply.",
      );
    }
    // Never interpret generated text as HTML or interact with Gmail's Send button.
    const block = document.createElement("div");
    block.style.whiteSpace = "pre-wrap";
    block.textContent = text;
    editor.prepend(block, document.createElement("br"));
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(block);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text,
      }),
    );
    if (!editor.contains(block) || block.textContent !== text) {
      throw new Error(
        "Could not confirm insertion. Check the Gmail draft before trying again.",
      );
    }
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Could not insert the reply. Use Copy Reply instead.",
    };
  } finally {
    inserting = false;
  }
}
