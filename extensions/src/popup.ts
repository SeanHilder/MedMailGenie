// ==================================================
// MedMail Genie
// popup.ts
//
// Handles:
// - Reading the currently opened Gmail email
// - AI email category/topic classification
// - AI email summary
// - Priority classification
// - Task/deadline extraction
// - Suggested reply generation
// - Tone changes
// - Reply regeneration
// - Approval workflow
// - Voice input
// - AI voice punctuation / formatting cleanup
// - Stop Listening
// - Text-to-speech
// - Copy / clear functionality
// ==================================================


// ==================================================
// Backend Configuration
// ==================================================

const BACKEND_URL =
  "http://127.0.0.1:8000";



// ==================================================
// Current Email State
// ==================================================

let currentEmailSubject = "";

let currentEmailBody = "";

let currentEmailSender = "";



// ==================================================
// General State
// ==================================================

let replyApproved =
  false;


let isGeneratingReply =
  false;


let isListening =
  false;


/*
  Stores everything spoken during the current
  voice session.

  We clean the complete transcript rather than
  sending each tiny phrase to Gemini separately.
*/
let currentVoiceTranscript =
  "";



// ==================================================
// Confirm Popup Loaded
// ==================================================

console.log(
  "MedMail Genie popup loaded"
);



// ==================================================
// Retrieve HTML Elements
// ==================================================


// --------------------------------------------------
// Email Information
// --------------------------------------------------

const emailSender =
  document.getElementById(
    "emailSender"
  );


const emailSubject =
  document.getElementById(
    "emailSubject"
  );


const emailBody =
  document.getElementById(
    "emailBody"
  );



// --------------------------------------------------
// AI Analysis
// --------------------------------------------------

const summaryText =
  document.getElementById(
    "summaryText"
  );


const priorityBadge =
  document.querySelector(
    ".badge.priority"
  );


const categoryBadge =
  document.querySelector(
    ".badge.category"
  );


const tasksList =
  document.getElementById(
    "tasksList"
  );

const calendarButtons =
  document.getElementById("calendarButtons");



// --------------------------------------------------
// Suggested Reply
// --------------------------------------------------

const replyBox =
  document.getElementById(
    "replyBox"
  ) as HTMLTextAreaElement | null;


const toneSelect =
  document.getElementById(
    "toneSelect"
  ) as HTMLSelectElement | null;



// --------------------------------------------------
// Buttons
// --------------------------------------------------

const editBtn =
  document.getElementById(
    "editBtn"
  );


const approveBtn =
  document.getElementById(
    "approveBtn"
  );


const regenerateBtn =
  document.getElementById(
    "regenerateBtn"
  ) as HTMLButtonElement | null;


const voiceBtn =
  document.getElementById(
    "voiceBtn"
  ) as HTMLButtonElement | null;


const readBtn =
  document.getElementById(
    "readBtn"
  );


const copyBtn =
  document.getElementById(
    "copyBtn"
  );


const clearBtn =
  document.getElementById(
    "clearBtn"
  );


const submitBtn =
  document.getElementById(
    "submitBtn"
  );



// --------------------------------------------------
// Feedback
// --------------------------------------------------

const feedbackMessage =
  document.getElementById(
    "feedbackMessage"
  );



// ==================================================
// Feedback Helper
// ==================================================

function showFeedback(
  message: string,
  type: "success" | "info" = "info"
) {

  if (!feedbackMessage) {
    return;
  }


  feedbackMessage.textContent =
    message;


  feedbackMessage.className =
    "feedback";


  feedbackMessage.classList.add(
    "show",
    type
  );


  window.setTimeout(
    () => {

      feedbackMessage.classList.remove(
        "show"
      );

    },
    2500
  );

}



// ==================================================
// Approval Helper
// ==================================================

function resetApproval() {

  replyApproved =
    false;


  submitBtn?.classList.remove(
    "show"
  );

}



// ==================================================
// Voice Button Helper
// ==================================================

function setVoiceButtonListening(
  listening: boolean
) {

  isListening =
    listening;


  if (!voiceBtn) {
    return;
  }


  if (listening) {

    voiceBtn.textContent =
      "⏹ Stop Listening";


    voiceBtn.classList.add(
      "listening"
    );

  }

  else {

    voiceBtn.textContent =
      "🎤 Voice";


    voiceBtn.classList.remove(
      "listening"
    );

  }

}



// ==================================================
// Check Current Email
// ==================================================

