// Confirms that the MedMailGenie popup script loaded correctly
console.log("MedMailGenie popup loaded");


// --------------------------------------------------
// Retrieve HTML elements
// --------------------------------------------------

// Suggested reply box
const replyBox =
  document.getElementById("replyBox") as HTMLTextAreaElement | null;

// Tone selection dropdown
const toneSelect =
  document.getElementById("toneSelect") as HTMLSelectElement | null;

// Main buttons
const editBtn =
  document.getElementById("editBtn");

const approveBtn =
  document.getElementById("approveBtn");

const regenerateBtn =
  document.getElementById("regenerateBtn");

const voiceBtn =
  document.getElementById("voiceBtn");

const readBtn =
  document.getElementById("readBtn");

const copyBtn =
  document.getElementById("copyBtn");

const clearBtn =
  document.getElementById("clearBtn");

// Submit button
const submitBtn =
  document.getElementById("submitBtn");

// Feedback message area
const feedbackMessage =
  document.getElementById("feedbackMessage");


// --------------------------------------------------
// Approval state
// --------------------------------------------------

/*
  Keeps track of whether the current version
  of the reply has been approved.

  If the reply changes after approval,
  this becomes false again.
*/
let replyApproved = false;


// --------------------------------------------------
// Helper function for feedback messages
// --------------------------------------------------

function showFeedback(
  message: string,
  type: "success" | "info" = "info"
) {

  if (!feedbackMessage) {
    return;
  }


  // Set feedback text
  feedbackMessage.textContent = message;


  // Reset previous classes
  feedbackMessage.className = "feedback";


  // Add the correct feedback style
  feedbackMessage.classList.add(
    "show",
    type
  );


  // Hide the feedback after 2.5 seconds
  window.setTimeout(() => {

    feedbackMessage.classList.remove("show");

  }, 2500);

}


// --------------------------------------------------
// Helper function to remove approval
// --------------------------------------------------

function resetApproval() {

  /*
    The current reply is no longer considered
    approved if the user changes it.
  */
  replyApproved = false;


  /*
    Hide the Submit Reply button.
  */
  submitBtn?.classList.remove("show");

}


// --------------------------------------------------
// Detect manual edits
// --------------------------------------------------

replyBox?.addEventListener("input", () => {

  /*
    If the user modifies the reply after it was
    approved, approval must be performed again.
  */
  if (replyApproved) {

    resetApproval();

    showFeedback(
      "Reply changed. Please approve the updated reply again.",
      "info"
    );

  }

});


// --------------------------------------------------
// Edit button
// --------------------------------------------------

editBtn?.addEventListener("click", () => {

  /*
    Place the cursor inside the reply box.
  */
  replyBox?.focus();


  /*
    Editing means the previous approval
    should no longer be valid.
  */
  if (replyApproved) {
    resetApproval();
  }


  showFeedback(
    "You can now edit the suggested reply.",
    "info"
  );

});


// --------------------------------------------------
// Approve button
// --------------------------------------------------

approveBtn?.addEventListener("click", () => {

  /*
    Prevent approval when the reply is empty.
  */
  if (!replyBox || !replyBox.value.trim()) {

    showFeedback(
      "The reply is empty. Add some text before approving.",
      "info"
    );

    return;

  }


  /*
    Mark the current reply as approved.
  */
  replyApproved = true;


  /*
    Show the Submit Reply button.
  */
  submitBtn?.classList.add("show");


  showFeedback(
    "Reply approved. You can now submit it.",
    "success"
  );

});


// --------------------------------------------------
// Submit Reply button
// --------------------------------------------------

submitBtn?.addEventListener("click", () => {

  /*
    Safety check:
    only allow submission if the current reply
    has actually been approved.
  */
  if (!replyApproved) {

    showFeedback(
      "Please approve the reply before submitting it.",
      "info"
    );

    return;

  }


  /*
    Make sure the reply still contains text.
  */
  if (!replyBox || !replyBox.value.trim()) {

    showFeedback(
      "There is no reply to submit.",
      "info"
    );

    return;

  }


  /*
    Prototype behaviour.

    Later, this is where MedMailGenie can
    communicate with Gmail to insert or send
    the approved reply.
  */
  console.log(
    "Approved reply submitted:",
    replyBox.value
  );


  showFeedback(
    "Reply submitted successfully.",
    "success"
  );

});


// --------------------------------------------------
// Regenerate Reply button
// --------------------------------------------------

regenerateBtn?.addEventListener("click", () => {

  /*
    Any regenerated reply is a new response,
    so previous approval must be removed.
  */
  resetApproval();


  /*
    Temporary prototype reply.

    Later this will call your backend / LLM.
  */
  if (replyBox) {

    replyBox.value =
`Hi Sarah,

Thank you for getting in touch. Tuesday works well for me.

Please let me know your preferred meeting time and I will confirm my availability.

Kind regards,`;

  }


  showFeedback(
    "A new suggested reply has been generated.",
    "success"
  );

});


