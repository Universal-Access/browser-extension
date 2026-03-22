// Service worker — messaging hub, state, and tab lifecycle

import { updateToolbarIcon } from "./badge.js";
import {
  tryWellKnownNlweb,
  resolveNlwebEndpoint,
  executeNlwebQuery,
} from "./nlweb-client.js";
import { probeSchemaAggregation, fetchAggregatedProducts } from "./schema-aggregation-client.js";

const tabDataCache = new Map();
const tabNlwebState = new Map(); // { endpoint, abortController }
const tabAggregationState = new Map(); // { origin, postTypes, products }
const micSetupPageUrl = chrome.runtime.getURL("setup/setup.html");
let micSetupTabId = null;

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

function broadcastNlwebEndpoint(tabId, endpoint, method) {
  const state = tabNlwebState.get(tabId) || {};
  state.endpoint = endpoint;
  tabNlwebState.set(tabId, state);

  const cached = tabDataCache.get(tabId);
  if (cached) {
    cached.nlweb = { ...(cached.nlweb || {}), endpoint, method };
  }

  chrome.runtime
    .sendMessage({ type: "NLWEB_ENDPOINT", endpoint, method, tabId })
    .catch(() => {});
}

// --- Message handlers ---

function handleSchemaData(message, sender) {
  const tabId = sender.tab ? sender.tab.id : message.tabId;
  if (tabId) {
    tabDataCache.set(tabId, message.payload);

    const nlweb = message.payload.nlweb;

    if (nlweb?.endpoint) {
      broadcastNlwebEndpoint(tabId, nlweb.endpoint, nlweb.method);
    } else if (nlweb?.method) {
      resolveNlwebEndpoint(nlweb, message.payload.url).then((endpoint) => {
        if (endpoint) broadcastNlwebEndpoint(tabId, endpoint, "resolved");
      });
    } else {
      const pageUrl = message.payload.url;
      if (pageUrl) {
        tryWellKnownNlweb(pageUrl).then((endpoint) => {
          if (endpoint) broadcastNlwebEndpoint(tabId, endpoint, "well-known");
        });
      }
    }

    chrome.runtime
      .sendMessage({ type: "SCHEMA_UPDATE", payload: message.payload, tabId })
      .catch(() => {});
  }
}

function handleGetSchemaData(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      const cached = tabDataCache.get(tabId);
      const nlwebState = tabNlwebState.get(tabId);

      if (cached && nlwebState?.endpoint) {
        cached.nlweb = { ...(cached.nlweb || {}), endpoint: nlwebState.endpoint, method: "cached" };
      }

      if (cached) {
        sendResponse(cached);
      } else {
        chrome.tabs.sendMessage(tabId, { type: "REQUEST_EXTRACTION" }, (response) => {
          if (chrome.runtime.lastError) {
            sendResponse(null);
          } else {
            sendResponse(response || null);
          }
        });
      }

      if (nlwebState?.endpoint) {
        setTimeout(() => {
          chrome.runtime
            .sendMessage({ type: "NLWEB_ENDPOINT", endpoint: nlwebState.endpoint, method: "cached", tabId })
            .catch(() => {});
        }, 100);
      }
    } else {
      sendResponse(null);
    }
  });
  return true;
}

function handleNlwebQuery(message) {
  const { query, endpoint, mode } = message;
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId || !endpoint) return;

    const existing = tabNlwebState.get(tabId);
    if (existing?.abortController) existing.abortController.abort();

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
}

function handleNlwebAbort() {
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

function handleOpenMicSetupTab(message, sender, sendResponse) {
  if (micSetupTabId !== null) {
    chrome.tabs.get(micSetupTabId, (tab) => {
      if (!chrome.runtime.lastError && tab?.id) {
        chrome.tabs.update(tab.id, { active: true }, () => {
          sendResponse({ ok: true, reused: true, tabId: tab.id });
        });
        return;
      }
      micSetupTabId = null;
      chrome.tabs.create({ url: micSetupPageUrl, active: true }, (createdTab) => {
        micSetupTabId = createdTab?.id ?? null;
        sendResponse({ ok: true, reused: false, tabId: createdTab?.id ?? null });
      });
    });
    return true;
  }
  chrome.tabs.create({ url: micSetupPageUrl, active: true }, (createdTab) => {
    micSetupTabId = createdTab?.id ?? null;
    sendResponse({ ok: true, reused: false, tabId: createdTab?.id ?? null });
  });
  return true;
}

function handleProbeSchemaAggregation(message, sender) {
  const tabId = sender.tab ? sender.tab.id : null;
  if (tabId && message.origin) {
    probeSchemaAggregation(message.origin).then((postTypes) => {
      if (!postTypes) return;
      const hasProducts = postTypes.includes("product");
      const state = { origin: message.origin, postTypes, hasProducts, products: null };
      tabAggregationState.set(tabId, state);
      chrome.runtime
        .sendMessage({ type: "SCHEMA_AGGREGATION_AVAILABLE", origin: message.origin, postTypes, hasProducts, tabId })
        .catch(() => {});
      // Precache products so they're ready when the user toggles Browse Products
      if (hasProducts) {
        fetchAggregatedProducts(message.origin)
          .then((products) => { state.products = products; })
          .catch(() => {});
      }
    });
  }
}

function handleGetAggregationState(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const state = tabAggregationState.get(tabs[0].id);
      sendResponse(state || null);
    } else {
      sendResponse(null);
    }
  });
  return true;
}

