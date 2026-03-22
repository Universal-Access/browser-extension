// Toolbar icon state management
// Uses absolute chrome-extension:// URLs so the MV3 service worker can fetch them

const ICON_STATES = ['off', 'on', 'detection-no', 'detection-yes'];
const ICON_SIZES = ['16', '48', '128'];

// Build paths using chrome.runtime.getURL so the service worker can resolve them
const ICON_PATHS = {};
for (const state of ICON_STATES) {
  ICON_PATHS[state] = {};
  for (const size of ICON_SIZES) {
    ICON_PATHS[state][size] = chrome.runtime.getURL(`icons/icon-${state}-${size}.png`);
  }
}

export function updateToolbarIcon(tabId, state) {
  const paths = ICON_PATHS[state];
  if (!paths) return;
  const details = { path: paths };
  if (tabId) details.tabId = tabId;
  chrome.action.setIcon(details).catch((err) => {
    console.warn('[Universal Access] setIcon failed:', err.message, { state, tabId });
  });
}
