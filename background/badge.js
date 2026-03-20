// Badge count and display

export function getSchemaCount(data) {
  if (!data) return 0;
  const jsonLdCount = (data.jsonLd || []).length;
  const microdataCount = (data.microdata || []).length;
  const rdfaCount = (data.rdfa || []).length;
  return jsonLdCount + microdataCount + rdfaCount;
}

export function updateBadge(tabId, data) {
  const count = getSchemaCount(data);
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count), tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50', tabId });
  } else {
    chrome.action.setBadgeText({ text: '', tabId });
  }
}
