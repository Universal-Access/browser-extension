// Schemamap.json Navigation Module
// Fetches, parses, caches, and exposes site-wide navigation from /schemamap.json
// Falls back to SiteNavigationElement entities found in the page's own schema.

(function () {
  'use strict';

  const CACHE_KEY_PREFIX = 'ua_schemamap_';
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
  const FETCH_TIMEOUT_MS = 3000;

  let cachedNav = null;

  // Guard against "Extension context invalidated" errors after extension reload
  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  // --- Normalizer ---
  // Converts any supported format into a flat-or-nested array:
  //   [{ name, url, children: [{ name, url }] }]

  function normalizeNavItems(data) {
    if (!data) return [];

    // Format A: schema.org ItemList wrapper
    if (data['@type'] === 'ItemList' || data['@type'] === 'SiteNavigationElement') {
      const items = data.itemListElement || data.hasPart || [];
      return normalizeNavItems(Array.isArray(items) ? items : [items]);
    }

    // Format B / normalized: plain array
    if (Array.isArray(data)) {
      return data
        .map(item => {
          if (!item || typeof item !== 'object') return null;
          const name = item.name || item.label || item.title || '';
          const url = item.url || item.href || '';
          if (!name && !url) return null;

          // Nested children
          const rawChildren = item.itemListElement || item.children || item.hasPart || [];
          const children = normalizeNavItems(Array.isArray(rawChildren) ? rawChildren : [rawChildren]);

          return { name, url, children };
        })
        .filter(Boolean);
    }

    // Single object — wrap
    if (typeof data === 'object' && (data.name || data.url)) {
      return normalizeNavItems([data]);
    }

    return [];
  }

  // --- Fetcher ---

  async function fetchSchemamap(origin) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const url = `${origin}/schemamap.json`;
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timer);

      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('json') && !contentType.includes('text')) return null;

      const text = await response.text();
      if (!text.trim()) return null;

      const data = JSON.parse(text);
      return normalizeNavItems(data);
    } catch {
      clearTimeout(timer);
      return null;
    }
  }

  // --- Cache ---

  function getCacheKey(origin) {
    return CACHE_KEY_PREFIX + origin.replace(/[^a-zA-Z0-9]/g, '_');
  }

  async function getCached(origin) {
    if (!isContextValid()) return null;
    return new Promise((resolve) => {
      try {
        const key = getCacheKey(origin);
        chrome.storage.local.get(key, (result) => {
          if (chrome.runtime.lastError) { resolve(null); return; }
          const entry = result[key];
          if (entry && entry.timestamp && (Date.now() - entry.timestamp < CACHE_TTL_MS)) {
            resolve(entry.navItems);
          } else {
            resolve(null);
          }
        });
      } catch {
        resolve(null);
      }
    });
  }

  function setCache(origin, navItems) {
    try {
      if (!isContextValid()) return;
      const key = getCacheKey(origin);
      chrome.storage.local.set({
        [key]: {
          navItems,
          timestamp: Date.now()
        }
      });
    } catch {
      // Extension context invalidated
    }
  }

  // --- Fallback: extract SiteNavigationElement from page schema ---

  function extractNavFromSchema(schemaData) {
    if (!schemaData || !schemaData.entities) return [];

    const navEntities = schemaData.entities.filter(e => {
      const raw = e.rawType;
      if (!raw) return false;
      const types = Array.isArray(raw) ? raw : [raw];
      return types.some(t =>
        typeof t === 'string' && (
          t === 'SiteNavigationElement' ||
          t.endsWith('/SiteNavigationElement')
        )
      );
    });

    if (navEntities.length === 0) return [];

    return navEntities
      .map(e => {
        const d = e.data || {};
        return {
          name: d.name || d.title || '',
          url: d.url || '',
          children: []
        };
      })
      .filter(item => item.name || item.url);
  }

  // --- Public API ---

  async function getSchemamap(origin, schemaData) {
    // Check memory cache first
    if (cachedNav && cachedNav.origin === origin) {
      return cachedNav.items.length > 0 ? cachedNav.items : null;
    }

    // Check storage cache
    const stored = await getCached(origin);
    if (stored) {
      cachedNav = { origin, items: stored };
      return stored.length > 0 ? stored : null;
    }

    // Fetch from network
    let items = await fetchSchemamap(origin);

    // Fallback to in-page SiteNavigationElement entities
    if ((!items || items.length === 0) && schemaData) {
      items = extractNavFromSchema(schemaData);
    }

    // Cache result (even empty, to avoid re-fetching on 404)
    items = items || [];
    setCache(origin, items);
    cachedNav = { origin, items };

    return items.length > 0 ? items : null;
  }

  // Expose globally for transformer.js to call
  window.__uaGetSchemamap = getSchemamap;

  // --- Message Listener ---
  // Guard inside the callback — listener persists beyond context lifetime

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (!isContextValid()) return;
        if (message.type === 'GET_SCHEMAMAP') {
          const origin = message.origin || window.location.origin;
          getSchemamap(origin, message.schemaData || null).then(items => {
            sendResponse({ navItems: items });
          });
          return true; // async response
        }
      } catch (e) {
        if (!String(e.message).includes('Extension context invalidated')) {
          console.warn('[Universal Access] Schemamap listener error:', e.message);
        }
      }
    });
  } catch {
    // Extension context already invalidated at registration time
  }
})();
