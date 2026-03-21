import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tryWellKnownNlweb, resolveNlwebEndpoint, executeNlwebQuery } from '../../background/nlweb-client.js';

describe('tryWellKnownNlweb', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns endpoint from JSON with endpoint field', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ endpoint: 'https://example.com/ask' })),
    });
    expect(await tryWellKnownNlweb('https://example.com/page')).toBe('https://example.com/ask');
  });

  it('returns url from JSON with url field', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ url: 'https://example.com/query' })),
    });
    expect(await tryWellKnownNlweb('https://example.com/page')).toBe('https://example.com/query');
  });

  it('returns plain-text URL', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('https://example.com/nlweb'),
    });
    expect(await tryWellKnownNlweb('https://example.com/page')).toBe('https://example.com/nlweb');
  });

  it('returns null for non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    expect(await tryWellKnownNlweb('https://example.com/page')).toBeNull();
  });

  it('returns null on network error', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    expect(await tryWellKnownNlweb('https://example.com/page')).toBeNull();
  });
});

describe('resolveNlwebEndpoint', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns direct endpoint when provided', async () => {
    const result = await resolveNlwebEndpoint({ endpoint: 'https://direct.com/ask' }, 'https://example.com');
    expect(result).toBe('https://direct.com/ask');
  });

  it('falls back to plugin URL', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('const url = "https://plugin.com/ask"'),
    });
    const result = await resolveNlwebEndpoint({ pluginUrl: 'https://example.com/wp-content/plugins/nlweb' }, 'https://example.com');
    expect(result).toBe('https://plugin.com/ask');
  });

  it('falls back to well-known', async () => {
    fetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({ endpoint: 'https://wk.com/ask' })),
    });
    const result = await resolveNlwebEndpoint({}, 'https://example.com');
    expect(result).toBe('https://wk.com/ask');
  });

  it('returns null when all strategies fail', async () => {
    fetch.mockResolvedValue({ ok: false });
    const result = await resolveNlwebEndpoint({}, 'https://example.com');
    expect(result).toBeNull();
  });
});

describe('executeNlwebQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeReadableStream(chunks) {
    const encoder = new TextEncoder();
    const encoded = chunks.map(c => encoder.encode(c));
    let i = 0;
    return {
      getReader() {
        return {
          read() {
            if (i < encoded.length) {
              return Promise.resolve({ done: false, value: encoded[i++] });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    };
  }

  it('parses NDJSON lines and sends chunks', async () => {
    const body = makeReadableStream(['{"name":"A"}\n{"name":"B"}\n']);
    fetch.mockResolvedValue({ ok: true, body });

    await executeNlwebQuery({
      query: 'test',
      endpoint: 'https://example.com/ask',
      tabId: 1,
      abortController: new AbortController(),
    });

    const calls = chrome.runtime.sendMessage.mock.calls;
    const chunks = calls.filter(c => c[0].chunk).map(c => c[0].chunk);
    expect(chunks).toEqual([{ name: 'A' }, { name: 'B' }]);

    const doneCall = calls.find(c => c[0].done === true && !c[0].error);
    expect(doneCall).toBeTruthy();
  });

  it('parses SSE data: lines', async () => {
    const body = makeReadableStream(['data: {"name":"X"}\ndata: {"name":"Y"}\n']);
    fetch.mockResolvedValue({ ok: true, body });

    await executeNlwebQuery({
      query: 'test',
      endpoint: 'https://example.com/ask',
      tabId: 1,
      abortController: new AbortController(),
    });

    const chunks = chrome.runtime.sendMessage.mock.calls
      .filter(c => c[0].chunk)
      .map(c => c[0].chunk);
    expect(chunks).toEqual([{ name: 'X' }, { name: 'Y' }]);
  });

  it('handles named SSE events (event: + data:)', async () => {
    const body = makeReadableStream(['event: result\ndata: {"name":"Z"}\n\n']);
    fetch.mockResolvedValue({ ok: true, body });

    await executeNlwebQuery({
      query: 'test',
      endpoint: 'https://example.com/ask',
      tabId: 1,
      abortController: new AbortController(),
    });

    const chunks = chrome.runtime.sendMessage.mock.calls
      .filter(c => c[0].chunk)
      .map(c => c[0].chunk);
    expect(chunks).toEqual([{ name: 'Z', message_type: 'result' }]);
  });

  it('sends error message on HTTP error', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });

    await executeNlwebQuery({
      query: 'test',
      endpoint: 'https://example.com/ask',
      tabId: 1,
      abortController: new AbortController(),
    });

    const errorCall = chrome.runtime.sendMessage.mock.calls.find(c => c[0].error);
    expect(errorCall[0].error).toBe('HTTP 500: Internal Server Error');
    expect(errorCall[0].done).toBe(true);
  });

  it('sends done message at end of stream', async () => {
    const body = makeReadableStream(['{"x":1}\n']);
    fetch.mockResolvedValue({ ok: true, body });

    await executeNlwebQuery({
      query: 'test',
      endpoint: 'https://example.com/ask',
      tabId: 1,
      abortController: new AbortController(),
    });

    const lastCall = chrome.runtime.sendMessage.mock.calls.at(-1);
    expect(lastCall[0].done).toBe(true);
  });
});
