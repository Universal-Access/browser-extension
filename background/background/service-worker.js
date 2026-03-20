// Service worker — messaging hub, badge management, and state coordination

const tabDataCache = new Map();

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

// Handle messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const senderTabId = sender.tab ? sender.tab.id : null;

  // --- Schema data from content script ---
  if (message.type === 'SCHEMA_DATA') {
    const tabId = senderTabId || message.tabId;
    if (tabId) {
      tabDataCache.set(tabId, message.payload);
      updateBadge(tabId, message.payload);
      // Broadcast update to side panel
      chrome.runtime.sendMessage({
        type: 'SCHEMA_UPDATE',
        payload: message.payload,
        tabId
      }).catch(() => {});
    }
  }

  // --- Side panel requesting schema data ---
  if (message.type === 'GET_SCHEMA_DATA') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        const tabId = tabs[0].id;
        const cached = tabDataCache.get(tabId);
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
      } else {
        sendResponse(null);
      }
    });
    return true;
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

  // --- Set accessibility preset ---
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
});

// Clear stale cache on navigation
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    tabDataCache.delete(tabId);
    chrome.action.setBadgeText({ text: '', tabId });
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabDataCache.delete(tabId);
});