function hasCurrentEmail():
boolean {

  return Boolean(
    currentEmailSubject.trim() ||
    currentEmailBody.trim()
  );

}



// ==================================================
// Read Current Gmail Email
// ==================================================

function getCurrentEmailFromGmail():
Promise<boolean> {

  return new Promise(
    (resolve) => {

      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },

        (tabs) => {

          const tab =
            tabs[0];


          if (!tab?.id) {

            console.error(
              "MedMail Genie could not find the active tab."
            );


            resolve(false);

            return;
          }



          chrome.scripting.executeScript(
            {
              target: {
                tabId: tab.id
              },

              files: [
                "content.js"
              ]
            },

            () => {

              if (
                chrome.runtime.lastError
              ) {

                console.error(
                  "Could not inject content script:",
                  chrome.runtime.lastError.message
                );


                resolve(false);

                return;
              }



              chrome.tabs.sendMessage(
                tab.id!,
                {
                  type:
                    "GET_CURRENT_EMAIL"
                },

                (response) => {

                  if (
                    chrome.runtime.lastError
                  ) {

                    console.error(
                      "Could not read current Gmail email:",
                      chrome.runtime.lastError.message
                    );


                    resolve(false);

                    return;
                  }



                  if (
                    !response?.success
                  ) {

                    console.error(
                      "No Gmail email was found:",
                      response?.error
                    );


                    resolve(false);

                    return;
                  }



                  currentEmailSubject =
                    response.subject || "";


                  currentEmailBody =
                    response.body || "";



                  if (
                    response.senderName
                  ) {

                    currentEmailSender =
                      response.senderEmail
                        ? `${response.senderName} <${response.senderEmail}>`
                        : response.senderName;

                  }

                  else {

                    currentEmailSender =
                      response.senderEmail || "";

                  }



                  if (emailSubject) {

                    emailSubject.textContent =
                      currentEmailSubject ||
                      "No subject";

                  }



                  if (emailBody) {

                    emailBody.textContent =
                      currentEmailBody ||
                      "No email body found.";

                  }



                  if (emailSender) {

                    emailSender.textContent =
                      currentEmailSender ||
                      "Unknown sender";

                  }



                  console.log(
                    "Current Gmail email loaded:",
                    {
                      subject:
                        currentEmailSubject,

                      sender:
                        currentEmailSender,

                      bodyLength:
                        currentEmailBody.length
                    }
                  );


                  resolve(true);

                }
              );

            }
          );

        }
      );

    }
  );

}



// ==================================================
// Load Category
// ==================================================

async function loadCategory() {

  if (!categoryBadge) {
    return;
  }


  if (!hasCurrentEmail()) {

    categoryBadge.textContent =
      "Unknown";

    return;
  }


  categoryBadge.textContent =
    "Analysing...";


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/classify/category`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            subject:
              currentEmailSubject,

            body:
              currentEmailBody
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Category request failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    categoryBadge.textContent =
      data.category ||
      "Other";

  }

  catch (error) {

    console.error(
      "Failed to classify category:",
      error
    );


    categoryBadge.textContent =
      "Unknown";

  }

}



// ==================================================
// Load AI Summary
// ==================================================

async function loadSummary() {

  if (!summaryText) {
    return;
  }


  if (!hasCurrentEmail()) {

    summaryText.textContent =
      "Open an email to generate a summary.";

    return;
  }


  summaryText.textContent =
    "Generating AI summary...";


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/summarize/email`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            subject:
              currentEmailSubject,

            body:
              currentEmailBody
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Summary request failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    summaryText.textContent =
      data.summary ||
      "No summary was generated.";

  }

  catch (error) {

    console.error(
      "Failed to load summary:",
      error
    );


    summaryText.textContent =
      "Could not generate the AI summary.";

  }

}



// ==================================================
// Load Priority
// ==================================================

