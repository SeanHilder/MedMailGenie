import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Test the actual Chrome bundle: content scripts must work without ES module imports.
const bundle = readFileSync(
  new URL("../dist/content.js", import.meta.url),
  "utf8",
);

function createPage(elements = {}, SpeechRecognition) {
  const listeners = [];
  const messages = [];
  const context = vm.createContext({
    console,
    window: { SpeechRecognition },
    document: { querySelector: (selector) => elements[selector] ?? null },
    chrome: {
      runtime: {
        onMessage: { addListener: (listener) => listeners.push(listener) },
        sendMessage: (message) => messages.push(message),
      },
    },
  });
  const inject = () => vm.runInContext(bundle, context);
  inject();
  return {
    inject,
    listeners,
    messages,
    send(type) {
      let response;
      listeners[0]({ type }, {}, (value) => {
        response = value;
      });
      // Normalize objects created in another VM realm.
      return response && JSON.parse(JSON.stringify(response));
    },
  };
}

test("reinjecting the content script registers only one message listener", () => {
  const page = createPage();
  page.inject();
  assert.equal(page.listeners.length, 1);
});

test("reads the open Gmail message and sender", () => {
  const page = createPage({
    "h2.hP": { textContent: " Report " },
    "div.a3s": { textContent: " Please review. " },
    ".gD[email]": {
      textContent: " Alex ",
      getAttribute: () => "alex@example.com",
    },
  });
  assert.deepEqual(page.send("GET_CURRENT_EMAIL"), {
    success: true,
    subject: "Report",
    body: "Please review.",
    senderName: "Alex",
    senderEmail: "alex@example.com",
  });
});

test("reports when no email is open", () => {
  assert.equal(createPage().send("GET_CURRENT_EMAIL").success, false);
});

test("reports unsupported voice input", () => {
  const response = createPage().send("START_SPEECH_RECOGNITION");
  assert.equal(response.success, false);
  assert.match(response.error, /not supported/);
});

test("voice session survives reinjection and sends only final speech results", () => {
  let session;
  class Recognition {
    constructor() {
      session = this;
    }
    start() {}
    stop() {
      this.onend();
    }
  }
  const page = createPage({}, Recognition);
  assert.equal(page.send("START_SPEECH_RECOGNITION").success, true);
  // A second click must not create another session while microphone permission is pending.
  assert.equal(page.send("START_SPEECH_RECOGNITION").success, false);
  session.onstart();
  session.onresult({
    resultIndex: 0,
    results: [
      { isFinal: false, 0: { transcript: "Ignore interim" } },
      { isFinal: true, 0: { transcript: "Hello team" } },
    ],
  });
  page.inject();
  assert.equal(page.send("STOP_SPEECH_RECOGNITION").success, true);
  assert.deepEqual(
    page.messages.map((message) => message.type),
    ["SPEECH_STARTED", "SPEECH_RESULT", "SPEECH_ENDED"],
  );
  assert.equal(page.messages[1].transcript, "Hello team");
});
