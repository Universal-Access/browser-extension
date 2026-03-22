// NLWeb UI — query form, result cards, and streaming display

import { createTreeNode, escapeHtml } from './tree-renderer.js';
import { iconAccessibility } from './icons.js';

let nlwebEndpoint = null;
let loadingChangeCallback = null;

export function onLoadingChange(callback) {
  loadingChangeCallback = callback;
}

export function getNlwebEndpoint() {
  return nlwebEndpoint;
}

export function updateNlwebSection(endpoint, method) {
  const section = document.getElementById('nlweb-section');
  const endpointInfo = document.getElementById('nlweb-endpoint-info');

  if (endpoint) {
    nlwebEndpoint = endpoint;
    section.hidden = false;
    if (endpointInfo) {
      try {
        const url = new URL(endpoint);
        endpointInfo.textContent = url.hostname;
        endpointInfo.title = endpoint;
      } catch {
        endpointInfo.textContent = endpoint;
        endpointInfo.title = endpoint;
      }
    }
  } else {
    nlwebEndpoint = null;
    section.hidden = true;
    if (endpointInfo) endpointInfo.textContent = '';
  }
}

function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function tryParseJson(val) {
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return null; }
}

export function createResultCard(item) {
  const card = document.createElement('div');
  card.className = 'nlweb-result-card';

  const name = item.name || item.title || 'Untitled';
  const url = item.url || item.link;
  const description = item.description || item.snippet || '';
  const score = item.score != null ? item.score : null;

  let html = '<div class="nlweb-result-header">';
  if (url && isSafeUrl(url)) {
    html += `<a href="${escapeHtml(url)}" class="nlweb-result-name" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`;
  } else {
    html += `<span class="nlweb-result-name">${escapeHtml(name)}</span>`;
  }
  if (score !== null) {
    html += `<span class="nlweb-result-score">${Number(score).toFixed(2)}</span>`;
  }
  html += '</div>';

  if (description) {
    html += `<div class="nlweb-result-description">${escapeHtml(description)}</div>`;
  }

  card.innerHTML = html;

  const parsed = tryParseJson(item.schema_object);
  if (parsed) {
    // Add "Read Accessible" button to open in the overlay renderer
    const actionsRow = document.createElement('div');
    actionsRow.className = 'nlweb-result-actions';

    const readBtn = document.createElement('button');
    readBtn.className = 'nlweb-read-btn';
    readBtn.textContent = 'Read Accessible';
    readBtn.title = 'Open in accessible reader view';
    readBtn.addEventListener('click', () => {
      activateNlwebResult(parsed, url);
    });
    actionsRow.appendChild(readBtn);

    card.appendChild(actionsRow);

    // Raw schema data (collapsed by default for debugging)
    const schemaDetails = document.createElement('details');
    schemaDetails.className = 'nlweb-result-schema-details';
    const summary = document.createElement('summary');
    summary.className = 'nlweb-result-schema-toggle';
    summary.textContent = 'Schema data';
    schemaDetails.appendChild(summary);
    const schemaContainer = document.createElement('div');
    schemaContainer.className = 'nlweb-result-schema';
    schemaContainer.appendChild(createTreeNode(null, parsed, true));
    schemaDetails.appendChild(schemaContainer);
    card.appendChild(schemaDetails);
  }

  return card;
}

