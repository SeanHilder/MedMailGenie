import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

// Test the actual Chrome bundle: content scripts must work without ES module imports.
const bundle = readFileSync(
  new URL("../dist/content.js", import.meta.url),
  "utf8",
);

function createPage(markup = "", SpeechRecognition) {
  const listeners = [];
  const messages = [];
  const dom = new JSDOM(markup, {
    url: "https://mail.google.com/mail/u/0/#inbox/thread1",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.HTMLElement.prototype.getClientRects = function () {
    return this.closest("[hidden]") ? [] : [{}];
  };
  window.SpeechRecognition = SpeechRecognition;
  window.chrome = {
    runtime: {
      onMessage: { addListener: (listener) => listeners.push(listener) },
      sendMessage: (message) => messages.push(message),
    },
  };
  const inject = () => window.eval(bundle);
  inject();
  const normalize = (value) => value && JSON.parse(JSON.stringify(value));
  return {
    window,
    document: window.document,
    inject,
    listeners,
    messages,
    // Reading Gmail is asynchronous because collapsed threads are expanded first.
    read() {
      return new Promise((resolve) => {
        assert.equal(
          listeners[0]({ type: "GET_CURRENT_EMAIL" }, {}, (value) =>
            resolve(normalize(value)),
          ),
          true,
          "keeps async message channel open",
        );
      });
    },
    send(type) {
      let response;
      listeners[0]({ type }, {}, (value) => {
        response = value;
      });
      return normalize(response);
    },
    insert(contextId, text) {
      return new Promise((resolve) => {
        assert.equal(
          listeners[0](
            { type: "INSERT_APPROVED_REPLY", contextId, text },
            {},
            (value) => resolve(normalize(value)),
          ),
          true,
          "keeps async message channel open",
        );
      });
    },
  };
}

const emailMarkup = `<main role="main"><h2 class="hP"> Report </h2>
  <div class="adn"><span class="gD" email="alex@example.com"> Alex </span>
    <div class="a3s"> Please review. </div>
    <button role="button" aria-label="Reply">Reply</button>
  </div></main>`;
const editorMarkup = '<div role="textbox" contenteditable="true"></div>';
function addEditor(page, contents = "") {
  page.document
    .querySelector(".adn")
    .insertAdjacentHTML("beforeend", editorMarkup);
  const editor = page.document.querySelector('[contenteditable="true"]');
  editor.innerHTML = contents;
  return editor;
}

test("reinjecting the content script registers only one message listener", async () => {
  const page = createPage();
  page.inject();
  assert.equal(page.listeners.length, 1);
});

test("reads the open Gmail message and sender", async () => {
  const page = createPage(emailMarkup);
  const { contextId, ...email } = await page.read();
  assert.equal(typeof contextId, "string");
  assert.deepEqual(email, {
    success: true,
    subject: "Report",
    body: "Please review.",
    senderName: "Alex",
    senderEmail: "alex@example.com",
    accountEmail: "",
    messages: [
      {
        senderName: "Alex",
        senderEmail: "alex@example.com",
        date: "",
        body: "Please review.",
      },
    ],
  });
});

test("reports when no email is open", async () => {
  assert.equal((await createPage().read()).success, false);
});

test("reports unsupported voice input", async () => {
  const response = createPage().send("START_SPEECH_RECOGNITION");
  assert.equal(response.success, false);
  assert.match(response.error, /not supported/);
});

test("voice session survives reinjection and sends only final speech results", async () => {
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
  const page = createPage("", Recognition);
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

test("approval opens Reply and inserts literal multiline text without clicking Send", async () => {
  const page = createPage(emailMarkup);
  const { contextId } = await page.read();
  let clickedSend = false;
  let inputEvents = 0;
  page.document.querySelector("button").onclick = () => {
    const editor = addEditor(page);
    editor.addEventListener("input", () => inputEvents++);
    const send = page.document.createElement("button");
    send.textContent = "Send";
    send.onclick = () => {
      clickedSend = true;
    };
    editor.after(send);
  };
  const text = "Hello Alex,\n\n<img src=x onerror=alert(1)>\nThanks!";
  assert.deepEqual(await page.insert(contextId, text), { success: true });
  const editor = page.document.querySelector('[contenteditable="true"]');
  assert.equal(editor.firstChild.textContent, text);
  assert.equal(editor.querySelector("img"), null);
  assert.equal(inputEvents, 1);
  assert.equal(clickedSend, false);
  assert.equal(page.document.activeElement, editor);
  // Repeated approvals must not duplicate or replace text.
  assert.equal((await page.insert(contextId, text)).success, false);
  assert.equal(editor.firstChild.textContent, text);
});

test("approval preserves an existing draft", async () => {
  const page = createPage(emailMarkup);
  const editor = addEditor(page, "My unfinished reply");
  const { contextId } = await page.read();
  const result = await page.insert(contextId, "AI draft");
  assert.equal(result.success, false);
  assert.match(result.error, /already contains a draft/);
  assert.equal(editor.innerHTML, "My unfinished reply");
});

test("inserts above an existing signature and quoted history", async () => {
  const page = createPage(emailMarkup);
  const editor = addEditor(
    page,
    '<div class="gmail_signature">Alex &amp; Team</div><div class="gmail_quote">Previous email</div>',
  );
  const signature = editor.querySelector(".gmail_signature");
  const quote = editor.querySelector(".gmail_quote");
  const { contextId } = await page.read();
  assert.equal((await page.insert(contextId, "Approved text")).success, true);
  assert.equal(editor.firstChild.textContent, "Approved text");
  assert.equal(editor.querySelector(".gmail_signature"), signature);
  assert.equal(editor.querySelector(".gmail_quote"), quote);
});

test("rejects a changed URL, message content, or stale context before clicking Reply", async () => {
  for (const change of [
    (page) => {
      page.window.location.hash = "#inbox/other";
    },
    (page) => {
      page.document.querySelector(".a3s").textContent = "Different email";
    },
    async (page) => {
      await page.read();
    },
  ]) {
    const page = createPage(emailMarkup);
    const { contextId } = await page.read();
    let clicked = false;
    page.document.querySelector("button").onclick = () => {
      clicked = true;
    };
    await change(page);
    assert.equal((await page.insert(contextId, "Draft")).success, false);
    assert.equal(clicked, false);
  }
});

test("rechecks the conversation after opening the reply editor", async () => {
  const page = createPage(emailMarkup);
  const { contextId } = await page.read();
  page.document.querySelector("button").onclick = () => {
    addEditor(page);
    page.window.location.hash = "#inbox/other";
  };
  assert.equal((await page.insert(contextId, "Draft")).success, false);
  assert.equal(
    page.document.querySelector('[contenteditable="true"]').textContent,
    "",
  );
});

test("does not use a standalone compose window or another message's editor", async () => {
  const page = createPage(
    emailMarkup + `<div role="dialog">${editorMarkup}</div>`,
  );
  const standalone = page.document.querySelector(
    '[role="dialog"] [contenteditable]',
  );
  const other = page.document.createElement("div");
  other.innerHTML = editorMarkup;
  page.document.querySelector("main").append(other);
  const { contextId } = await page.read();
  assert.equal((await page.insert(contextId, "Draft")).success, false);
  assert.equal(standalone.textContent, "");
  assert.equal(other.textContent, "");
});

test("reads and replies to the last visible expanded message", async () => {
  const page = createPage(emailMarkup);
  page.document.querySelector("main").insertAdjacentHTML(
    "beforeend",
    `<div class="adn">
    <span class="gD" email="sam@example.com">Sam</span><div class="a3s">Latest message</div>
    ${editorMarkup}</div><div class="adn" hidden><div class="a3s">Hidden message</div></div>`,
  );
  const email = await page.read();
  assert.equal(email.body, "Latest message");
  assert.equal(email.senderEmail, "sam@example.com");
  assert.equal((await page.insert(email.contextId, "Draft")).success, true);
});

test("fails clearly when Reply cannot be found and rejects empty drafts", async () => {
  const page = createPage(emailMarkup);
  page.document.querySelector("button").remove();
  const { contextId } = await page.read();
  assert.match((await page.insert(contextId, "Draft")).error, /Reply button/);
  assert.match((await page.insert(contextId, "  ")).error, /empty/);
});

test("waits for Gmail's asynchronous editor and supports its Reply link", async () => {
  const page = createPage(
    emailMarkup.replace(
      '<button role="button" aria-label="Reply">Reply</button>',
      '<span role="link" data-tooltip="Reply">Reply</span>',
    ),
  );
  const { contextId } = await page.read();
  page.document.querySelector('[data-tooltip="Reply"]').onclick = () => {
    page.window.setTimeout(() => addEditor(page), 10);
  };
  assert.equal((await page.insert(contextId, "Async draft")).success, true);
  assert.equal(
    page.document.querySelector("[contenteditable]").firstChild.textContent,
    "Async draft",
  );
});

test("does not click Reply labels embedded in the email body", async () => {
  const page = createPage(emailMarkup);
  page.document.querySelector("button").remove();
  page.document.querySelector(".a3s").innerHTML =
    '<span aria-label="Reply">Untrusted content</span>';
  let clicked = false;
  page.document.querySelector('[aria-label="Reply"]').onclick = () => {
    clicked = true;
  };
  const { contextId } = await page.read();
  assert.equal((await page.insert(contextId, "Draft")).success, false);
  assert.equal(clicked, false);
});

test("removes newsletter image gaps while preserving readable email text and the original Gmail DOM", async () => {
  const page = createPage(emailMarkup);
  const body = page.document.querySelector(".a3s");
  body.innerHTML = `<p>Hi Alex,</p>
    <table><tr><td height="400"><img src="banner.png" alt="Large banner"></td></tr>
    <tr><td>&nbsp;\u200b&nbsp;<br><br><br></td></tr></table>
    <p>Please   review&nbsp;the report.</p><p>Thanks,<br>The team</p>`;
  const original = body.innerHTML;
  assert.equal(
    (await page.read()).body,
    "Hi Alex,\n\nPlease review the report.\n\nThanks,\nThe team",
  );
  assert.equal(body.innerHTML, original);
  assert.equal(body.querySelectorAll("img").length, 1);
});

test("keeps text boundaries in HTML lists and table cells without excessive blank lines", async () => {
  const page = createPage(emailMarkup);
  page.document.querySelector(".a3s").innerHTML =
    "<div>Agenda</div><ul><li>Review report</li><li>Confirm meeting</li></ul><table><tr><td>Date</td><td>Tuesday</td></tr></table><div hidden>Hidden spacer text</div>";
  const text = (await page.read()).body;
  assert.match(text, /Agenda\n/);
  assert.match(text, /Review report\n+Confirm meeting/);
  assert.match(text, /Date Tuesday/);
  assert.doesNotMatch(text, /\n{3}|Hidden spacer/);
});

// Gmail renders only the newest message until "Expand all" loads the rest.
const collapsedThreadMarkup = `<main role="main"><h2 class="hP">Roster</h2>
  <button aria-label="Mở rộng tất cả">Expand</button>
  <div class="adn"><span class="gD" email="sam@example.com">Sam</span>
    <span class="g3" title="10:05 12 Oct 2026">10:05</span>
    <div class="a3s">Thanks, confirmed.<div class="gmail_quote">
      <div class="gmail_attr">On Mon, Me wrote:</div>
      <blockquote class="gmail_quote">Can you cover Friday?</blockquote>
    </div></div>
    <button role="button" aria-label="Reply">Reply</button>
  </div></main>`;

function expandOnClick(page, delay = 50) {
  page.document.querySelector('[aria-label="Mở rộng tất cả"]').onclick = () => {
    page.window.setTimeout(() => {
      page.document.querySelector(".adn").insertAdjacentHTML(
        "beforebegin",
        `<div class="adn"><span class="gD" email="me@example.com">Me</span>
          <span class="g3" title="09:00 12 Oct 2026">09:00</span>
          <div class="a3s">Can you cover Friday?<div class="gmail_quote">
            <div class="gmail_attr">---------- Forwarded message ---------</div>
            Roster attached.</div></div></div>`,
      );
    }, delay);
  };
}

test("expands a collapsed thread and reads every message oldest first", async () => {
  const page = createPage(collapsedThreadMarkup);
  page.document.title = "Roster - me@example.com - Gmail";
  expandOnClick(page);
  const email = await page.read();
  assert.equal(email.accountEmail, "me@example.com");
  assert.deepEqual(
    email.messages.map((message) => [message.senderEmail, message.date]),
    [
      ["me@example.com", "09:00 12 Oct 2026"],
      ["sam@example.com", "10:05 12 Oct 2026"],
    ],
  );
  // Forwarded content in the first message is kept.
  assert.match(
    email.messages[0].body,
    /Forwarded message[\s\S]*Roster attached/,
  );
  // The quoted copy of the earlier message is dropped from the reply.
  assert.equal(email.messages[1].body, "Thanks, confirmed.");
  // The latest message is still the one analysed and replied to.
  assert.equal(email.senderEmail, "sam@example.com");
  assert.match(email.body, /Thanks, confirmed\./);
});

test("replies to the latest message after expanding a thread", async () => {
  const page = createPage(collapsedThreadMarkup);
  expandOnClick(page);
  const { contextId } = await page.read();
  const latest = [...page.document.querySelectorAll(".adn")].at(-1);
  latest.querySelector('[aria-label="Reply"]').onclick = () => {
    latest.insertAdjacentHTML("beforeend", editorMarkup);
  };
  assert.equal((await page.insert(contextId, "Draft")).success, true);
  assert.equal(
    latest.querySelector("[contenteditable]").firstChild.textContent,
    "Draft",
  );
});

test("stops waiting when Expand all loads nothing new", async () => {
  const page = createPage(collapsedThreadMarkup);
  const started = Date.now();
  const email = await page.read();
  assert.equal(email.messages.length, 1);
  assert.ok(Date.now() - started < 4000);
});