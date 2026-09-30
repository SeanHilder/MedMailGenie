// ==================================================
// MedMail Genie
// content.ts
//
// Handles:
// - Reading the currently opened Gmail email
// - Speech-to-text
// - Starting speech recognition
// - Stopping speech recognition manually
// - Sending speech events/results back to popup.ts
// ==================================================


// --------------------------------------------------
// Confirm content script loaded
// --------------------------------------------------

console.log("MedMailGenie content script loaded");



// ==================================================
// Speech Recognition State
// ==================================================

/*
  Keep the active recognition object outside the
  message listener so that it can later be stopped
  by another message from popup.ts.
*/
let activeRecognition: any = null;


/*
  Tracks whether speech recognition is currently
  running.
*/
let isSpeechRecognitionActive = false;



// ==================================================
// Speech Recognition Message Listener
// ==================================================

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {


    // ==================================================
    // START SPEECH RECOGNITION
    // ==================================================

    if (message.type === "START_SPEECH_RECOGNITION") {


      /*
        Prevent multiple speech-recognition sessions
        from running at the same time.
      */
      if (isSpeechRecognitionActive) {

        sendResponse({
          success: false,
          error: "Speech recognition is already running."
        });

        return;
      }



      /*
        Chrome uses webkitSpeechRecognition.

        SpeechRecognition is included as a fallback
        for browsers that expose the standard name.
      */
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;



      /*
        Make sure speech recognition is supported.
      */
      if (!SpeechRecognition) {

        sendResponse({
          success: false,
          error: "Speech recognition is not supported."
        });

        return;
      }



      /*
        Create the speech recognition session.
      */
      const recognition =
        new SpeechRecognition();



      /*
        Save it so STOP_SPEECH_RECOGNITION can
        access the same recognition object.
      */
      activeRecognition =
        recognition;



      // Australian English
      recognition.lang =
        "en-AU";



      /*
        Continuous mode allows the user to speak
        multiple sentences before clicking Stop.
      */
      recognition.continuous =
        true;



      /*
        Only send completed speech results.
      */
      recognition.interimResults =
        false;



      // ==================================================
      // Recognition Started
      // ==================================================

      recognition.onstart = () => {

        console.log(
          "Speech recognition started"
        );


        isSpeechRecognitionActive =
          true;


        /*
          Notify popup.ts.

          This changes the button from:

          🎤 Voice

          to:

          ⏹ Stop Listening
        */
        chrome.runtime.sendMessage({
          type: "SPEECH_STARTED"
        });

      };



      // ==================================================
      // Speech Result
      // ==================================================

      recognition.onresult =
        (event: any) => {

          let transcript = "";


          /*
            Continuous speech recognition may contain
            multiple results.

            Collect all new final results.
          */
          for (
            let i = event.resultIndex;
            i < event.results.length;
            i++
          ) {

            if (event.results[i].isFinal) {

              transcript +=
                event.results[i][0].transcript +
                " ";

            }

          }



          transcript =
            transcript.trim();



          /*
            Ignore empty results.
          */
          if (!transcript) {
            return;
          }



          console.log(
            "Speech transcript:",
            transcript
          );



          /*
            Send recognised speech back to popup.ts.
          */
          chrome.runtime.sendMessage({
            type: "SPEECH_RESULT",
            transcript: transcript
          });

        };



      // ==================================================
      // Speech Recognition Error
      // ==================================================

      recognition.onerror =
        (event: any) => {

          console.log(
            "Speech recognition error:",
            event.error
          );


          isSpeechRecognitionActive =
            false;


          activeRecognition =
            null;



          /*
            Notify popup.ts so that it can reset
            the Voice button.
          */
          chrome.runtime.sendMessage({
            type: "SPEECH_ERROR",
            error: event.error
          });

        };



      // ==================================================
      // Speech Recognition Ended
      // ==================================================

      recognition.onend = () => {

        console.log(
          "Speech recognition ended"
        );


        isSpeechRecognitionActive =
          false;


        activeRecognition =
          null;



        /*
          Tell popup.ts that listening has finished.

          popup.ts will restore:

          🎤 Voice
        */
        chrome.runtime.sendMessage({
          type: "SPEECH_ENDED"
        });

      };



      // ==================================================
      // Start Recognition
      // ==================================================

      try {

        recognition.start();


        /*
          Tell popup.ts that Chrome accepted
          the start request.
        */
        sendResponse({
          success: true
        });

      }

      catch (error) {

        console.error(
          "Could not start speech recognition:",
          error
        );


        isSpeechRecognitionActive =
          false;


        activeRecognition =
          null;


        sendResponse({
          success: false,
          error: "Could not start speech recognition."
        });

      }



      return;
    }



    // ==================================================
    // STOP SPEECH RECOGNITION
    // ==================================================

    if (message.type === "STOP_SPEECH_RECOGNITION") {


      /*
        Make sure recognition actually exists.
      */
      if (
        !activeRecognition ||
        !isSpeechRecognitionActive
      ) {

        sendResponse({
          success: false,
          error: "Speech recognition is not currently running."
        });

        return;
      }



      console.log(
        "Stopping speech recognition..."
      );



      try {

        /*
          stop() lets Chrome process any final speech
          before ending the recognition session.
        */
        activeRecognition.stop();


        sendResponse({
          success: true
        });

      }

      catch (error) {

        console.error(
          "Could not stop speech recognition:",
          error
        );


        sendResponse({
          success: false,
          error: "Could not stop speech recognition."
        });

      }



      return;
    }

  }
);



// ==================================================
// Read Current Gmail Email
// ==================================================

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {


    /*
      Ignore messages unrelated to email reading.
    */
    if (
      message.type !==
      "GET_CURRENT_EMAIL"
    ) {
      return;
    }



    console.log(
      "[MedMailGenie DEBUG] GET_CURRENT_EMAIL received"
    );



    // --------------------------------------------------
    // Gmail Subject
    // --------------------------------------------------

    const subjectElement =
      document.querySelector("h2.hP");



    // --------------------------------------------------
    // Gmail Body
    // --------------------------------------------------

    const bodyElement =
      document.querySelector("div.a3s");



    console.log(
      "[MedMailGenie DEBUG] subjectElement:",
      subjectElement
    );


    console.log(
      "[MedMailGenie DEBUG] bodyElement:",
      bodyElement
    );



    const subject =
      subjectElement
        ?.textContent
        ?.trim() || "";



    const body =
      bodyElement
        ?.textContent
        ?.trim() || "";



    // --------------------------------------------------
    // Gmail Sender
    // --------------------------------------------------

    const senderElement =
      document.querySelector(
        ".gD[email]"
      );



    const senderEmail =
      senderElement
        ?.getAttribute("email") || "";



    const senderName =
      senderElement
        ?.textContent
        ?.trim() || "";



    console.log(
      "[MedMailGenie DEBUG] subject text:",
      subject
    );


    console.log(
      "[MedMailGenie DEBUG] body text:",
      body
    );


    console.log(
      "[MedMailGenie DEBUG] sender:",
      senderName,
      senderEmail
    );



    // --------------------------------------------------
    // No Email Found
    // --------------------------------------------------

    if (
      !subject &&
      !body
    ) {

      sendResponse({
        success: false,
        error:
          "No open email found. Please open an email first."
      });


      return;
    }



    // --------------------------------------------------
    // Return Email Data
    // --------------------------------------------------

    sendResponse({
      success: true,

      subject:
        subject,

      body:
        body,

      senderEmail:
        senderEmail,

      senderName:
        senderName
    });

  }
);