// --------------------------------------------------
// Tone selection
// --------------------------------------------------

toneSelect?.addEventListener("change", () => {

  /*
    A tone change may eventually generate
    a different version of the response.

    Therefore approval should be removed.
  */
  resetApproval();


  const selectedTone =
    toneSelect.value;


  console.log(
    "Selected tone:",
    selectedTone
  );


  showFeedback(
    `Tone changed to ${selectedTone}. Please review and approve the reply again.`,
    "info"
  );

});

// --------------------------------------------------
// Voice button
// --------------------------------------------------

voiceBtn?.addEventListener("click", () => {

  /*
    Find the currently active tab.
  */
  chrome.tabs.query(
    {
      active: true,
      currentWindow: true
    },
    (tabs) => {

      const tab = tabs[0];
      console.log("POPUP TAB:", tab);

      /*
        Make sure a tab is available.
      */
      if (!tab?.id) {

        showFeedback(
          "Could not find the current tab.",
          "info"
        );

        return;
      }


      /*
        Ask content.ts to start
        speech recognition.
      */
chrome.scripting.executeScript(
  {
    target: { tabId: tab.id },
    files: ["content.js"]
  },
  () => {

    if (chrome.runtime.lastError) {

      console.log(
        "Could not inject content script:",
        chrome.runtime.lastError.message
      );

      showFeedback(
        "Could not access this page.",
        "info"
      );

      return;
    }


    chrome.tabs.sendMessage(
      tab.id!,
      {
        type: "START_SPEECH_RECOGNITION"
      },
      (response) => {

        if (chrome.runtime.lastError) {

          console.log(
            "Could not communicate with content script:",
            chrome.runtime.lastError.message
          );

          showFeedback(
            "Could not start voice input.",
            "info"
          );

          return;
        }


        if (response?.success) {

          showFeedback(
            "Listening... Speak now.",
            "info"
          );

        }

      }
    );

  }
);

    }
  );

});


// --------------------------------------------------
// Receive speech-to-text result
// --------------------------------------------------

chrome.runtime.onMessage.addListener((message) => {

  /*
    Receive the transcript from content.ts.
  */
  if (message.type === "SPEECH_RESULT") {

    console.log(
      "Received transcript:",
      message.transcript
    );


    /*
      Put the transcript into
      the suggested reply box.
    */
    if (replyBox) {

      replyBox.value =
        message.transcript;

      resetApproval();

    }


    showFeedback(
      "Voice input finished.",
      "success"
    );

  }


  /*
    Receive speech recognition errors.
  */
  if (message.type === "SPEECH_ERROR") {

    console.log(
      "Received speech error:",
      message.error
    );


    showFeedback(
      `Speech error: ${message.error}`,
      "info"
    );

  }

});

// --------------------------------------------------
// Read Aloud button
// --------------------------------------------------

readBtn?.addEventListener("click", () => {

  /*
    Make sure there is text available.
  */
  if (!replyBox || !replyBox.value.trim()) {

    showFeedback(
      "There is no reply to read aloud.",
      "info"
    );

    return;

  }


  /*
    Creates the speech object.
  */
  const speech =
    new SpeechSynthesisUtterance(
      replyBox.value
    );


  /*
    Stop anything already being spoken.
  */
  window.speechSynthesis.cancel();


  /*
    Read the suggested reply aloud.
  */
  window.speechSynthesis.speak(
    speech
  );


  showFeedback(
    "Reading the suggested reply aloud.",
    "info"
  );

});


// --------------------------------------------------
// Copy Reply button
// --------------------------------------------------

copyBtn?.addEventListener("click", async () => {

  /*
    Make sure there is text to copy.
  */
  if (!replyBox || !replyBox.value.trim()) {

    showFeedback(
      "There is no reply to copy.",
      "info"
    );

    return;

  }


  try {

    /*
      Copy the reply into the clipboard.
    */
    await navigator.clipboard.writeText(
      replyBox.value
    );


    showFeedback(
      "Reply copied to clipboard.",
      "success"
    );

  } catch (error) {

    console.error(
      "Unable to copy reply:",
      error
    );


    showFeedback(
      "Could not copy the reply.",
      "info"
    );

  }

});


// --------------------------------------------------
// Clear button
// --------------------------------------------------

clearBtn?.addEventListener("click", () => {

  /*
    Clearing the response invalidates
    any previous approval.
  */
  resetApproval();


  if (replyBox) {

    replyBox.value = "";

    replyBox.focus();

  }


  showFeedback(
    "Suggested reply cleared.",
    "info"
  );

});