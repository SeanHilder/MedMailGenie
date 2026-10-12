// Gmail has no public DOM contract. Keep selectors and conversation checks here.
const editorSelector = '[contenteditable="true"][role="textbox"]';
const replySelector = '[data-tooltip="Reply"], [aria-label="Reply"]';
// Gmail only loads the newest message of a conversation. Its labels follow the UI language.
const expandAllSelector = ["Expand all", "Mở rộng tất cả"]
  .flatMap((label) => [`[aria-label="${label}"]`, `[data-tooltip="${label}"]`])
  .join(", ");
// Reply history quoted below a message. Forwarded content has no blockquote and is kept.
const replyQuoteSelector = 'blockquote.gmail_quote, blockquote[type="cite"]';

function visible(element: Element): element is HTMLElement {
  return element instanceof HTMLElement && element.getClientRects().length > 0;
}

function emailText(body: HTMLElement, withoutQuotedReplies = false): string {
  // Clean a detached copy so the original email in Gmail is never changed.
  const copy = body.cloneNode(true) as HTMLElement;
  if (withoutQuotedReplies) {
    // Earlier messages are read separately, so drop their quoted copies and "wrote:" lines.
    copy.querySelectorAll(replyQuoteSelector).forEach((quote) => {
      const attribution = quote.previousElementSibling;
      if (attribution?.matches(".gmail_attr")) attribution.remove();
      quote.remove();
    });
  }
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

function sender(message: Element) {
  const element = message.querySelector(".gD[email]");
  return {
    senderEmail: element?.getAttribute("email") || "",
    senderName: element?.textContent?.trim() || "",
  };
}

// Every loaded message in the conversation, oldest first.
function threadMessages(root: HTMLElement) {
  return [...root.querySelectorAll(".adn")]
    .filter(visible)
    .flatMap((message) => {
      const body = [...message.querySelectorAll("div.a3s")].find(visible);
      return body ? [{ message, body }] : [];
    });
}

function press(element: HTMLElement) {
  // Gmail listens for the full mouse sequence rather than click alone.
  for (const type of ["mousedown", "mouseup", "click"]) {
    element.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, view: window }),
    );
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function expandThread(root: HTMLElement) {
  const button = [...document.querySelectorAll(expandAllSelector)].find(
    visible,
  );
  if (!button) return;
  const loaded = () =>
    threadMessages(root).filter(({ body }) => body.textContent?.trim()).length;
  const before = loaded();
  press(button);
  // Gmail fetches collapsed messages asynchronously. Stop once the count settles.
  let last = before;
  let stableChecks = 0;
  for (let check = 1; check <= 25; check++) {
    await wait(200);
    const count = loaded();
    stableChecks = count === last && count > before ? stableChecks + 1 : 0;
    last = count;
    if (stableChecks >= 2) return;
    if (count === before && check >= 10) return;
  }
}

function accountEmail() {
  // Gmail's title ends with the signed-in address, e.g. "Subject - me@example.com - Gmail".
  return document.title.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)?.at(-1) || "";
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
  return {
    root,
    message,
    body,
    subject: subject.textContent?.trim() || "",
    text: emailText(body),
    ...sender(message),
  };
}

type Message = NonNullable<ReturnType<typeof currentMessage>>;
let snapshot: { id: string; url: string; email: Message } | undefined;
let inserting = false;

const noEmail = {
  success: false,
  error: "No open email found. Please open a Gmail email first.",
};

export async function readCurrentEmail() {
  snapshot = undefined;
  const opened = currentMessage();
  if (!opened) return noEmail;
  await expandThread(opened.root);
  // The newest message is still the last one; read it again after expanding.
  const email = currentMessage();
  if (!email || email.root !== opened.root) return noEmail;
  const messages = threadMessages(email.root)
    .map(({ message, body }, index) => ({
      ...sender(message),
      date:
        message.querySelector(".g3")?.getAttribute("title") ||
        message.querySelector(".g3")?.textContent?.trim() ||
        "",
      body: emailText(body, index > 0),
    }))
    .filter((message) => message.body);
  snapshot = { id: crypto.randomUUID(), url: location.href, email };
  return {
    success: true,
    contextId: snapshot.id,
    subject: email.subject,
    body: email.text,
    senderEmail: email.senderEmail,
    senderName: email.senderName,
    accountEmail: accountEmail(),
    messages,
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