// Toolbar icon state management

const ICON_PATHS = {
  'off': {
    '16': 'icons/icon-off-16.png',
    '48': 'icons/icon-off-48.png',
    '128': 'icons/icon-off-128.png'
  },
  'on': {
    '16': 'icons/icon-on-16.png',
    '48': 'icons/icon-on-48.png',
    '128': 'icons/icon-on-128.png'
  },
  'detection-no': {
    '16': 'icons/icon-detection-no-16.png',
    '48': 'icons/icon-detection-no-48.png',
    '128': 'icons/icon-detection-no-128.png'
  },
  'detection-yes': {
    '16': 'icons/icon-detection-yes-16.png',
    '48': 'icons/icon-detection-yes-48.png',
    '128': 'icons/icon-detection-yes-128.png'
  }
};

export function updateToolbarIcon(tabId, state) {
  const paths = ICON_PATHS[state];
  if (!paths) return;
  if (tabId) {
    chrome.action.setIcon({ path: paths, tabId }).catch((err) => {
      console.warn('[Universal Access] setIcon failed:', err.message, { state, tabId });
    });
  } else {
    chrome.action.setIcon({ path: paths }).catch((err) => {
      console.warn('[Universal Access] setIcon failed:', err.message, { state });
    });
  }
}
