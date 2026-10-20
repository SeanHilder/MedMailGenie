import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { linkedPorts, fakeTimers, settle } from "./voice-helpers.mjs";

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
    classList: { add() {}, remove() {}, toggle() {} },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
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
  options = {},
) {
  const elements = Object.fromEntries(
    [...html.matchAll(/id="([^"]+)"/g)].map((match) => [match[1], element()]),
  );
  const badges = { ".badge.priority": element(), ".badge.category": element() };
  const requests = [];
  const insertions = [];
  const errors = [];
  const voices = [];
  const windowEvents = {};
  const timers = fakeTimers();
  const spoken = [];
  let speechCancelled = 0;
  elements.toneSelect.value = "professional";
  const responses = {
    "/analyze/email": {
      category: "Administration",
      priority: "Medium",
      summary: "Review the report.",
      tasks: ["Review report"],
      deadlines: [],
      meeting_times: [],
      calendar_events: [],
    },
    "/draft/generate": { draft_reply: "Thanks, I will review it." },
    "/voice/cleanup": { cleaned_text: "Hello team." },
  };
  vm.runInNewContext(bundle, {
    console: { error: (...args) => errors.push(args) },
    URLSearchParams,
    AbortController,
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
    document: {
      getElementById: (id) => elements[id] ?? null,
      querySelector: (selector) => badges[selector] ?? null,
      createElement: element,
    },
    window: {
      setTimeout: timers.setTimeout,
      clearTimeout: timers.clearTimeout,
      addEventListener: (name, listener) => {
        windowEvents[name] = listener;
      },
      speechSynthesis: {
        cancel() {
          speechCancelled++;
        },
        speak(speech) {
          spoken.push(speech);
        },
      },
    },
    chrome: {
      runtime: { onMessage: { addListener() {} } },
      scripting: { executeScript: (_options, callback) => callback() },
      tabs: {
        connect(id, connectOptions) {
          const [client, server] = linkedPorts(connectOptions.name);
          const messages = [];
          let disconnected = false;
          server.onMessage.addListener((message) => messages.push(message));
          server.onDisconnect.addListener(() => {
            disconnected = true;
          });
          voices.push({
            id,
            connectOptions,
            messages,
            client,
            server,
            emit: (message) => server.postMessage(message),
            get disconnected() {
              return disconnected;
            },
          });
          return client;
        },
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
    async fetch(url, requestOptions) {
      const path = new URL(url).pathname;
      requests.push({ path, body: JSON.parse(requestOptions.body) });
      const data =
        path === "/voice/cleanup" && options.cleanup
          ? await options.cleanup(requestOptions.signal)
          : responses[path];
      return {
        ok: !failRequests,
        status: failRequests ? 500 : 200,
        json: async () => data,
        text: async () => "Unavailable",
      };
    },
  });
  // Allow the popup's promise chain to settle without waiting on network or timers.
  await new Promise((resolve) => setImmediate(resolve));
  return {
    elements,
    badges,
    requests,
    insertions,
    errors,
    voices,
    windowEvents,
    timers,
    spoken,
    get speechCancelled() {
      return speechCancelled;
    },
  };
}

const email = {
  success: true,
  contextId: "original-message",
  subject: "Report",
  body: "Please review.",
  senderName: "Alex",
};

test("popup analyses Gmail data with two backend requests and displays results", async () => {
  const { elements, badges, requests, insertions } = await openPopup(email);
  // One request for category, priority, summary and tasks; one for the reply.
  assert.deepEqual(requests.map((request) => request.path).sort(), [
    "/analyze/email",
    "/draft/generate",
  ]);
  for (const request of requests) {
    assert.equal(request.body.subject, email.subject);
    assert.equal(request.body.body, email.body);
  }
  assert.equal(elements.emailSender.textContent, "Alex");
  assert.equal(elements.summaryText.textContent, "Review the report.");
  assert.equal(badges[".badge.priority"].textContent, "Medium");
  assert.equal(badges[".badge.category"].textContent, "Administration");
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

test("popup sends the whole Gmail thread with both analysis requests", async () => {
  const thread = {
    ...email,
    accountEmail: "me@example.com",
    messages: [
      {
        senderName: "Me",
        senderEmail: "me@example.com",
        date: "09:00",
        body: "Can you review?",
      },
      {
        senderName: "Alex",
        senderEmail: "",
        date: "10:00",
        body: "Please review.",
      },
    ],
  };
  const { elements, requests } = await openPopup(thread);
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.body.user_email, "me@example.com");
    assert.deepEqual(request.body.messages, [
      { sender: "Me <me@example.com>", date: "09:00", body: "Can you review?" },
      { sender: "Alex", date: "10:00", body: "Please review." },
    ]);
  }
  assert.equal(elements.emailSubject.textContent, "Report (2 messages)");
});
function startVoice(popup) {
  popup.elements.voiceBtn.events.click();
  const voice = popup.voices.at(-1);
  voice.emit({ type: "SPEECH_STARTED" });
  return voice;
}

function emitResult(voice, transcript) {
  voice.emit({ type: "SPEECH_RESULT", transcript });
}

function endVoice(voice, transcript) {
  voice.emit({ type: "SPEECH_ENDED", transcript });
}

test("Stop stays pending until recognition ends, ignores a late start, and formats once", async () => {
  let resolveCleanup;
  const popup = await openPopup(
    email,
    false,
    { success: true },
    {
      cleanup: () =>
        new Promise((resolve) => {
          resolveCleanup = resolve;
        }),
    },
  );
  const { elements } = popup;
  const voice = startVoice(popup);
  assert.equal(voice.id, 1);
  assert.equal(voice.connectOptions.frameId, 0);
  emitResult(voice, "hello team");
  elements.voiceBtn.events.click();
  assert.equal(elements.voiceBtn.textContent, "Stopping...");
  assert.equal(elements.approveBtn.disabled, true);
  voice.emit({ type: "SPEECH_STARTED" });
  assert.equal(elements.voiceBtn.textContent, "Stopping...");
  elements.voiceBtn.events.click();
  await elements.approveBtn.events.click();
  assert.equal(popup.insertions.length, 0);
  assert.deepEqual(
    voice.messages.map((m) => m.type),
    ["START_SPEECH_RECOGNITION", "STOP_SPEECH_RECOGNITION"],
  );
  emitResult(voice, "hello team thank you");
  endVoice(voice, "hello team thank you");
  assert.equal(voice.disconnected, true);
  assert.match(elements.feedbackMessage.textContent, /Microphone stopped/);
  assert.equal(elements.voiceBtn.attributes["aria-pressed"], "false");
  assert.equal(elements.approveBtn.disabled, true);
  voice.client.onMessage.emit({ type: "SPEECH_ENDED", transcript: "stale" });
  assert.equal(
    popup.requests.filter((r) => r.path === "/voice/cleanup").length,
    1,
  );
  resolveCleanup({ cleaned_text: "Hello team, thank you." });
  await settle();
  assert.equal(elements.replyBox.value, "Hello team, thank you.");
  assert.equal(elements.approveBtn.disabled, false);
  assert.equal(elements.voiceBtn.disabled, false);
});

test("Cancel before microphone startup does not start another recording", async () => {
  const popup = await openPopup(email);
  popup.elements.voiceBtn.events.click();
  assert.equal(popup.elements.voiceBtn.textContent, "Cancel Voice");
  popup.elements.voiceBtn.events.click();
  assert.equal(popup.voices.length, 1);
  assert.equal(popup.voices[0].messages.at(-1).type, "STOP_SPEECH_RECOGNITION");
  endVoice(popup.voices[0], "");
  assert.equal(popup.elements.voiceBtn.textContent, "Voice");
  assert.equal(popup.elements.replyBox.value, "Thanks, I will review it.");
});

test("dictation after Clear becomes approvable and snapshot updates do not duplicate words", async () => {
  const popup = await openPopup(email);
  popup.elements.clearBtn.events.click();
  const voice = startVoice(popup);
  emitResult(voice, "hello");
  emitResult(voice, "hello team");
  emitResult(voice, "hello team");
  assert.equal(popup.elements.replyBox.value, "hello team");
  endVoice(voice, "hello team");
  await settle();
  assert.equal(popup.elements.approveBtn.disabled, false);
  await popup.elements.approveBtn.events.click();
  assert.equal(popup.insertions[0].text, "Hello team.");
});

test("pending cleanup cannot overwrite manual edits, a cleared reply or a new recording", async () => {
  for (const action of ["edit", "clear", "record"]) {
    let resolveCleanup;
    const popup = await openPopup(
      email,
      false,
      { success: true },
      {
        cleanup: () =>
          new Promise((resolve) => {
            resolveCleanup = resolve;
          }),
      },
    );
    const voice = startVoice(popup);
    emitResult(voice, "original words");
    endVoice(voice, "original words");
    if (action === "edit") {
      popup.elements.replyBox.value = "My corrected reply";
      popup.elements.replyBox.events.input();
    } else {
      popup.elements.clearBtn.events.click();
      if (action === "record") emitResult(startVoice(popup), "new recording");
    }
    const expected = popup.elements.replyBox.value;
    resolveCleanup({ cleaned_text: "Old result that arrived late." });
    await settle();
    assert.equal(popup.elements.replyBox.value, expected);
    if (action === "record")
      assert.equal(popup.elements.voiceBtn.textContent, "Stop Listening");
    popup.windowEvents.pagehide();
  }
});

test("formatting failure and timeout keep captured speech and unlock the controls", async () => {
  for (const timeout of [false, true]) {
    const popup = await openPopup(
      email,
      false,
      { success: true },
      {
        cleanup: (signal) =>
          timeout
            ? new Promise((_, reject) =>
                signal.addEventListener("abort", () =>
                  reject(new Error("timeout")),
                ),
              )
            : Promise.reject(new Error("offline")),
      },
    );
    const voice = startVoice(popup);
    endVoice(voice, "keep these words");
    if (timeout) popup.timers.run(10000);
    await settle();
    assert.equal(popup.elements.replyBox.value, "keep these words");
    assert.equal(popup.elements.approveBtn.disabled, false);
    assert.equal(popup.elements.voiceBtn.disabled, false);
    assert.match(
      popup.elements.feedbackMessage.textContent,
      /Formatting was unavailable/,
    );
  }
});

test("microphone errors and tab disconnection unlock voice without erasing the draft", async () => {
  for (const disconnect of [false, true]) {
    const popup = await openPopup(email);
    const voice = startVoice(popup);
    if (disconnect) voice.server.disconnect();
    else
      voice.emit({
        type: "SPEECH_ERROR",
        error: "not-allowed",
        transcript: "",
      });
    assert.equal(popup.elements.replyBox.value, "Thanks, I will review it.");
    assert.equal(popup.elements.voiceBtn.textContent, "Voice");
    assert.equal(popup.elements.voiceBtn.disabled, false);
    assert.equal(popup.elements.replyBox.readOnly, false);
    if (!disconnect)
      assert.match(
        popup.elements.feedbackMessage.textContent,
        /Allow microphone access/,
      );
  }
});

test("closing the popup disconnects voice, and dictation stops Read Aloud", async () => {
  const popup = await openPopup(email);
  popup.elements.readBtn.events.click();
  assert.equal(popup.elements.readBtn.textContent, "Stop Reading");
  const cancelledBefore = popup.speechCancelled;
  const voice = startVoice(popup);
  assert.ok(popup.speechCancelled > cancelledBefore);
  assert.equal(popup.elements.readBtn.textContent, "Read Aloud");
  popup.elements.readBtn.events.click();
  assert.equal(popup.spoken.length, 1);
  popup.windowEvents.pagehide();
  assert.equal(voice.disconnected, true);
});

test("Read Aloud still toggles, finishes and ignores delayed completion from previous speech", async () => {
  const popup = await openPopup(email);
  const button = popup.elements.readBtn;
  button.events.click();
  const first = popup.spoken[0];
  first.onstart();
  assert.match(popup.elements.feedbackMessage.textContent, /Reading aloud/);
  button.events.click();
  assert.equal(button.textContent, "Read Aloud");
  button.events.click();
  first.onend();
  assert.equal(button.textContent, "Stop Reading");
  popup.spoken[1].onend();
  assert.equal(button.textContent, "Read Aloud");
});
