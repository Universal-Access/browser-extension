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

  // Guard against "Extension context invalidated" errors after extension reload
  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function applyPreset(presetName) {
    // Remove existing preset
    const existing = document.getElementById(PRESET_LINK_ID);
    if (existing) existing.remove();

    const cssPath = AVAILABLE_PRESETS[presetName];
    if (!cssPath) {
      currentPreset = 'none';
      try { chrome.storage.local.set({ uaPreset: 'none' }); } catch {}
      return;
    }

    try {
      const link = document.createElement('link');
      link.id = PRESET_LINK_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(cssPath);
      document.head.appendChild(link);
    } catch {
      // Extension context invalidated — can't resolve URL
      return;
    }

    currentPreset = presetName;
    try { chrome.storage.local.set({ uaPreset: presetName }); } catch {}
  }

  // Restore saved preset on load
  try {
    chrome.storage.local.get('uaPreset', (result) => {
      if (chrome.runtime.lastError) return;
      if (result.uaPreset && AVAILABLE_PRESETS[result.uaPreset]) {
        // Only apply if overlay is active
        if (document.getElementById('ua-accessible-overlay')) {
          applyPreset(result.uaPreset);
        }
        currentPreset = result.uaPreset;
      }
    });
  } catch {
    // Extension context invalidated
  }

  // Listen for preset changes
  // Guard inside the callback — listener persists beyond context lifetime
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (!isContextValid()) return;
        if (message.type === 'SET_PRESET') {
          applyPreset(message.preset);
          sendResponse({ success: true, preset: message.preset });
        }
        if (message.type === 'GET_PRESET') {
          sendResponse({ preset: currentPreset });
        }
      } catch (e) {
        if (!String(e.message).includes('Extension context invalidated')) {
          console.warn('[Universal Access] Preset listener error:', e.message);
        }
      }
    });
  } catch {
    // Extension context already invalidated at registration time
  }
})();
