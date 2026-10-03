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

async function openPopup(email, failRequests = false) {
  const elements = Object.fromEntries(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], element()]),
  );
  const badges = { ".badge.priority": element(), ".badge.category": element() };
  const requests = [];
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
    console: { error() {} },
    URLSearchParams,
    document: {
      getElementById: (id) => elements[id] ?? null,
      querySelector: (selector) => badges[selector] ?? null,
      createElement: element,
    },
    window: { setTimeout() {} },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      scripting: { executeScript: (_options, callback) => callback() },
      tabs: {
        query: (_options, callback) => callback([{ id: 1 }]),
        sendMessage: (_id, _message, callback) => callback(email),
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
  return { elements, badges, requests };
}

const email = {
  success: true,
  subject: "Report",
  body: "Please review.",
  senderName: "Alex",
};

test("popup wires Gmail data into all five analysis requests and displays results", async () => {
  const { elements, badges, requests } = await openPopup(email);
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
  elements.approveBtn.events.click();
  assert.match(elements.feedbackMessage.textContent, /Copy it into Gmail/);
});

test("popup avoids AI requests when no message is open", async () => {
  const { elements, requests } = await openPopup({ success: false });
  assert.equal(requests.length, 0);
  assert.equal(elements.tasksList.textContent, "No email detected.");
});

test("popup handles backend failures without leaving the reply button disabled", async () => {
  const { elements } = await openPopup(email, true);
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
