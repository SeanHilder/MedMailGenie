import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const bundle = readFileSync(
  new URL("../dist/popup.js", import.meta.url),
  "utf8",
);
const html = readFileSync(
  new URL("../dist/popup.html", import.meta.url),
  "utf8",
);

function element() {
  return {
    textContent: "",
    value: "",
    innerHTML: "",
    style: {},
    children: [],
    events: {},
    classList: { add() {}, remove() {} },
    relList: { supports: () => true },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(name, handler) {
      this.events[name] = handler;
    },
    focus() {},
  };
}

async function openPopup(
  email,
  failRequests = false,
  insertion = { success: true },
) {
  const elements = Object.fromEntries(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], element()]),
  );
  const badges = { ".badge.priority": element(), ".badge.category": element() };
  const requests = [];
  const insertions = [];
  const errors = [];
  elements.toneSelect.value = "professional";
  const responses = {
    "/classify/category": { category: "Administration" },
    "/classify/priority": { priority: "Medium" },
    "/summarize/email": { summary: "Review the report." },
    "/extract/tasks": {
      tasks: ["Review report"],
      deadlines: [],
      meeting_times: [],
      calendar_events: [],
    },
    "/draft/generate": { draft_reply: "Thanks, I will review it." },
  };
  vm.runInNewContext(bundle, {
    console: { error: (...args) => errors.push(args) },
    URLSearchParams,
    document: {
      getElementById: (id) => elements[id] ?? null,
      querySelector: (selector) => badges[selector] ?? null,
      createElement: element,
    },
    window: { setTimeout() {}, clearTimeout() {} },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      scripting: { executeScript: (_options, callback) => callback() },
      tabs: {
        query: (_options, callback) => callback([{ id: 1 }]),
        sendMessage: (id, message, callback) => {
          if (message.type === "INSERT_APPROVED_REPLY") {
            insertions.push({ id, ...message });
            if (typeof insertion === "function") insertion(callback);
            else callback(insertion);
          } else callback(email);
        },
      },
    },
    async fetch(url, options) {
      const path = new URL(url).pathname;
      requests.push({ path, body: JSON.parse(options.body) });
      return {
        ok: !failRequests,
        status: failRequests ? 500 : 200,
        json: async () => responses[path],
        text: async () => "Unavailable",
      };
    },
  });
  // Allow the popup's promise chain to settle without waiting on network or timers.
  await new Promise((resolve) => setImmediate(resolve));
  return { elements, badges, requests, insertions, errors };
}

const email = {
  success: true,
  contextId: "original-message",
  subject: "Report",
  body: "Please review.",
  senderName: "Alex",
};

test("popup wires Gmail data into all five analysis requests and displays results", async () => {
  const { elements, badges, requests, insertions } = await openPopup(email);
  assert.equal(requests.length, 5);
  for (const request of requests) {
    assert.equal(request.body.subject, email.subject);
    assert.equal(request.body.body, email.body);
  }
  assert.equal(elements.emailSender.textContent, "Alex");
  assert.equal(elements.summaryText.textContent, "Review the report.");
  assert.equal(badges[".badge.priority"].textContent, "Medium");
  assert.equal(
    elements.tasksList.children[0].textContent,
    "Task: Review report",
  );
  assert.equal(elements.replyBox.value, "Thanks, I will review it.");
  elements.replyBox.value = "My reviewed reply";
  elements.replyBox.events.input();
  await elements.approveBtn.events.click();
  assert.equal(insertions.length, 1);
  assert.equal(insertions[0].id, 1);
  assert.equal(insertions[0].contextId, "original-message");
  assert.equal(insertions[0].text, "My reviewed reply");
  assert.match(
    elements.feedbackMessage.textContent,
    /Reply inserted into Gmail/,
  );
});

test("popup shows an empty state without errors or AI requests when no message is open", async () => {
  const { elements, requests, errors } = await openPopup({
    success: false,
    error: "No open email found. Please open a Gmail email first.",
  });
  assert.equal(requests.length, 0);
  assert.equal(errors.length, 0);
  assert.match(elements.summaryText.textContent, /Open a Gmail email/);
  assert.equal(elements.tasksList.textContent, "No email detected.");
});

test("popup handles backend failures without leaving the reply button disabled", async () => {
  const { elements, errors } = await openPopup(email, true);
  assert.ok(errors.length > 0);
  assert.equal(
    elements.summaryText.textContent,
    "Could not generate the AI summary.",
  );
  assert.equal(
    elements.replyBox.value,
    "Could not generate a suggested reply.",
  );
  assert.equal(elements.regenerateBtn.disabled, false);
});

test("approval does not insert placeholder text after failed generation or without an email", async () => {
  for (const args of [
    [email, true],
    [{ success: false }, false],
  ]) {
    const { elements, insertions } = await openPopup(...args);
    await elements.approveBtn.events.click();
    assert.equal(insertions.length, 0);
  }
});

test("insertion failure is visible and unlocks the popup for retry or copy", async () => {
  const { elements } = await openPopup(email, false, {
    success: false,
    error: "Gmail already contains a draft.",
  });
  await elements.approveBtn.events.click();
  assert.match(
    elements.feedbackMessage.textContent,
    /already contains a draft/,
  );
  assert.equal(elements.approveBtn.disabled, false);
  assert.equal(elements.replyBox.readOnly, false);
  assert.equal(elements.replyBox.value, "Thanks, I will review it.");
});

test("duplicate clicks insert only once while Gmail opens its reply editor", async () => {
  let finish;
  const { elements, insertions } = await openPopup(email, false, (callback) => {
    finish = callback;
  });
  const pending = elements.approveBtn.events.click();
  await elements.approveBtn.events.click();
  assert.equal(insertions.length, 1);
  assert.equal(elements.approveBtn.disabled, true);
  assert.equal(elements.replyBox.readOnly, true);
  finish({ success: true });
  await pending;
  assert.equal(elements.approveBtn.disabled, false);
});