async function loadPriority() {

  if (!priorityBadge) {
    return;
  }


  if (!hasCurrentEmail()) {

    priorityBadge.textContent =
      "Unknown";

    return;
  }


  priorityBadge.textContent =
    "Analysing...";


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/classify/priority`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            subject:
              currentEmailSubject,

            body:
              currentEmailBody
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Priority request failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    priorityBadge.textContent =
      data.priority ||
      "Unknown";


    priorityBadge.classList.remove(
      "priority-high",
      "priority-medium",
      "priority-low"
    );


    const priority =
      String(
        data.priority || ""
      ).toLowerCase();


    if (priority === "high") {

      priorityBadge.classList.add(
        "priority-high"
      );

    }

    else if (
      priority === "medium"
    ) {

      priorityBadge.classList.add(
        "priority-medium"
      );

    }

    else if (
      priority === "low"
    ) {

      priorityBadge.classList.add(
        "priority-low"
      );

    }

  }

  catch (error) {

    console.error(
      "Failed to load priority:",
      error
    );


    priorityBadge.textContent =
      "Unknown";

  }

}



// ==================================================
// Load Tasks
// ==================================================
function buildGoogleCalendarLink(
  title: string,
  startIso: string,
  endIso: string
): string {

  const formatForCalendar = (
    iso: string
  ) =>
    iso
      .replace(/[-:]/g, "")
      .split(".")[0];


  const start =
    formatForCalendar(startIso);


  const end =
    formatForCalendar(endIso);


  const params =
    new URLSearchParams({
      action: "TEMPLATE",
      text: title,
      dates: `${start}/${end}`
    });


  return `https://calendar.google.com/calendar/render?${params.toString()}`;

}

async function loadTasks() {

  if (!tasksList) {
    return;
  }


  if (calendarButtons) {
    calendarButtons.innerHTML = "";
  }


  if (!hasCurrentEmail()) {

    tasksList.textContent =
      "Open an email to extract tasks.";

    return;
  }


  tasksList.textContent =
    "Analysing tasks and deadlines...";


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/extract/tasks`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            subject:
              currentEmailSubject,

            body:
              currentEmailBody
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Task request failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    const tasks: string[] =
      Array.isArray(data.tasks)
        ? data.tasks
        : [];


    const deadlines: string[] =
      Array.isArray(data.deadlines)
        ? data.deadlines
        : [];


    const meetings: string[] =
      Array.isArray(data.meeting_times)
        ? data.meeting_times
        : [];


    const calendarEvents =
      Array.isArray(data.calendar_events)
        ? data.calendar_events
        : [];


    const allItems = [

      ...tasks.map(
        (task: string) =>
          `Task: ${task}`
      ),

      ...deadlines.map(
        (deadline: string) =>
          `Deadline: ${deadline}`
      ),

      ...meetings.map(
        (meeting: string) =>
          `Meeting: ${meeting}`
      )

    ];


    if (
      allItems.length === 0
    ) {

      tasksList.textContent =
        "No tasks, deadlines, or meetings found.";

    }

    else {

      tasksList.innerHTML =
        "";


      allItems.forEach(
        (item) => {

          const listItem =
            document.createElement(
              "li"
            );


          listItem.textContent =
            item;


          tasksList.appendChild(
            listItem
          );

        }
      );

    }


    // --------------------------------------------------
    // Google Calendar Events
    // --------------------------------------------------

    if (
      calendarButtons &&
      calendarEvents.length > 0
    ) {

      calendarEvents.forEach(
        (event: {
          title?: string;
          start?: string;
          end?: string;
        }) => {

          if (
            !event.title ||
            !event.start ||
            !event.end
          ) {
            return;
          }


          const button =
            document.createElement(
              "button"
            );


          button.className =
            "utility-button";


          button.textContent =
            `📅 Add "${event.title}" to Calendar`;


          button.style.width =
            "100%";


          button.addEventListener(
            "click",
            () => {

              const link =
                buildGoogleCalendarLink(
                  event.title!,
                  event.start!,
                  event.end!
                );


              chrome.tabs.create({
                url: link
              });

            }
          );


          calendarButtons.appendChild(
            button
          );

        }
      );

    }

  }

  catch (error) {

    console.error(
      "Failed to load tasks:",
      error
    );


    tasksList.textContent =
      "Could not extract tasks or deadlines.";


    if (calendarButtons) {
      calendarButtons.innerHTML = "";
    }

  }

}



// ==================================================
// Generate Suggested Reply
// ==================================================

async function generateDraftReply(
  showFeedbackMessages:
    boolean = true
) {

  if (!replyBox) {
    return;
  }


  if (!hasCurrentEmail()) {

    replyBox.value =
      "Open an email before generating a reply.";


    return;
  }


  if (isGeneratingReply) {
    return;
  }


  isGeneratingReply =
    true;


  const selectedTone =
    toneSelect?.value ||
    "professional";


  resetApproval();


  if (
    showFeedbackMessages
  ) {

    showFeedback(
      `Generating ${selectedTone} reply...`,
      "info"
    );

  }


  const previousButtonText =
    regenerateBtn?.textContent;


  if (regenerateBtn) {

    regenerateBtn.disabled =
      true;


    regenerateBtn.textContent =
      "Generating...";

  }


  replyBox.value =
    "Generating suggested reply...";


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/draft/generate`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            subject:
              currentEmailSubject,

            body:
              currentEmailBody,

            tone:
              selectedTone
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Draft request failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    replyBox.value =
      data.draft_reply ||
      "No suggested reply was generated.";


    if (
      showFeedbackMessages
    ) {

      showFeedback(
        `${selectedTone} reply generated.`,
        "success"
      );

    }

  }

  catch (error) {

    console.error(
      "Failed to generate reply:",
      error
    );


    replyBox.value =
      "Could not generate a suggested reply.";


    if (
      showFeedbackMessages
    ) {

      showFeedback(
        "Could not generate reply. Check that the backend is running.",
        "info"
      );

    }

  }

  finally {

    isGeneratingReply =
      false;


    if (regenerateBtn) {

      regenerateBtn.disabled =
        false;


      regenerateBtn.textContent =
        previousButtonText ||
        "Regenerate Reply";

    }

  }

}



