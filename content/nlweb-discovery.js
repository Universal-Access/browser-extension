// NLWeb discovery — detects NLWeb support on the current page

function discoverNlweb() {
  // 1. Check <link rel="nlweb"> in document head
  const link = document.querySelector('link[rel="nlweb"]');
  if (link && link.href) {
    return { endpoint: link.href, method: 'link-rel' };
  }

  // 2. Check NLWeb search iframe (WordPress plugin embeds an iframe with the endpoint)
  const nlwebIframe = document.querySelector('iframe.nlweb-search-iframe, iframe[nlweb-search-iframe]');
  if (nlwebIframe) {
    const iframeSrc = nlwebIframe.src || nlwebIframe.getAttribute('src') || '';
    let pluginUrl = null;
    if (iframeSrc) {
      const idx = iframeSrc.lastIndexOf('/');
      if (idx > 0) pluginUrl = iframeSrc.slice(0, idx + 1);
    }
    return { endpoint: null, method: 'wp-iframe', pluginUrl };
  }

  // 3. Check [data-nlweb-search-input] DOM attribute
  const nlwebInput = document.querySelector('[data-nlweb-search-input]');
  if (nlwebInput) {
    const pluginUrl = findPluginUrl();
    return { endpoint: null, method: 'dom-attribute', pluginUrl };
  }

  return { endpoint: null, method: null };
}

function findPluginUrl() {
  const scripts = document.querySelectorAll('script[src*="nlweb-search"], link[href*="nlweb-search"]');
  for (const el of scripts) {
    const url = el.src || el.href || '';
    const match = url.match(/(https?:\/\/[^"'`\s]*\/wp-content\/plugins\/nlweb-search\/)/);
    if (match) return match[1];
  }
  return null;
}
