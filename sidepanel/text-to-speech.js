const TTS_RATE_STORAGE_KEY = "uaTtsRate";
const TTS_VOICE_STORAGE_KEY = "uaTtsVoiceURI";
const TTS_AUTO_READ_STORAGE_KEY = "uaTtsAutoRead";

let activeSummaryUtterance = null;
let activeSummaryButton = null;
let activeSummaryCard = null;
let preferredTtsRate = 1;
let preferredTtsVoiceURI = "";
let preferredTtsAutoRead = false;
let voicesListenerRegistered = false;

try {
  const savedRate = Number(window.localStorage?.getItem(TTS_RATE_STORAGE_KEY));
  if (Number.isFinite(savedRate) && savedRate >= 0.5 && savedRate <= 2) {
    preferredTtsRate = savedRate;
  }

  preferredTtsVoiceURI =
    window.localStorage?.getItem(TTS_VOICE_STORAGE_KEY) || "";
  preferredTtsAutoRead =
    window.localStorage?.getItem(TTS_AUTO_READ_STORAGE_KEY) === "true";
} catch {
  // Ignore storage access errors.
}

export function isSummaryTtsSupported() {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

function getAvailableVoices() {
  if (!isSummaryTtsSupported()) return [];
  return window.speechSynthesis.getVoices() || [];
}

function findPreferredVoice(voices) {
  if (!voices.length) return null;

  const byStoredUri = voices.find(
    (voice) => voice.voiceURI === preferredTtsVoiceURI,
  );
  if (byStoredUri) return byStoredUri;

  const byEnglish = voices.find((voice) =>
    String(voice.lang || "")
      .toLowerCase()
      .startsWith("en"),
  );
  if (byEnglish) return byEnglish;

  return voices[0];
}

function getVoiceByUri(voiceUri) {
  if (!voiceUri) return null;
  return (
    getAvailableVoices().find((voice) => voice.voiceURI === voiceUri) || null
  );
}

function populateVoiceSelect(select) {
  const voices = getAvailableVoices();
  const preferredVoice = findPreferredVoice(voices);
  const selectedVoiceUri = preferredVoice?.voiceURI || "";

  select.innerHTML = "";

  if (!voices.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Loading voices...";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  select.disabled = false;

  for (const voice of voices) {
    const option = document.createElement("option");
    option.value = voice.voiceURI;
    option.textContent = `${voice.name} (${voice.lang})`;
    select.appendChild(option);
  }

  if (!preferredTtsVoiceURI && selectedVoiceUri) {
    preferredTtsVoiceURI = selectedVoiceUri;
  }

  select.value = preferredTtsVoiceURI || selectedVoiceUri;
}

function refreshVoiceSelectors() {
  const select = document.getElementById("nlweb-tts-voice");
  if (select) {
    populateVoiceSelect(select);
  }
}

function ensureVoiceListenerRegistered() {
  if (!isSummaryTtsSupported() || voicesListenerRegistered) return;

  window.speechSynthesis.addEventListener("voiceschanged", () => {
    refreshVoiceSelectors();
  });
  voicesListenerRegistered = true;
}

function getGlobalTtsControls() {
  return {
    voiceSelect: document.getElementById("nlweb-tts-voice"),
    speedInput: document.getElementById("nlweb-tts-rate"),
    speedValue: document.getElementById("nlweb-tts-rate-value"),
    autoReadInput: document.getElementById("nlweb-tts-auto"),
  };
}

export function initTTSSettings() {
  const { voiceSelect, speedInput, speedValue, autoReadInput } =
    getGlobalTtsControls();
  if (!voiceSelect || !speedInput || !speedValue || !autoReadInput) return;

  if (!isSummaryTtsSupported()) {
    voiceSelect.disabled = true;
    speedInput.disabled = true;
    autoReadInput.disabled = true;
    voiceSelect.innerHTML = "";
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "TTS unavailable";
    voiceSelect.appendChild(option);
    return;
  }

  ensureVoiceListenerRegistered();
  populateVoiceSelect(voiceSelect);
  setTimeout(() => populateVoiceSelect(voiceSelect), 0);

  speedInput.value = String(preferredTtsRate);
  speedValue.textContent = `${preferredTtsRate.toFixed(1)}x`;
  autoReadInput.checked = preferredTtsAutoRead;

  voiceSelect.addEventListener("change", () => {
    preferredTtsVoiceURI = voiceSelect.value;
    try {
      window.localStorage?.setItem(TTS_VOICE_STORAGE_KEY, preferredTtsVoiceURI);
    } catch {
      // Ignore storage access errors.
    }
  });

  speedInput.addEventListener("input", () => {
    const value = Number(speedInput.value);
    preferredTtsRate = value;
    speedValue.textContent = `${value.toFixed(1)}x`;
    try {
      window.localStorage?.setItem(TTS_RATE_STORAGE_KEY, String(value));
    } catch {
      // Ignore storage access errors.
    }
  });

  autoReadInput.addEventListener("change", () => {
    preferredTtsAutoRead = autoReadInput.checked;
    try {
      window.localStorage?.setItem(
        TTS_AUTO_READ_STORAGE_KEY,
        String(preferredTtsAutoRead),
      );
    } catch {
      // Ignore storage access errors.
    }
  });
}

export function shouldAutoReadSummary() {
  return isSummaryTtsSupported() && preferredTtsAutoRead;
}

export function stopSummaryTts() {
  if (!isSummaryTtsSupported()) return;

  window.speechSynthesis.cancel();
  activeSummaryUtterance = null;

  if (activeSummaryButton) {
    activeSummaryButton.textContent = "Read Aloud";
    activeSummaryButton.classList.remove("reading");
    activeSummaryButton.setAttribute("aria-pressed", "false");
  }

  if (activeSummaryCard) {
    activeSummaryCard.classList.remove("reading");
  }

  activeSummaryButton = null;
  activeSummaryCard = null;
}

function getSummaryCardText(card) {
  const title =
    card.querySelector(".nlweb-summary-title")?.textContent?.trim() || "";
  const description =
    card.querySelector(".nlweb-result-description")?.textContent?.trim() || "";
  return [title, description].filter(Boolean).join(". ").trim();
}

export function startSummaryTts(card, button) {
  if (!isSummaryTtsSupported()) return;

  const text = getSummaryCardText(card);
  if (!text) return;

  if (activeSummaryUtterance || window.speechSynthesis.speaking) {
    stopSummaryTts();
  }

  const { voiceSelect, speedInput } = getGlobalTtsControls();
  const utterance = new window.SpeechSynthesisUtterance(text);
  const rate = Number(speedInput?.value || preferredTtsRate || 1);
  utterance.rate = Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1;

  const selectedVoiceUri = voiceSelect?.value || preferredTtsVoiceURI;
  const voice = getVoiceByUri(selectedVoiceUri);
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || "en-US";
  } else {
    utterance.lang = "en-US";
  }

  utterance.onend = () => {
    stopSummaryTts();
  };

  utterance.onerror = () => {
    stopSummaryTts();
  };

  activeSummaryUtterance = utterance;
  activeSummaryButton = button;
  activeSummaryCard = card;

  button.textContent = "Stop";
  button.classList.add("reading");
  button.setAttribute("aria-pressed", "true");
  card.classList.add("reading");

  window.speechSynthesis.speak(utterance);
}

export function toggleSummaryTts(card, button) {
  if (!isSummaryTtsSupported()) return;

  const isSameCardActive =
    activeSummaryCard === card &&
    (window.speechSynthesis.speaking || activeSummaryUtterance);

  if (isSameCardActive) {
    stopSummaryTts();
    return;
  }

  startSummaryTts(card, button);
}