// ==================================================
// AI Voice Transcript Cleanup
// ==================================================

async function cleanVoiceTranscript(
  transcript: string
): Promise<string> {

  const trimmedTranscript =
    transcript.trim();


  if (!trimmedTranscript) {

    return "";

  }


  console.log(
    "Sending voice transcript for cleanup:",
    trimmedTranscript
  );


  try {

    const response =
      await fetch(
        `${BACKEND_URL}/voice/cleanup`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            transcript:
              trimmedTranscript
          })
        }
      );


    if (!response.ok) {

      const errorText =
        await response.text();


      throw new Error(
        `Voice cleanup failed (${response.status}): ${errorText}`
      );

    }


    const data =
      await response.json();


    const cleanedText =
      String(
        data.cleaned_text || ""
      ).trim();


    console.log(
      "Cleaned voice transcript:",
      cleanedText
    );


    /*
      If Gemini unexpectedly gives us an empty
      response, keep the raw transcript.
    */
    return (
      cleanedText ||
      trimmedTranscript
    );

  }

  catch (error) {

    console.error(
      "Voice cleanup failed:",
      error
    );


    /*
      Voice dictation should still be usable even
      if AI cleanup fails.
    */
    return trimmedTranscript;

  }

}



// ==================================================
// Analyse Current Email
// ==================================================

async function analyseCurrentEmail() {

  await Promise.all([

    loadCategory(),

    loadSummary(),

    loadPriority(),

    loadTasks(),

    generateDraftReply(false)

  ]);

}



// ==================================================
// Initialise Popup
// ==================================================

async function initialisePopup() {

  console.log(
    "Reading currently opened Gmail email..."
  );


  setVoiceButtonListening(
    false
  );


  if (categoryBadge) {

    categoryBadge.textContent =
      "Loading...";

  }


  if (summaryText) {

    summaryText.textContent =
      "Reading current email...";

  }


  if (tasksList) {

    tasksList.textContent =
      "Reading current email...";

  }


  if (priorityBadge) {

    priorityBadge.textContent =
      "Loading...";

  }


  if (replyBox) {

    replyBox.value =
      "Reading current email...";

  }


  const emailFound =
    await getCurrentEmailFromGmail();


  if (!emailFound) {

    if (categoryBadge) {

      categoryBadge.textContent =
        "Unknown";

    }


    if (summaryText) {

      summaryText.textContent =
        "Open a Gmail email and reopen MedMail Genie.";

    }


    if (tasksList) {

      tasksList.textContent =
        "No email detected.";

    }


    if (priorityBadge) {

      priorityBadge.textContent =
        "Unknown";

    }


    if (replyBox) {

      replyBox.value =
        "Open a Gmail email to generate a suggested reply.";

    }


    return;
  }


  await analyseCurrentEmail();


  console.log(
    "MedMail Genie analysis complete."
  );

}



// ==================================================
// Manual Reply Editing
// ==================================================

replyBox?.addEventListener(
  "input",
  () => {

    if (replyApproved) {

      resetApproval();


      showFeedback(
        "Reply changed. Please approve the updated reply again.",
        "info"
      );

    }

  }
);



// ==================================================
// Edit
// ==================================================

editBtn?.addEventListener(
  "click",
  () => {

    replyBox?.focus();


    if (replyApproved) {

      resetApproval();

    }


    showFeedback(
      "You can now edit the suggested reply.",
      "info"
    );

  }
);



