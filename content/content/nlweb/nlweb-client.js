// NLWeb API Client
// Detects NLWeb availability on a site and provides query functionality

(function () {
  'use strict';

  // Known NLWeb endpoints (can be extended)
  const KNOWN_ENDPOINTS = {
    'news.microsoft.com': 'https://news.microsoft.com/api/ask'
  };

  // Common paths to probe for NLWeb
  const PROBE_PATHS = ['/api/ask', '/.well-known/nlweb'];

  let detectedEndpoint = null;

  async function detectNLWebEndpoint() {
    const origin = window.location.origin;
    const hostname = window.location.hostname;

    // Check known endpoints first
    if (KNOWN_ENDPOINTS[hostname]) {
      detectedEndpoint = KNOWN_ENDPOINTS[hostname];
      return detectedEndpoint;
    }

    // Probe common paths
    for (const path of PROBE_PATHS) {
      try {
        const url = `${origin}${path}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: 'test', streaming: false }),
          signal: AbortSignal.timeout(3000)
        });
        if (resp.ok || resp.status === 400) {
          // A 400 might mean the endpoint exists but we sent bad params
          detectedEndpoint = url;
          return detectedEndpoint;
        }
      } catch {
        // Endpoint not available
      }
    }

    return null;
  }

  async function askNLWeb(query, options = {}) {
    if (!detectedEndpoint) return null;

    const params = {
      query,
      streaming: false,
      mode: options.mode || 'list',
      ...(options.prev ? { prev: options.prev.join(',') } : {}),
      ...(options.site ? { site: options.site } : {})
    };

    try {
      const resp = await fetch(detectedEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(15000)
      });

      if (!resp.ok) {
        throw new Error(`NLWeb returned ${resp.status}`);
      }

      return await resp.json();
    } catch (err) {
      console.error('[Universal Access] NLWeb query error:', err);
      return { error: err.message };
    }
  }

  // Detect on page load
  detectNLWebEndpoint().then((endpoint) => {
    chrome.runtime.sendMessage({
      type: 'NLWEB_STATUS',
      payload: {
        available: !!endpoint,
        endpoint: endpoint
      }
    }).catch(() => {});
  });

  // Listen for queries from the side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'NLWEB_QUERY') {
      askNLWeb(message.query, message.options || {}).then((result) => {
        sendResponse(result);
      });
      return true; // async response
    }
    if (message.type === 'GET_NLWEB_STATUS') {
      sendResponse({
        available: !!detectedEndpoint,
        endpoint: detectedEndpoint
      });
    }
  });
})();
