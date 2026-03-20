// Service worker — messaging hub and badge management

const tabDataCache = new Map();
const tabNlwebState = new Map(); // { endpoint, abortController }

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

function getSchemaCount(data) {
  if (!data) return 0;
  const jsonLdCount = (data.jsonLd || []).length;
  const microdataCount = (data.microdata || []).length;
  const rdfaCount = (data.rdfa || []).length;
  return jsonLdCount + microdataCount + rdfaCount;
}

function updateBadge(tabId, data) {
  const count = getSchemaCount(data);
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

async function tryWellKnownNlweb(url) {
  try {
    const origin = new URL(url).origin;
    const resp = await fetch(`${origin}/.well-known/nlweb`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      if (json.endpoint) return json.endpoint;
      if (json.url) return json.url;
    } catch {
      const trimmed = text.trim();
      if (trimmed.startsWith('http')) return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

// Extract NLWeb endpoint from the WordPress plugin's search.js
async function tryPluginEndpoint(pluginUrl) {
  if (!pluginUrl) return null;
  try {
    const searchJsUrl = pluginUrl.replace(/\/$/, '') + '/assets/js/search.js';
const resp = await fetch(searchJsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
if (!resp.ok) return null;
    const text = await resp.text();
// Look for the /ask endpoint URL in the JS source
    const match = text.match(/["'`](https?:\/\/[^"'`\s]+\/ask)\b/);
if (match) return match[1];
    return null;
  } catch (err) {
    console.error('[NLWeb] tryPluginEndpoint error:', err);
    return null;
  }
}

async function resolveNlwebEndpoint(nlweb, pageUrl) {

// 1. Direct endpoint from content script
  if (nlweb?.endpoint) return nlweb.endpoint;

  // 2. Try extracting from WordPress plugin JS
  if (nlweb?.pluginUrl) {
const endpoint = await tryPluginEndpoint(nlweb.pluginUrl);
    if (endpoint) return endpoint;
  }

  // 3. Try well-known
  if (pageUrl) {
    const endpoint = await tryWellKnownNlweb(pageUrl);
    if (endpoint) return endpoint;
  }

  return null;
}

function broadcastNlwebEndpoint(tabId, endpoint, method) {
  const state = tabNlwebState.get(tabId) || {};
  state.endpoint = endpoint;
  tabNlwebState.set(tabId, state);
  chrome.runtime.sendMessage({
    type: 'NLWEB_ENDPOINT',
    endpoint,
    method,
    tabId
  }).catch(() => {});
}

// Parse a line from the stream — handles both NDJSON and SSE formats
function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // SSE format: lines prefixed with "data: "
  if (trimmed.startsWith('data: ')) {
    try {
      return JSON.parse(trimmed.slice(6));
    } catch {
      return null;
    }
  }
  // Plain NDJSON
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
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
        // Content script found a direct endpoint
        broadcastNlwebEndpoint(tabId, nlweb.endpoint, nlweb.method);
      } else if (nlweb?.method) {
        // NLWeb presence detected but no direct endpoint — resolve it
        resolveNlwebEndpoint(nlweb, message.payload.url).then((endpoint) => {
          if (endpoint) {
            broadcastNlwebEndpoint(tabId, endpoint, 'resolved');
          }
        });
      } else {
        // No NLWeb signals at all — try well-known as last resort
        const pageUrl = message.payload.url;
        if (pageUrl) {
          tryWellKnownNlweb(pageUrl).then((endpoint) => {
            if (endpoint) {
              broadcastNlwebEndpoint(tabId, endpoint, 'well-known');
            }
          });
        }
      }

      // Broadcast schema update to side panel
      chrome.runtime.sendMessage({
        type: 'SCHEMA_UPDATE',
        payload: message.payload,
        tabId
      }).catch(() => {
        // Side panel may not be open — ignore
      });
    }
  }

  if (message.type === 'GET_SCHEMA_DATA') {
    // Side panel requesting data for the active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;

        // Send resolved NLWeb endpoint if we have one
        const nlwebState = tabNlwebState.get(tabId);
        if (nlwebState?.endpoint) {
          // Delay slightly so the side panel has time to set up its listener
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'NLWEB_ENDPOINT',
              endpoint: nlwebState.endpoint,
              method: 'cached',
              tabId
            }).catch(() => {});
          }, 50);
        }

        const cached = tabDataCache.get(tabId);
        if (cached) {
          sendResponse(cached);
        } else {
          // Try to extract from the tab
          chrome.tabs.sendMessage(tabId, { type: 'REQUEST_EXTRACTION' }, (response) => {
            if (chrome.runtime.lastError) {
              sendResponse(null);
            } else {
              sendResponse(response || null);
            }
          });
        }
      } else {
        sendResponse(null);
      }
    });
    return true; // Keep message channel open for async response
  }

  if (message.type === 'NLWEB_QUERY') {
    const { query, endpoint, mode } = message;
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs[0]?.id;
      if (!tabId || !endpoint) return;

      // Abort any existing query for this tab
      const existing = tabNlwebState.get(tabId);
      if (existing?.abortController) {
        existing.abortController.abort();
      }

      const abortController = new AbortController();
      const state = tabNlwebState.get(tabId) || {};
      state.abortController = abortController;
      tabNlwebState.set(tabId, state);

      try {
        const url = new URL(endpoint);
        url.searchParams.set('query', query);
        url.searchParams.set('streaming', 'true');
        url.searchParams.set('generate_mode', mode || 'summarize');
        url.searchParams.set('display_mode', 'full');


        const resp = await fetch(url.toString(), {
          signal: abortController.signal
        });

        if (!resp.ok) {
          chrome.runtime.sendMessage({
            type: 'NLWEB_RESULT_CHUNK',
            error: `HTTP ${resp.status}: ${resp.statusText}`,
            done: true,
            tabId
          }).catch(() => {});
          return;
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep incomplete line in buffer

          for (const line of lines) {
            const chunk = parseStreamLine(line);
            if (chunk) {

              chrome.runtime.sendMessage({
                type: 'NLWEB_RESULT_CHUNK',
                chunk,
                done: false,
                tabId
              }).catch(() => {});
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const chunk = parseStreamLine(buffer);
          if (chunk) {
            chrome.runtime.sendMessage({
              type: 'NLWEB_RESULT_CHUNK',
              chunk,
              done: false,
              tabId
            }).catch(() => {});
          }
        }

        state.abortController = null;
        chrome.runtime.sendMessage({
          type: 'NLWEB_RESULT_CHUNK',
          done: true,
          tabId
        }).catch(() => {});
      } catch (err) {
        if (err.name === 'AbortError') return;
        chrome.runtime.sendMessage({
          type: 'NLWEB_RESULT_CHUNK',
          error: err.message,
          done: true,
          tabId
        }).catch(() => {});
      }
    });
    return true; // Keep service worker alive during streaming
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