// ==================================================
// Approve
// ==================================================

approveBtn?.addEventListener(
  "click",
  () => {

    if (
      !replyBox ||
      !replyBox.value.trim()
    ) {

      showFeedback(
        "The reply is empty. Add some text before approving.",
        "info"
      );


      return;
    }


    replyApproved =
      true;


    submitBtn?.classList.add(
      "show"
    );


    showFeedback(
      "Reply approved. You can now submit it.",
      "success"
    );

  }
);



// ==================================================
// Submit
// ==================================================

submitBtn?.addEventListener(
  "click",
  () => {

    if (!replyApproved) {

      showFeedback(
        "Please approve the reply before submitting it.",
        "info"
      );


      return;
    }


    if (
      !replyBox ||
      !replyBox.value.trim()
    ) {

      showFeedback(
        "There is no reply to submit.",
        "info"
      );


      return;
    }


    console.log(
      "Approved reply submitted:",
      replyBox.value
    );


    showFeedback(
      "Reply submitted successfully.",
      "success"
    );

  }
);



// ==================================================
// Regenerate
// ==================================================

regenerateBtn?.addEventListener(
  "click",
  async () => {

    resetApproval();


    await generateDraftReply(
      true
    );

  }
);



// ==================================================
// Tone
// ==================================================

toneSelect?.addEventListener(
  "change",
  async () => {

    resetApproval();


    const selectedTone =
      toneSelect.value;


    showFeedback(
      `Changing reply tone to ${selectedTone}...`,
      "info"
    );


    await generateDraftReply(
      false
    );


    showFeedback(
      `Reply changed to ${selectedTone} tone.`,
      "success"
    );

  }
);



// ==================================================
// Voice Button
// ==================================================

voiceBtn?.addEventListener(
  "click",
  () => {

    chrome.tabs.query(
      {
        active: true,
        currentWindow: true
      },

      (tabs) => {

        const tab =
          tabs[0];


        if (!tab?.id) {

          showFeedback(
            "Could not find the current tab.",
            "info"
          );


          return;
        }



        chrome.scripting.executeScript(
          {
            target: {
              tabId: tab.id
            },

            files: [
              "content.js"
            ]
          },

          () => {

            if (
              chrome.runtime.lastError
            ) {

              console.error(
                "Could not inject content script:",
                chrome.runtime.lastError.message
              );


              showFeedback(
                "Could not access this page.",
                "info"
              );


              return;
            }



            // ==========================================
            // Stop Listening
            // ==========================================

            if (isListening) {

              showFeedback(
                "Finishing voice input...",
                "info"
              );


              chrome.tabs.sendMessage(
                tab.id!,
                {
                  type:
                    "STOP_SPEECH_RECOGNITION"
                },

                (response) => {

                  if (
                    chrome.runtime.lastError
                  ) {

                    console.error(
                      "Could not stop speech recognition:",
                      chrome.runtime.lastError.message
                    );


                    setVoiceButtonListening(
                      false
                    );


                    showFeedback(
                      "Could not stop voice input.",
                      "info"
                    );


                    return;
                  }


                  if (!response?.success) {

                    setVoiceButtonListening(
                      false
                    );


                    showFeedback(
                      response?.error ||
                      "Voice input is not currently running.",
                      "info"
                    );

                  }

                }
              );


              return;
            }



            // ==========================================
            // Start New Voice Session
            // ==========================================

            currentVoiceTranscript =
              "";


            chrome.tabs.sendMessage(
              tab.id!,
              {
                type:
                  "START_SPEECH_RECOGNITION"
              },

              (response) => {

                if (
                  chrome.runtime.lastError
                ) {

                  console.error(
                    "Could not communicate with content script:",
                    chrome.runtime.lastError.message
                  );


                  setVoiceButtonListening(
                    false
                  );


                  showFeedback(
                    "Could not start voice input.",
                    "info"
                  );


                  return;
                }


                if (
                  response?.success
                ) {

                  setVoiceButtonListening(
                    true
                  );


                  showFeedback(
                    "Listening... Speak your reply.",
                    "info"
                  );

                }

                else {

                  setVoiceButtonListening(
                    false
                  );


                  showFeedback(
                    response?.error ||
                    "Could not start voice input.",
                    "info"
                  );

                }

              }
            );

          }
        );

      }
    );

  }
);



// ==================================================
// Receive Speech Events
// ==================================================

