// Accessibility Preset Manager
// Injects/removes preset CSS into the page, persists selection via chrome.storage

(function () {
  'use strict';

  const PRESET_LINK_ID = 'ua-preset-stylesheet';
  const AVAILABLE_PRESETS = {
    'none': null,
    'low-vision': 'content/presets/low-vision.css',
    'dyslexia': 'content/presets/dyslexia.css'
  };

  let currentPreset = 'none';

  function applyPreset(presetName) {
    // Remove existing preset
    const existing = document.getElementById(PRESET_LINK_ID);
    if (existing) existing.remove();

    const cssPath = AVAILABLE_PRESETS[presetName];
    if (!cssPath) {
      currentPreset = 'none';
      chrome.storage.local.set({ uaPreset: 'none' });
      return;
    }

    const link = document.createElement('link');
    link.id = PRESET_LINK_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL(cssPath);
    document.head.appendChild(link);

    currentPreset = presetName;
    chrome.storage.local.set({ uaPreset: presetName });
  }

  // Restore saved preset on load
  chrome.storage.local.get('uaPreset', (result) => {
    if (result.uaPreset && AVAILABLE_PRESETS[result.uaPreset]) {
      // Only apply if overlay is active
      if (document.getElementById('ua-accessible-overlay')) {
        applyPreset(result.uaPreset);
      }
      currentPreset = result.uaPreset;
    }
  });

  // Listen for preset changes
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SET_PRESET') {
      applyPreset(message.preset);
      sendResponse({ success: true, preset: message.preset });
    }
    if (message.type === 'GET_PRESET') {
      sendResponse({ preset: currentPreset });
    }
  });
})();
