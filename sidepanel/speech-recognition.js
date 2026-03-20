function createSpeechRecognitionController(config = {}) {
  const permissionStorageKey = "uaMicrophonePermissionGranted";
  const inputId = config.inputId || "nlweb-query";
  const micId = config.micId || "nlweb-mic";
  const statusId = config.statusId || "nlweb-stt-status";
  const language = config.language || "en-US";

  let speechRecognition = null;
  let speechRecognitionSupported = false;
  let speechShouldKeepListening = false;
  let speechIsListening = false;
  let speechBaseInput = "";
  let speechFinalTranscript = "";
  let speechSessionId = 0;
  let microphonePermissionGranted = false;

  function getInput() {
    return document.getElementById(inputId);
  }

  function getMic() {
    return document.getElementById(micId);
  }

  function getStatus() {
    return document.getElementById(statusId);
  }

  function updateSpeechStatus(message, isError = false) {
    const status = getStatus();
    if (!status) return;

    status.textContent = message || "";
    status.classList.toggle("error", isError);
  }

  function updateMicButtonUi() {
    const mic = getMic();
    if (!mic) return;

    mic.classList.toggle("listening", speechIsListening);
    mic.setAttribute("aria-pressed", speechIsListening ? "true" : "false");
    mic.setAttribute(
      "aria-label",
      speechIsListening ? "Stop voice input" : "Start voice input",
    );
    mic.textContent = speechIsListening ? "Stop" : "Mic";
  }

  function buildSpeechInputValue(finalTranscript, interimTranscript = "") {
    const combined = [finalTranscript, interimTranscript]
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!combined) {
      return speechBaseInput;
    }

    return speechBaseInput ? `${speechBaseInput} ${combined}` : combined;
  }

  function getSpeechAlternativeTranscript(result) {
    const alt =
      result?.[0] ||
      (typeof result?.item === "function" ? result.item(0) : null);
    return alt?.transcript?.trim() || "";
  }

  function extractSpeechTranscripts(results) {
    let finalTranscript = "";
    let interimTranscript = "";

    for (let i = 0; i < results.length; i += 1) {
      const result = results[i];
      const transcript = getSpeechAlternativeTranscript(result);
      if (!transcript) continue;

      if (result.isFinal) {
        finalTranscript = [finalTranscript, transcript]
          .filter(Boolean)
          .join(" ")
          .trim();
      } else {
        interimTranscript = [interimTranscript, transcript]
          .filter(Boolean)
          .join(" ")
          .trim();
      }
    }

    return { finalTranscript, interimTranscript };
  }

  function start() {
    if (!speechRecognition || speechIsListening) return;

    const input = getInput();
    if (!input || input.disabled) return;

    speechSessionId += 1;
    speechBaseInput = input.value.trim();
    speechFinalTranscript = "";
    speechShouldKeepListening = true;

    console.log("[stt] start requested", {
      sessionId: speechSessionId,
      baseInputLength: speechBaseInput.length,
      lang: speechRecognition.lang,
      continuous: speechRecognition.continuous,
      interimResults: speechRecognition.interimResults,
    });

    try {
      speechRecognition.start();
    } catch {
      speechShouldKeepListening = false;
      console.log("[stt] failed to start recognition", {
        sessionId: speechSessionId,
      });
      updateSpeechStatus("Unable to start voice input right now.", true);
    }
  }

  function loadPermissionFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get([permissionStorageKey], (result) => {
        if (chrome.runtime.lastError) {
          console.log("[stt] failed to read permission storage", {
            message: chrome.runtime.lastError.message,
          });
          resolve(false);
          return;
        }

        resolve(Boolean(result[permissionStorageKey]));
      });
    });
  }

  function savePermissionToStorage(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set(
        { [permissionStorageKey]: Boolean(value) },
        () => {
          resolve();
        },
      );
    });
  }

  async function syncPermissionState() {
    microphonePermissionGranted = await loadPermissionFromStorage();
    console.log("[stt] synced permission from storage", {
      granted: microphonePermissionGranted,
    });
    return microphonePermissionGranted;
  }

  function openMicrophoneSetupTab() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "OPEN_MIC_SETUP_TAB" }, (response) => {
        if (chrome.runtime.lastError) {
          console.log("[stt] failed to open setup tab", {
            message: chrome.runtime.lastError.message,
          });
          resolve({ ok: false });
          return;
        }

        console.log("[stt] setup tab response", response || {});
        resolve(response || { ok: true });
      });
    });
  }

  async function ensureMicrophonePermissionViaSetupTab() {
    const granted = await syncPermissionState();
    if (granted) {
      return true;
    }

    updateSpeechStatus(
      "Enable microphone in the setup tab. Opening setup now...",
      true,
    );
    await openMicrophoneSetupTab();
    return false;
  }

  function stop() {
    if (!speechRecognition) return;
    speechShouldKeepListening = false;

    console.log("[stt] stop requested", {
      sessionId: speechSessionId,
      isListening: speechIsListening,
    });

    if (speechIsListening) {
      speechRecognition.stop();
    }
  }

  function setDisabled(disabled) {
    const mic = getMic();
    if (!mic) return;
    mic.disabled = Boolean(disabled) || !speechRecognitionSupported;
  }

  function isListening() {
    return speechShouldKeepListening || speechIsListening;
  }

  function isSupported() {
    return speechRecognitionSupported;
  }

  function init() {
    const SpeechRecognitionApi =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const mic = getMic();

    if (!mic) return;

    if (!SpeechRecognitionApi) {
      speechRecognitionSupported = false;
      mic.disabled = true;
      updateSpeechStatus("Voice input is not supported in this browser.", true);
      updateMicButtonUi();
      return;
    }

    speechRecognitionSupported = true;
    speechRecognition = new SpeechRecognitionApi();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = language;

    console.log("[stt] recognition initialized", {
      api: SpeechRecognitionApi.name || "unknown",
      lang: speechRecognition.lang,
      continuous: speechRecognition.continuous,
      interimResults: speechRecognition.interimResults,
    });

    mic.disabled = false;
    updateMicButtonUi();

    speechRecognition.addEventListener("start", () => {
      speechIsListening = true;
      console.log("[stt] start event", {
        sessionId: speechSessionId,
        shouldKeepListening: speechShouldKeepListening,
      });
      updateMicButtonUi();
      updateSpeechStatus("Listening... click Stop when done.");
    });

    speechRecognition.addEventListener("speechstart", () => {
      console.log("[stt] speechstart event", { sessionId: speechSessionId });
      updateSpeechStatus("Speech detected... transcribing.");
    });

    speechRecognition.addEventListener("nomatch", () => {
      console.log("[stt] nomatch event", { sessionId: speechSessionId });
      updateSpeechStatus(
        "Could not recognize that speech. Try speaking more clearly.",
        true,
      );
    });

    speechRecognition.addEventListener("result", (event) => {
      const input = getInput();
      if (!input) return;

      const { finalTranscript, interimTranscript } = extractSpeechTranscripts(
        event.results,
      );
      speechFinalTranscript = finalTranscript;

      const nextValue = buildSpeechInputValue(
        speechFinalTranscript,
        interimTranscript,
      );
      input.value = nextValue;

      console.log("[stt] result event", {
        sessionId: speechSessionId,
        resultIndex: event.resultIndex,
        resultsLength: event.results?.length,
        finalTranscriptLength: speechFinalTranscript.length,
        interimTranscriptLength: interimTranscript.length,
        nextValueLength: nextValue.length,
        preview: nextValue.slice(0, 80),
      });

      updateSpeechStatus(
        nextValue ?
          "Listening... transcribing your voice."
        : "Speech detected, but no transcript text yet.",
      );
      input.focus();
    });

    speechRecognition.addEventListener("error", (event) => {
      const code = event.error || "unknown";
      console.log("[stt] error event", {
        sessionId: speechSessionId,
        code,
        message: event.message || "",
      });

      if (
        code === "not-allowed" ||
        code === "service-not-allowed" ||
        code === "audio-capture"
      ) {
        speechShouldKeepListening = false;
        microphonePermissionGranted = false;
        savePermissionToStorage(false);
        updateSpeechStatus(
          "Microphone permission denied. Open setup and enable microphone.",
          true,
        );
        return;
      }

      if (code === "no-speech") {
        updateSpeechStatus(
          "No speech detected. Keep talking or click Stop.",
          true,
        );
        return;
      }

      if (code === "aborted") {
        updateSpeechStatus("Voice input stopped.");
        return;
      }

      speechShouldKeepListening = false;
      updateSpeechStatus(`Voice input error: ${code}.`, true);
    });

    speechRecognition.addEventListener("end", () => {
      console.log("[stt] end event", {
        sessionId: speechSessionId,
        shouldKeepListening: speechShouldKeepListening,
      });

      if (speechShouldKeepListening) {
        try {
          console.log("[stt] restarting recognition", {
            sessionId: speechSessionId,
          });
          speechRecognition.start();
          return;
        } catch {
          speechShouldKeepListening = false;
          console.log("[stt] restart failed", { sessionId: speechSessionId });
        }
      }

      speechIsListening = false;
      updateMicButtonUi();
      if (!getStatus()?.classList.contains("error")) {
        updateSpeechStatus("Voice input is off.");
      }
    });

    mic.addEventListener("click", async () => {
      if (!speechRecognitionSupported || mic.disabled) return;

      if (speechShouldKeepListening || speechIsListening) {
        stop();
        return;
      }

      const hasPermission = await ensureMicrophonePermissionViaSetupTab();
      if (!hasPermission) {
        console.log(
          "[stt] start canceled due to missing microphone permission",
        );
        return;
      }

      updateSpeechStatus("Starting voice input...");
      start();
    });

    window.addEventListener("focus", () => {
      syncPermissionState().then((granted) => {
        if (granted && !speechIsListening) {
          updateSpeechStatus(
            "Microphone enabled. Click Mic to start voice input.",
          );
        }
      });
    });

    syncPermissionState();
  }

  return {
    init,
    start,
    stop,
    isListening,
    isSupported,
    setDisabled,
  };
}
