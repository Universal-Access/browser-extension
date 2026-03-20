(() => {
  "use strict";

  const STORAGE_KEY = "uaMicrophonePermissionGranted";

  const grantBtn = document.getElementById("grant-btn");
  const retryBtn = document.getElementById("retry-btn");
  const statusEl = document.getElementById("status");
  const successEl = document.getElementById("success");

  function setStatus(text, state = "default") {
    statusEl.textContent = text;
    statusEl.classList.remove("error", "success");
    if (state === "error") statusEl.classList.add("error");
    if (state === "success") statusEl.classList.add("success");
  }

  function setBusy(isBusy) {
    grantBtn.disabled = isBusy;
    retryBtn.disabled = isBusy;
  }

  function setGrantedUi() {
    setStatus("Microphone access granted.", "success");
    successEl.hidden = false;
    grantBtn.hidden = true;
    retryBtn.hidden = true;
  }

  function setRetryUi(message) {
    setStatus(message, "error");
    successEl.hidden = true;
    grantBtn.hidden = true;
    retryBtn.hidden = false;
  }

  function saveGranted(value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: value }, () => resolve());
    });
  }

  function loadGranted() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(Boolean(result[STORAGE_KEY]));
      });
    });
  }

  async function requestMicrophonePermission() {
    setBusy(true);
    setStatus("Requesting microphone access...");

    try {
      if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== "function"
      ) {
        throw new Error("getUserMedia unavailable");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());

      await saveGranted(true);
      console.log("[stt-setup] microphone permission granted");
      setGrantedUi();
    } catch (error) {
      await saveGranted(false);
      const name = error?.name || "Error";
      const message = error?.message || "";

      console.log("[stt-setup] microphone permission failed", {
        name,
        message,
      });

      if (name === "NotAllowedError") {
        setRetryUi(
          "Permission was not granted. Please allow microphone access to continue.",
        );
      } else if (name === "NotFoundError") {
        setRetryUi(
          "No microphone device was found. Connect a microphone and retry.",
        );
      } else {
        setRetryUi("Unable to request microphone access. Please retry.");
      }
    } finally {
      setBusy(false);
    }
  }

  grantBtn.addEventListener("click", requestMicrophonePermission);
  retryBtn.addEventListener("click", requestMicrophonePermission);

  loadGranted().then((granted) => {
    if (granted) {
      setGrantedUi();
    }
  });
})();
