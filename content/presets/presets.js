// Accessibility Preset Manager (v3)
// low-vision.css is ALWAYS injected when the overlay is active (base accessible styles)
//   → Light mode = higher contrast (#FAFAFA/#222, AAA)
//   → Dark mode = softer contrast for comfortable reading
// dyslexia.css is the only toggleable preset (font, size & spacing — no colors)
// Persists state via chrome.storage.local
// Supports 'auto' theme that follows OS preference

(function () {
  'use strict';

  const BASE_ID = 'ua-preset-low-vision';
  const BASE_CSS = 'content/presets/low-vision.css';
  const DYSLEXIA_ID = 'ua-preset-dyslexia';
  const DYSLEXIA_CSS = 'content/presets/dyslexia.css';

  let dyslexiaEnabled = false;
  let currentTheme = 'auto';

  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function resolveEffectiveTheme(theme) {
    if (theme === 'auto') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  function injectStylesheet(id, cssPath) {
    if (document.getElementById(id)) return;
    try {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(cssPath);
      document.head.appendChild(link);
    } catch {
      // Extension context invalidated
    }
  }

  function removeStylesheet(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  function applyState() {
    const overlay = document.getElementById('ua-accessible-overlay');
    if (!overlay) return;

    // Apply theme to overlay (resolve 'auto' to effective theme)
    const effective = resolveEffectiveTheme(currentTheme);
    if (effective === 'dark') {
      overlay.setAttribute('data-theme', 'dark');
    } else {
      overlay.removeAttribute('data-theme');
    }

    // Always inject base low-vision styles (handles light=high contrast, dark=soft contrast)
    injectStylesheet(BASE_ID, BASE_CSS);

    // Dyslexia: font, size & spacing only — layered on top
    if (dyslexiaEnabled) {
      injectStylesheet(DYSLEXIA_ID, DYSLEXIA_CSS);
    } else {
      removeStylesheet(DYSLEXIA_ID);
    }

    persistState();
  }

  function persistState() {
    try {
      chrome.storage.local.set({ uaPresets: { dyslexia: dyslexiaEnabled }, uaTheme: currentTheme });
    } catch {
      // Extension context invalidated
    }
  }

  // --- Re-apply theme when OS preference changes (only matters in auto mode) ---
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'auto') {
        applyState();
      }
    });
  } catch {
    // matchMedia not available
  }

  // --- Restore on load (with migration from v1/v2 formats) ---
  try {
    chrome.storage.local.get(['uaPreset', 'uaPresets', 'uaDyslexia', 'uaTheme'], (result) => {
      if (chrome.runtime.lastError) return;

      // Restore theme (now supports 'auto')
      if (result.uaTheme === 'dark' || result.uaTheme === 'light' || result.uaTheme === 'auto') {
        currentTheme = result.uaTheme;
      } else {
        currentTheme = 'auto';
      }

      // v3 format
      if (result.uaPresets && typeof result.uaPresets === 'object') {
        dyslexiaEnabled = !!result.uaPresets.dyslexia;
      }
      // v2 format
      else if (typeof result.uaDyslexia === 'boolean') {
        dyslexiaEnabled = result.uaDyslexia;
        chrome.storage.local.remove('uaDyslexia');
      }
      // v1 format
      else if (result.uaPreset) {
        dyslexiaEnabled = result.uaPreset === 'dyslexia';
        chrome.storage.local.remove('uaPreset');
      }

      persistState();

      if (document.getElementById('ua-accessible-overlay')) {
        applyState();
      }
    });
  } catch {
    // Extension context invalidated
  }

  // --- Message listener ---
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (!isContextValid()) return;

        // v3: SET_PRESETS
        if (message.type === 'SET_PRESETS') {
          if (message.presets && typeof message.presets === 'object') {
            if (typeof message.presets.dyslexia === 'boolean') {
              dyslexiaEnabled = message.presets.dyslexia;
            }
          }
          applyState();
          sendResponse({ success: true, presets: { dyslexia: dyslexiaEnabled } });
        }

        // v3: GET_PRESETS
        if (message.type === 'GET_PRESETS') {
          sendResponse({ presets: { dyslexia: dyslexiaEnabled } });
        }

        // Set theme (light/dark/auto)
        if (message.type === 'SET_THEME') {
          currentTheme = (message.theme === 'dark' || message.theme === 'light' || message.theme === 'auto')
            ? message.theme : 'auto';
          applyState();
          sendResponse({ success: true, theme: currentTheme });
        }

        // Get full state (for sidepanel sync on tab switch)
        // Re-reads from storage first so we pick up changes made from other tabs
        if (message.type === 'GET_STATE') {
          chrome.storage.local.get(['uaPresets', 'uaTheme'], (result) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                theme: currentTheme,
                presets: { dyslexia: dyslexiaEnabled },
                overlayActive: !!document.getElementById('ua-accessible-overlay')
              });
              return;
            }

            // Sync from storage (other tab may have changed these)
            if (result.uaTheme === 'dark' || result.uaTheme === 'light' || result.uaTheme === 'auto') {
              currentTheme = result.uaTheme;
            }
            if (result.uaPresets && typeof result.uaPresets === 'object') {
              dyslexiaEnabled = !!result.uaPresets.dyslexia;
            }

            // Re-apply to overlay if present
            applyState();

            sendResponse({
              theme: currentTheme,
              presets: { dyslexia: dyslexiaEnabled },
              overlayActive: !!document.getElementById('ua-accessible-overlay')
            });
          });
          return true; // async sendResponse
        }

        // --- Backward compatibility ---

        if (message.type === 'SET_DYSLEXIA') {
          dyslexiaEnabled = !!message.enabled;
          applyState();
          sendResponse({ success: true, dyslexia: dyslexiaEnabled });
        }

        if (message.type === 'GET_ACCESSIBILITY') {
          sendResponse({ dyslexia: dyslexiaEnabled });
        }

        if (message.type === 'SET_PRESET') {
          dyslexiaEnabled = message.preset === 'dyslexia';
          applyState();
          sendResponse({ success: true, preset: message.preset });
        }

        if (message.type === 'GET_PRESET') {
          sendResponse({ preset: dyslexiaEnabled ? 'dyslexia' : 'none' });
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
