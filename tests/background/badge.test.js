import { describe, it, expect } from 'vitest';
import { updateToolbarIcon } from '../../background/badge.js';

describe('updateToolbarIcon', () => {
  it('sets icon paths for a valid state with tabId', () => {
    updateToolbarIcon(1, 'on');

    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      path: {
        '16': 'icons/icon-on-16.png',
        '48': 'icons/icon-on-48.png',
        '128': 'icons/icon-on-128.png',
      },
      tabId: 1,
    });
  });

  it('sets icon without tabId when tabId is falsy', () => {
    updateToolbarIcon(null, 'detection-yes');

    expect(chrome.action.setIcon).toHaveBeenCalledWith({
      path: {
        '16': 'icons/icon-detection-yes-16.png',
        '48': 'icons/icon-detection-yes-48.png',
        '128': 'icons/icon-detection-yes-128.png',
      },
    });
  });

  it('does nothing for an unknown state', () => {
    updateToolbarIcon(1, 'invalid-state');

    expect(chrome.action.setIcon).not.toHaveBeenCalled();
  });

  it('supports all defined icon states', () => {
    const states = ['off', 'on', 'detection-no', 'detection-yes'];
    for (const state of states) {
      chrome.action.setIcon.mockClear();
      updateToolbarIcon(1, state);
      expect(chrome.action.setIcon).toHaveBeenCalledOnce();
    }
  });
});
