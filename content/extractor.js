// Schema.org structured data extractor
// Extracts JSON-LD, Microdata, and RDFa from the current page

function extractJsonLd() {
  const items = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent);
      items.push({ data, error: null });
    } catch (e) {
      items.push({ data: null, error: e.message, raw: script.textContent.slice(0, 500) });
    }
  });
  return items;
}

function parseMicrodataItem(element) {
  const item = {};
  const itemType = element.getAttribute('itemtype');
  if (itemType) {
    item['@type'] = itemType;
  }

  const children = element.querySelectorAll('[itemprop]');
  children.forEach((child) => {
    // Only process direct children of this itemscope
    if (child.closest('[itemscope]') !== element) return;

    const prop = child.getAttribute('itemprop');
    let value;

    if (child.hasAttribute('itemscope')) {
      value = parseMicrodataItem(child);
    } else if (child.tagName === 'META') {
      value = child.getAttribute('content') || '';
    } else if (child.tagName === 'A' || child.tagName === 'LINK') {
      value = child.getAttribute('href') || '';
    } else if (child.tagName === 'IMG') {
      value = child.getAttribute('src') || '';
    } else if (child.tagName === 'TIME') {
      value = child.getAttribute('datetime') || child.textContent.trim();
    } else {
      value = child.textContent.trim();
    }

    // Support multiple values for the same property
    if (item[prop] !== undefined) {
      if (!Array.isArray(item[prop])) {
        item[prop] = [item[prop]];
      }
      item[prop].push(value);
    } else {
      item[prop] = value;
    }
  });

  return item;
}

function extractMicrodata() {
  const items = [];
  const topLevel = document.querySelectorAll('[itemscope]:not([itemprop])');
  topLevel.forEach((element) => {
    items.push(parseMicrodataItem(element));
  });
  return items;
}

function parseRdfaItem(element) {
  const item = {};
  const typeOf = element.getAttribute('typeof');
  if (typeOf) {
    item['@type'] = typeOf;
  }
  const vocab = element.getAttribute('vocab');
  if (vocab) {
    item['@vocab'] = vocab;
  }

  const children = element.querySelectorAll('[property]');
  children.forEach((child) => {
    // Only process direct children of this typeof scope
    const closestTypeof = child.parentElement && child.parentElement.closest('[typeof]');
    if (closestTypeof !== element) return;

    const prop = child.getAttribute('property');
    let value;

    if (child.hasAttribute('typeof')) {
      value = parseRdfaItem(child);
    } else if (child.hasAttribute('content')) {
      value = child.getAttribute('content');
    } else if (child.tagName === 'A' || child.tagName === 'LINK') {
      value = child.getAttribute('href') || '';
    } else if (child.tagName === 'IMG') {
      value = child.getAttribute('src') || '';
    } else if (child.tagName === 'TIME') {
      value = child.getAttribute('datetime') || child.textContent.trim();
    } else {
      value = child.textContent.trim();
    }

    if (item[prop] !== undefined) {
      if (!Array.isArray(item[prop])) {
        item[prop] = [item[prop]];
      }
      item[prop].push(value);
    } else {
      item[prop] = value;
    }
  });

  return item;
}

function extractRdfa() {
  const items = [];
  const topLevel = document.querySelectorAll('[typeof]');
  // Filter to only top-level typeof elements (not nested inside another typeof)
  topLevel.forEach((element) => {
    const parent = element.parentElement && element.parentElement.closest('[typeof]');
    if (!parent) {
      items.push(parseRdfaItem(element));
    }
  });
  return items;
}

function extractAll() {
  return {
    jsonLd: extractJsonLd(),
    microdata: extractMicrodata(),
    rdfa: extractRdfa(),
    nlweb: discoverNlweb(),
    url: window.location.href
  };
}

// Send data to service worker on load
const data = extractAll();
chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: data });

// Listen for on-demand re-extraction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_EXTRACTION') {
    const freshData = extractAll();
    chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: freshData });
    sendResponse(freshData);
  }
});