chrome.runtime.onMessage.addListener(
  (message) => {


    // --------------------------------------------------
    // Speech Started
    // --------------------------------------------------

    if (
      message.type ===
      "SPEECH_STARTED"
    ) {

      setVoiceButtonListening(
        true
      );


      return;
    }



    // --------------------------------------------------
    // Raw Speech Result
    // --------------------------------------------------

    if (
      message.type ===
      "SPEECH_RESULT"
    ) {

      const transcript =
        String(
          message.transcript || ""
        ).trim();


      if (!transcript) {
        return;
      }


      console.log(
        "Raw speech received:",
        transcript
      );


      /*
        Add this piece of recognised speech to
        everything spoken during the current session.
      */
      currentVoiceTranscript =
        currentVoiceTranscript
          ? `${currentVoiceTranscript} ${transcript}`
          : transcript;


      /*
        Show the raw transcription immediately.

        This gives the user instant feedback while
        they are speaking.
      */
      if (replyBox) {

        replyBox.value =
          currentVoiceTranscript;


        resetApproval();

      }


      return;
    }



    // --------------------------------------------------
    // Speech Ended
    // --------------------------------------------------

    if (
      message.type ===
      "SPEECH_ENDED"
    ) {

      console.log(
        "Speech recognition finished."
      );


      setVoiceButtonListening(
        false
      );


      /*
        Keep a local copy because another voice
        session could reset currentVoiceTranscript.
      */
      const transcriptToClean =
        currentVoiceTranscript.trim();


      if (!transcriptToClean) {

        showFeedback(
          "Voice input finished. No speech was detected.",
          "info"
        );


        return;
      }


      /*
        Show the user that Gemini is now adding
        punctuation and formatting.
      */
      if (replyBox) {

        replyBox.value =
          transcriptToClean;

      }


      showFeedback(
        "Voice captured. Adding punctuation and formatting...",
        "info"
      );


      /*
        Run asynchronously without blocking the
        Chrome runtime message listener.
      */
      void (
        async () => {

          const cleanedText =
            await cleanVoiceTranscript(
              transcriptToClean
            );


          if (replyBox) {

            replyBox.value =
              cleanedText;


            resetApproval();

          }


          showFeedback(
            "Voice reply formatted and ready to review.",
            "success"
          );

        }
      )();


      return;
    }



    // --------------------------------------------------
    // Speech Error
    // --------------------------------------------------

    if (
      message.type ===
      "SPEECH_ERROR"
    ) {

      console.error(
        "Speech recognition error:",
        message.error
      );


      setVoiceButtonListening(
        false
      );


      /*
        If some speech was already captured before
        the error, preserve it.
      */
      if (
        replyBox &&
        currentVoiceTranscript.trim()
      ) {

        replyBox.value =
          currentVoiceTranscript.trim();

      }


      showFeedback(
        `Speech error: ${message.error}`,
        "info"
      );


      return;
    }

  }
);



// ==================================================
// Read Aloud
// ==================================================

readBtn?.addEventListener(
  "click",
  () => {

    if (
      !replyBox ||
      !replyBox.value.trim()
    ) {

      showFeedback(
        "There is no reply to read aloud.",
        "info"
      );


      return;
    }


    const speech =
      new SpeechSynthesisUtterance(
        replyBox.value
      );


    window.speechSynthesis.cancel();


    window.speechSynthesis.speak(
      speech
    );


    showFeedback(
      "Reading the suggested reply aloud.",
      "info"
    );

  }
);



// ==================================================
// Copy
// ==================================================

copyBtn?.addEventListener(
  "click",
  async () => {

    if (
      !replyBox ||
      !replyBox.value.trim()
    ) {

      showFeedback(
        "There is no reply to copy.",
        "info"
      );


      return;
    }


    try {

      await navigator.clipboard.writeText(
        replyBox.value
      );


      showFeedback(
        "Reply copied to clipboard.",
        "success"
      );

    }

    catch (error) {

      console.error(
        "Unable to copy reply:",
        error
      );


      showFeedback(
        "Could not copy the reply.",
        "info"
      );

    }

  }
);



// ==================================================
// Clear
// ==================================================

clearBtn?.addEventListener(
  "click",
  () => {

    resetApproval();


    currentVoiceTranscript =
      "";


    if (replyBox) {

      replyBox.value =
        "";


      replyBox.focus();

    }


    showFeedback(
      "Suggested reply cleared.",
      "info"
    );

  }
);



// ==================================================
// Start MedMail Genie
// ==================================================

initialisePopup();