function handleFetchAggregatedProducts(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs[0]?.id;
    if (!tabId) {
      chrome.runtime.sendMessage({ type: "AGGREGATED_PRODUCTS_RESULT", error: "No active tab.", tabId: null }).catch(() => {});
      return;
    }
    const state = tabAggregationState.get(tabId);
    if (!state) {
      chrome.runtime.sendMessage({ type: "AGGREGATED_PRODUCTS_RESULT", error: "No aggregation state for this tab.", tabId }).catch(() => {});
      return;
    }
    if (state.products) {
      chrome.runtime.sendMessage({ type: "AGGREGATED_PRODUCTS_RESULT", products: state.products, tabId }).catch(() => {});
      return;
    }
    try {
      const products = await fetchAggregatedProducts(state.origin);
      state.products = products;
      chrome.runtime.sendMessage({ type: "AGGREGATED_PRODUCTS_RESULT", products, tabId }).catch(() => {});
    } catch (err) {
      chrome.runtime.sendMessage({ type: "AGGREGATED_PRODUCTS_RESULT", error: err.message, tabId }).catch(() => {});
    }
  });
}

function handleActivateProductBrowse(message) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "ACTIVATE_PRODUCT_BROWSE", products: message.products });
    }
  });
}

function handleActivateTransform(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      const tabId = tabs[0].id;
      const data = message.payload || tabDataCache.get(tabId);
      chrome.tabs.sendMessage(tabId, { type: "ACTIVATE_TRANSFORM", payload: data }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleDeactivateTransform(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "DEACTIVATE_TRANSFORM" }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleDeactivateProductBrowse(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "DEACTIVATE_PRODUCT_BROWSE" }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

// --- Preset handlers (v3 multi-preset + backward compat) ---

function handleSetPresets(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SET_PRESETS", presets: message.presets }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleSetPreset(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SET_PRESET", preset: message.preset }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleSetDyslexia(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SET_DYSLEXIA", enabled: message.enabled }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleSetTheme(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "SET_THEME", theme: message.theme }, (response) => {
        sendResponse(response || { success: false });
      });
    }
  });
  return true;
}

function handleGetSchemamap(message, sender, sendResponse) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "GET_SCHEMAMAP", origin: message.origin, schemaData: message.schemaData }, (response) => {
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

function handleSetIconState(message) {
  const state = message.state;
  if (!state) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    updateToolbarIcon(tabId, state);
  });
}

// Handler registry — maps message types to handler functions
const handlers = {
  SCHEMA_DATA: handleSchemaData,
  GET_SCHEMA_DATA: handleGetSchemaData,
  NLWEB_QUERY: handleNlwebQuery,
  NLWEB_ABORT: handleNlwebAbort,
  OPEN_MIC_SETUP_TAB: handleOpenMicSetupTab,
  PROBE_SCHEMA_AGGREGATION: handleProbeSchemaAggregation,
  GET_AGGREGATION_STATE: handleGetAggregationState,
  FETCH_AGGREGATED_PRODUCTS: handleFetchAggregatedProducts,
  ACTIVATE_PRODUCT_BROWSE: handleActivateProductBrowse,
  ACTIVATE_TRANSFORM: handleActivateTransform,
  DEACTIVATE_TRANSFORM: handleDeactivateTransform,
  DEACTIVATE_PRODUCT_BROWSE: handleDeactivateProductBrowse,
  SET_PRESETS: handleSetPresets,
  SET_PRESET: handleSetPreset,
  SET_DYSLEXIA: handleSetDyslexia,
  SET_THEME: handleSetTheme,
  SET_ICON_STATE: handleSetIconState,
  GET_SCHEMAMAP: handleGetSchemamap,
};

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message.type];
  if (handler) return handler(message, sender, sendResponse);
});

// Clear stale cache on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    tabDataCache.delete(tabId);
    const state = tabNlwebState.get(tabId);
    if (state?.abortController) state.abortController.abort();
    tabNlwebState.delete(tabId);
    tabAggregationState.delete(tabId);
  }
});

// Notify sidepanel when user switches tabs
chrome.tabs.onActivated.addListener(({ tabId }) => {
  const cached = tabDataCache.get(tabId);
  const aggregation = tabAggregationState.get(tabId) || null;
  const nlweb = tabNlwebState.get(tabId) || null;

  chrome.runtime
    .sendMessage({
      type: "TAB_ACTIVATED",
      payload: cached || null,
      aggregation,
      nlweb: nlweb?.endpoint ? { endpoint: nlweb.endpoint, method: "cached" } : null,
      tabId,
    })
    .catch(() => {});

  // If no cached data, ask the content script to extract
  if (!cached) {
    chrome.tabs.sendMessage(tabId, { type: "REQUEST_EXTRACTION" }, () => {
      if (chrome.runtime.lastError) {
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: [
              "content/nlweb-discovery.js",
              "content/schema-aggregation.js",
              "content/extractor.js",
              "content/schemamap.js",
              "content/transformer.js",
              "content/presets/presets.js",
            ],
          })
          .then(() => {
            chrome.tabs.sendMessage(tabId, { type: "REQUEST_EXTRACTION" }, () => {
              if (chrome.runtime.lastError) { /* still failed — ignore */ }
            });
          })
          .catch(() => { /* chrome:// or other restricted page — ignore */ });
      }
    });
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === micSetupTabId) micSetupTabId = null;
  tabDataCache.delete(tabId);
  const state = tabNlwebState.get(tabId);
  if (state?.abortController) state.abortController.abort();
  tabNlwebState.delete(tabId);
  tabAggregationState.delete(tabId);
});
