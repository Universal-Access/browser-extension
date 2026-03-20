// NLWeb endpoint resolution and streaming query execution

export async function tryWellKnownNlweb(url) {
  try {
    const origin = new URL(url).origin;
    const resp = await fetch(`${origin}/.well-known/nlweb`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      if (json.endpoint) return json.endpoint;
      if (json.url) return json.url;
    } catch {
      const trimmed = text.trim();
      if (trimmed.startsWith('http')) return trimmed;
    }
    return null;
  } catch {
    return null;
  }
}

async function tryPluginEndpoint(pluginUrl) {
  if (!pluginUrl) return null;
  try {
    const searchJsUrl = pluginUrl.replace(/\/$/, '') + '/assets/js/search.js';
    const resp = await fetch(searchJsUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    const match = text.match(/["'`](https?:\/\/[^"'`\s]+\/ask)\b/);
    if (match) return match[1];
    return null;
  } catch (err) {
    console.error('[NLWeb] tryPluginEndpoint error:', err);
    return null;
  }
}

export async function resolveNlwebEndpoint(nlweb, pageUrl) {
  // 1. Direct endpoint from content script
  if (nlweb?.endpoint) return nlweb.endpoint;

  // 2. Try extracting from WordPress plugin JS
  if (nlweb?.pluginUrl) {
    const endpoint = await tryPluginEndpoint(nlweb.pluginUrl);
    if (endpoint) return endpoint;
  }

  // 3. Try well-known
  if (pageUrl) {
    const endpoint = await tryWellKnownNlweb(pageUrl);
    if (endpoint) return endpoint;
  }

  return null;
}

// Parse a line from the stream — handles both NDJSON and SSE formats
function parseStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // SSE format: lines prefixed with "data: "
  if (trimmed.startsWith('data: ')) {
    try {
      return JSON.parse(trimmed.slice(6));
    } catch {
      return null;
    }
  }
  // Plain NDJSON
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

// Execute a streaming NLWeb query, sending chunks via chrome.runtime.sendMessage
export async function executeNlwebQuery({ query, endpoint, mode, tabId, abortController }) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set('query', query);
    url.searchParams.set('streaming', 'true');
    url.searchParams.set('generate_mode', mode || 'summarize');
    url.searchParams.set('display_mode', 'full');

    const resp = await fetch(url.toString(), {
      signal: abortController.signal
    });

    if (!resp.ok) {
      chrome.runtime.sendMessage({
        type: 'NLWEB_RESULT_CHUNK',
        error: `HTTP ${resp.status}: ${resp.statusText}`,
        done: true,
        tabId
      }).catch(() => {});
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const chunk = parseStreamLine(line);
        if (chunk) {
          chrome.runtime.sendMessage({
            type: 'NLWEB_RESULT_CHUNK',
            chunk,
            done: false,
            tabId
          }).catch(() => {});
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const chunk = parseStreamLine(buffer);
      if (chunk) {
        chrome.runtime.sendMessage({
          type: 'NLWEB_RESULT_CHUNK',
          chunk,
          done: false,
          tabId
        }).catch(() => {});
      }
    }

    chrome.runtime.sendMessage({
      type: 'NLWEB_RESULT_CHUNK',
      done: true,
      tabId
    }).catch(() => {});
  } catch (err) {
    if (err.name === 'AbortError') return;
    chrome.runtime.sendMessage({
      type: 'NLWEB_RESULT_CHUNK',
      error: err.message,
      done: true,
      tabId
    }).catch(() => {});
  }
}