// Build a synthetic schemaData payload from an NLWeb result's schema_object
// and send it to the content script for overlay rendering
function activateNlwebResult(schemaObj, url) {
  const rawType = schemaObj['@type'] || 'Article';
  const typeStr = Array.isArray(rawType) ? rawType[0] : rawType;
  const cleaned = String(typeStr).replace(/^https?:\/\/schema\.org\//, '');

  // Map to our known primary types
  const ARTICLE_TYPES = ['Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle', 'Report', 'Review', 'WebPage'];
  const PRODUCT_TYPES = ['Product', 'SoftwareApplication', 'Service', 'Offer'];
  const RECIPE_TYPE = 'Recipe';
  const EVENT_TYPES = ['Event', 'MusicEvent', 'SportsEvent'];
  const BIZ_TYPES = ['LocalBusiness', 'Restaurant', 'Store', 'Hotel'];

  let primaryType = cleaned;
  if (ARTICLE_TYPES.includes(cleaned)) primaryType = 'Article';
  else if (PRODUCT_TYPES.includes(cleaned)) primaryType = 'Product';
  else if (cleaned === RECIPE_TYPE) primaryType = 'Recipe';
  else if (EVENT_TYPES.includes(cleaned)) primaryType = 'Event';
  else if (BIZ_TYPES.includes(cleaned)) primaryType = 'LocalBusiness';
  else if (cleaned === 'FAQPage') primaryType = 'FAQPage';

  const syntheticData = {
    jsonLd: [{ data: schemaObj, error: null }],
    microdata: [],
    rdfa: [],
    entities: [{ type: primaryType, rawType: typeStr, source: 'nlweb', data: schemaObj }],
    primaryType: primaryType,
    url: url || schemaObj.url || window.location.href
  };

  chrome.runtime.sendMessage({
    type: 'ACTIVATE_TRANSFORM',
    payload: syntheticData
  });
}

function createSummaryCard(title, message) {
  const card = document.createElement('div');
  card.className = 'nlweb-result-card nlweb-summary-card';
  let html = '';
  if (title) html += `<div class="nlweb-summary-title">${escapeHtml(title)}</div>`;
  if (message) html += `<div class="nlweb-result-description">${escapeHtml(message)}</div>`;
  card.innerHTML = html;
  return card;
}

function createSuggestedQueries(queries) {
  const container = document.createElement('div');
  container.className = 'nlweb-suggested-queries';
  container.innerHTML = '<div class="nlweb-suggested-label">Related questions</div>';
  for (const q of queries) {
    const btn = document.createElement('button');
    btn.className = 'nlweb-suggested-btn';
    btn.textContent = q;
    btn.addEventListener('click', () => {
      document.getElementById('nlweb-query').value = q;
      document.getElementById('nlweb-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    container.appendChild(btn);
  }
  return container;
}

// Message types that are lifecycle/metadata — skip silently
const SKIP_MESSAGE_TYPES = new Set([
  'begin-nlweb-response', 'end-nlweb-response', 'complete',
  'header', 'api_version', 'status', 'conversation_created',
  'sites_response', 'conversation_history', 'end-conversation-history',
  'query_analysis', 'decontextualized_query', 'remember',
  'multi_site_complete'
]);

export function renderNlwebChunk(chunk) {
  const results = document.getElementById('nlweb-results');
  const messageType = chunk.message_type;

  // --- Individual result (primary result type in NLWeb protocol) ---
  if (messageType === 'result') {
    // v0.55 wraps in { index, item }, legacy sends flat
    const item = chunk.item || chunk;
    if (item.name || item.url || item.title) {
      results.appendChild(createResultCard(item));
    }
    return;
  }

  // --- Generated answer / RAG summary (summarize/generate mode) ---
  if (messageType === 'nlws') {
    const answer = chunk.answer || chunk.text || chunk.content || '';
    const title = chunk.title || 'Answer';
    if (answer || title) {
      const firstChild = results.firstChild;
      const card = createSummaryCard(title, answer);
      if (firstChild) {
        results.insertBefore(card, firstChild);
      } else {
        results.appendChild(card);
      }
    }
    // Also render any inline result items
    const items = chunk.items || [];
    for (const item of items) {
      if (item.name || item.url) {
        results.appendChild(createResultCard(item));
      }
    }
    return;
  }

  // --- Summary (legacy + intermediate summaries) ---
  if (messageType === 'summary' || messageType === 'chat_response') {
    const title = chunk.title || '';
    const message = chunk.message || chunk.summary || chunk.text || chunk.content || '';
    if (title || message) {
      const firstChild = results.firstChild;
      const card = createSummaryCard(title, message);
      if (firstChild) {
        results.insertBefore(card, firstChild);
      } else {
        results.appendChild(card);
      }
    }
    return;
  }

  // --- Item details ---
  if (messageType === 'item_details') {
    if (chunk.name || chunk.url) {
      results.appendChild(createResultCard(chunk));
    }
    return;
  }

  // --- Intermediate status messages ---
  if (messageType === 'intermediate_message' || messageType === 'asking_sites') {
    const text = chunk.message || chunk.text || '';
    if (text) {
      // Update the loading indicator text if present
      const loader = results.querySelector('.nlweb-loading');
      if (loader) loader.textContent = text;
    }
    return;
  }

  // --- Batch results (legacy / custom servers) ---
  if (messageType === 'result_batch') {
    const items = chunk.results || chunk.items || [];
    for (const item of items) {
      results.appendChild(createResultCard(item));
    }
    return;
  }

  // --- Suggested queries ---
  if (messageType === 'similar_results') {
    const queries = chunk.queries || [];
    if (queries.length > 0) {
      results.appendChild(createSuggestedQueries(queries));
    }
    return;
  }

  // --- Error ---
  if (messageType === 'error') {
    showNlwebError(chunk.error || chunk.message || 'Unknown error');
    return;
  }

  // --- Skip known metadata/lifecycle types silently ---
  if (SKIP_MESSAGE_TYPES.has(messageType)) return;

  // --- Unknown message_type — don't silently drop, try to render ---
  if (chunk.name || chunk.title || chunk.url) {
    results.appendChild(createResultCard(chunk));
  }
}

export function setNlwebLoading(loading) {
  const submit = document.getElementById('nlweb-submit');
  const input = document.getElementById('nlweb-query');
  const results = document.getElementById('nlweb-results');

  if (loadingChangeCallback) {
    loadingChangeCallback(loading);
  }

  submit.disabled = loading;
  input.disabled = loading;
  submit.textContent = loading ? '...' : 'Ask';

  if (loading) {
    const existing = results.querySelector('.nlweb-loading');
    if (!existing) {
      const loader = document.createElement('div');
      loader.className = 'nlweb-loading';
      loader.textContent = 'Searching...';
      results.appendChild(loader);
    }
  } else {
    const loader = results.querySelector('.nlweb-loading');
    if (loader) loader.remove();
  }
}

export function showNlwebError(message) {
  const results = document.getElementById('nlweb-results');
  const err = document.createElement('div');
  err.className = 'nlweb-error';
  err.innerHTML = `<span>${escapeHtml(message)}</span>`;

  const retryBtn = document.createElement('button');
  retryBtn.className = 'nlweb-retry-btn';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', () => {
    err.remove();
    document.getElementById('nlweb-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  err.appendChild(retryBtn);

  results.appendChild(err);
}
