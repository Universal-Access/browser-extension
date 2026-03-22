// Toolbar icon state management
// Uses ImageData instead of path strings to avoid the Chrome MV3 service worker
// "Failed to fetch" bug: https://issues.chromium.org/issues/40884749

const ICON_PATHS = {
  'off': {
    16: 'icons/icon-off-16.png',
    48: 'icons/icon-off-48.png',
    128: 'icons/icon-off-128.png'
  },
  'on': {
    16: 'icons/icon-on-16.png',
    48: 'icons/icon-on-48.png',
    128: 'icons/icon-on-128.png'
  },
  'detection-no': {
    16: 'icons/icon-detection-no-16.png',
    48: 'icons/icon-detection-no-48.png',
    128: 'icons/icon-detection-no-128.png'
  },
  'detection-yes': {
    16: 'icons/icon-detection-yes-16.png',
    48: 'icons/icon-detection-yes-48.png',
    128: 'icons/icon-detection-yes-128.png'
  }
};

const imageDataCache = new Map();

export function clearIconCache() {
  imageDataCache.clear();
}

async function loadIconImageData(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

async function getIconImageData(state) {
  if (imageDataCache.has(state)) return imageDataCache.get(state);

  const paths = ICON_PATHS[state];
  if (!paths) return null;

  const [img16, img48, img128] = await Promise.all([
    loadIconImageData(paths[16]),
    loadIconImageData(paths[48]),
    loadIconImageData(paths[128]),
  ]);

  const imageData = { 16: img16, 48: img48, 128: img128 };
  imageDataCache.set(state, imageData);
  return imageData;
}

export async function updateToolbarIcon(tabId, state) {
  try {
    const imageData = await getIconImageData(state);
    if (!imageData) return;
    const details = tabId ? { imageData, tabId } : { imageData };
    await chrome.action.setIcon(details);
  } catch (err) {
    console.warn('[Universal Access] setIcon failed:', err.message, { state, tabId });
  }
}
