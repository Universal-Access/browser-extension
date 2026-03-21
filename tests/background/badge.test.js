import { describe, it, expect } from 'vitest';
import { getSchemaCount, updateBadge } from '../../background/badge.js';

describe('getSchemaCount', () => {
  it('returns 0 for null input', () => {
    expect(getSchemaCount(null)).toBe(0);
  });

  it('returns 0 for undefined input', () => {
    expect(getSchemaCount(undefined)).toBe(0);
  });

  it('returns 0 for empty arrays', () => {
    expect(getSchemaCount({ jsonLd: [], microdata: [], rdfa: [] })).toBe(0);
  });

  it('sums counts across all sources', () => {
    const data = {
      jsonLd: [{ '@type': 'Product' }],
      microdata: [{ type: 'Thing' }, { type: 'Person' }],
      rdfa: [{ typeof: 'Article' }],
    };
    expect(getSchemaCount(data)).toBe(4);
  });

  it('treats missing source keys as empty arrays', () => {
    expect(getSchemaCount({ jsonLd: [{}] })).toBe(1);
    expect(getSchemaCount({})).toBe(0);
  });
});

describe('updateBadge', () => {
  it('sets badge text and green background when count > 0', () => {
    const data = { jsonLd: [{}], microdata: [], rdfa: [] };
    updateBadge(1, data);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '1', tabId: 1 });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: '#4CAF50', tabId: 1 });
  });

  it('clears badge text when count is 0', () => {
    updateBadge(1, null);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: '', tabId: 1 });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
