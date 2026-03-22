import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateToolbarIcon, clearIconCache } from '../../background/badge.js';

// Fake ImageData returned by the mocked pipeline
const fakeImageData = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

// Mock fetch → blob → createImageBitmap → OffscreenCanvas pipeline
const mockGetImageData = vi.fn().mockReturnValue(fakeImageData);
const mockCtx = { drawImage: vi.fn(), getImageData: mockGetImageData };

beforeEach(() => {
  clearIconCache();
  globalThis.createImageBitmap = vi.fn().mockResolvedValue({ width: 1, height: 1, close: vi.fn() });
  globalThis.OffscreenCanvas = vi.fn().mockImplementation(() => ({
    getContext: vi.fn().mockReturnValue(mockCtx),
  }));
  globalThis.fetch = vi.fn().mockResolvedValue({ blob: vi.fn().mockResolvedValue(new Blob()) });
  chrome.runtime.getURL = vi.fn((path) => `chrome-extension://id/${path}`);
  mockGetImageData.mockClear();
  mockCtx.drawImage.mockClear();
});

describe('updateToolbarIcon', () => {
  it('sets imageData for a valid state with tabId', async () => {
    await updateToolbarIcon(1, 'on');

    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      imageData: { 16: fakeImageData, 48: fakeImageData, 128: fakeImageData },
      tabId: 1,
    });
  });

  it('sets imageData without tabId when tabId is falsy', async () => {
    await updateToolbarIcon(null, 'detection-yes');

    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      imageData: { 16: fakeImageData, 48: fakeImageData, 128: fakeImageData },
    });
  });

  it('does nothing for an unknown state', async () => {
    await updateToolbarIcon(1, 'invalid-state');

    expect(chrome.action.setIcon).not.toHaveBeenCalled();
  });

  it('supports all defined icon states', async () => {
    const states = ['off', 'on', 'detection-no', 'detection-yes'];
    for (const state of states) {
      chrome.action.setIcon.mockClear();
      await updateToolbarIcon(1, state);
      expect(chrome.action.setIcon).toHaveBeenCalledOnce();
    }
  });

  it('fetches icons with chrome.runtime.getURL paths', async () => {
    await updateToolbarIcon(1, 'on');

    expect(chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon-on-16.png');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon-on-48.png');
    expect(chrome.runtime.getURL).toHaveBeenCalledWith('icons/icon-on-128.png');
    expect(globalThis.fetch).toHaveBeenCalledWith('chrome-extension://id/icons/icon-on-16.png');
  });

  it('caches imageData and only fetches once per state', async () => {
    await updateToolbarIcon(1, 'on');
    await updateToolbarIcon(2, 'on');

    // 3 fetches for the 3 sizes, not 6
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
