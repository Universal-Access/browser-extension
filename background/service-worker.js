// Service worker — messaging hub and badge management

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
  if (message.type === 'SCHEMA_DATA') {
    const tabId = sender.tab ? sender.tab.id : message.tabId;
    if (tabId) {
      tabDataCache.set(tabId, message.payload);
      updateBadge(tabId, message.payload);
      // Broadcast update to side panel
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
        const cached = tabDataCache.get(tabId);
        if (cached) {
          sendResponse(cached);
        } else {
          // Try to extract from the tab
          chrome.tabs.sendMessage(tabId, { type: 'REQUEST_EXTRACTION' }, (response) => {
            if (chrome.runtime.lastError) {
              // Content script not available (restricted page)
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
