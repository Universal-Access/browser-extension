// Service worker — messaging hub, state, and tab lifecycle

import { updateBadge } from './badge.js';
import { tryWellKnownNlweb, resolveNlwebEndpoint, executeNlwebQuery } from './nlweb-client.js';

const tabDataCache = new Map();
const tabNlwebState = new Map(); // { endpoint, abortController }

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

function broadcastNlwebEndpoint(tabId, endpoint, method) {
  const state = tabNlwebState.get(tabId) || {};
  state.endpoint = endpoint;
  tabNlwebState.set(tabId, state);

  // Also update cached schema data so sidepanel gets it on initial load
  const cached = tabDataCache.get(tabId);
  if (cached) {
    cached.nlweb = { ...(cached.nlweb || {}), endpoint, method };
  }

  chrome.runtime.sendMessage({
    type: 'NLWEB_ENDPOINT',
    endpoint,
    method,
    tabId
  }).catch(() => {});
}

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SCHEMA_DATA') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    if (tabId) {
      tabDataCache.set(tabId, message.payload);
      updateBadge(tabId, message.payload);

      const nlweb = message.payload.nlweb;

      if (nlweb?.endpoint) {
        broadcastNlwebEndpoint(tabId, nlweb.endpoint, nlweb.method);
      } else if (nlweb?.method) {
        resolveNlwebEndpoint(nlweb, message.payload.url).then((endpoint) => {
          if (endpoint) {
            broadcastNlwebEndpoint(tabId, endpoint, 'resolved');
          }
        });
      } else {
        const pageUrl = message.payload.url;
        if (pageUrl) {
          tryWellKnownNlweb(pageUrl).then((endpoint) => {
            if (endpoint) {
              broadcastNlwebEndpoint(tabId, endpoint, 'well-known');
            }
          });
        }
      }

      chrome.runtime.sendMessage({
        type: 'SCHEMA_UPDATE',
        payload: message.payload,
        tabId
      }).catch(() => {});
    }
  }

  if (message.type === 'GET_SCHEMA_DATA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;

        const cached = tabDataCache.get(tabId);
        const nlwebState = tabNlwebState.get(tabId);

        // Enrich cached data with resolved NLWeb endpoint so the sidepanel
        // gets it in the initial response (no race with delayed broadcast)
        if (cached && nlwebState?.endpoint) {
          cached.nlweb = { ...(cached.nlweb || {}), endpoint: nlwebState.endpoint, method: 'cached' };
        }

        if (cached) {
          sendResponse(cached);
        } else {
          chrome.tabs.sendMessage(tabId, { type: 'REQUEST_EXTRACTION' }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse(null);
            } else {
              sendResponse(response || null);
            }
          });
        }

        // Also send as a separate message in case the sidepanel
        // processes SCHEMA_UPDATE before the initial response
        if (nlwebState?.endpoint) {
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'NLWEB_ENDPOINT',
              endpoint: nlwebState.endpoint,
              method: 'cached',
              tabId
            }).catch(() => {});
          }, 100);
        }
      } else {
        sendResponse(null);
      }
    });
    return true;
  }

  if (message.type === 'NLWEB_QUERY') {
    const { query, endpoint, mode } = message;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId || !endpoint) return;

      const existing = tabNlwebState.get(tabId);
      if (existing?.abortController) {
        existing.abortController.abort();
      }

      const abortController = new AbortController();
      const state = tabNlwebState.get(tabId) || {};
      state.abortController = abortController;
      tabNlwebState.set(tabId, state);

      try {
        await executeNlwebQuery({ query, endpoint, mode, tabId, abortController });
      } finally {
        state.abortController = null;
      }
    });
    return true;
  }

  if (message.type === 'NLWEB_ABORT') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id;
      if (tabId) {
        const state = tabNlwebState.get(tabId);
        if (state?.abortController) {
          state.abortController.abort();
          state.abortController = null;
        }
      }
    });
  }

  // --- Activate visual transformation ---
  if (message.type === 'ACTIVATE_TRANSFORM') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        const data = message.payload || tabDataCache.get(tabId);
        chrome.tabs.sendMessage(tabId, {
          type: 'ACTIVATE_TRANSFORM',
          payload: data
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Deactivate visual transformation ---
  if (message.type === 'DEACTIVATE_TRANSFORM') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'DEACTIVATE_TRANSFORM'
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Set accessibility presets (multi-preset v3) ---
  if (message.type === 'SET_PRESETS') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_PRESETS',
          presets: message.presets
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Set accessibility preset (v1 compat) ---
  if (message.type === 'SET_PRESET') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_PRESET',
          preset: message.preset
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Set dyslexia mode (v2 compat) ---
  if (message.type === 'SET_DYSLEXIA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_DYSLEXIA',
          enabled: message.enabled
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Set theme (light/dark) ---
  if (message.type === 'SET_THEME') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SET_THEME',
          theme: message.theme
        }, (response) => {
          sendResponse(response || { success: false });
        });
      }
    });
    return true;
  }

  // --- Get schemamap navigation ---
  if (message.type === 'GET_SCHEMAMAP') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'GET_SCHEMAMAP',
          origin: message.origin,
          schemaData: message.schemaData
        }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse({ navItems: null });
          } else {
            sendResponse(response || { navItems: null });
          }
        });
      } else {
        sendResponse({ navItems: null });
      }
    });
    return true;
  }
});

// Clear stale cache on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabDataCache.delete(tabId);
    const state = tabNlwebState.get(tabId);
    if (state?.abortController) {
      state.abortController.abort();
    }
    tabNlwebState.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabDataCache.delete(tabId);
  const state = tabNlwebState.get(tabId);
  if (state?.abortController) {
    state.abortController.abort();
  }
  tabNlwebState.delete(tabId);
});
