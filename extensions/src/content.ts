// Confirms that the MedMailGenie content script loaded correctly
console.log("MedMailGenie content script loaded");


// --------------------------------------------------
// Speech-to-text
// --------------------------------------------------

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.type !== "START_SPEECH_RECOGNITION") {
      return;
    }


    /*
      Get the browser's speech recognition API.
    */
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;


    /*
      Check whether speech recognition is available.
    */
    if (!SpeechRecognition) {

      sendResponse({
        success: false,
        error: "Speech recognition is not supported."
      });

      return;
    }


    /*
      Create a new speech recognition session.
    */
    const recognition =
      new SpeechRecognition();


    recognition.lang = "en-AU";
    recognition.continuous = false;
    recognition.interimResults = false;


    /*
      Speech recognition has started.
    */
    recognition.onstart = () => {

      console.log(
        "Speech recognition started"
      );

    };


    /*
      Speech has been converted into text.
    */
    recognition.onresult = (event: any) => {

      const transcript =
        event.results[0][0].transcript;


      console.log(
        "Speech transcript:",
        transcript
      );


      /*
        Send the transcript back to the popup.
      */
      chrome.runtime.sendMessage({
        type: "SPEECH_RESULT",
        transcript: transcript
      });

    };


    /*
      Handle speech recognition errors.
    */
    recognition.onerror = (event: any) => {

      console.log(
        "Speech recognition error:",
        event.error
      );


      chrome.runtime.sendMessage({
        type: "SPEECH_ERROR",
        error: event.error
      });

    };


    /*
      Speech recognition has finished.
    */
    recognition.onend = () => {

      console.log(
        "Speech recognition ended"
      );

    };


    /*
      Start listening.
    */
    recognition.start();


    /*
      Tell popup that recognition started.
    */
    sendResponse({
      success: true
    });

  }
);