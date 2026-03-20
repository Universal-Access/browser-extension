// NLWeb UI — query form, result cards, and streaming display

import { createTreeNode, escapeHtml } from './tree-renderer.js';

let nlwebEndpoint = null;

export function getNlwebEndpoint() {
  return nlwebEndpoint;
}

export function updateNlwebSection(endpoint, method) {
  const section = document.getElementById('nlweb-section');
  const endpointInfo = document.getElementById('nlweb-endpoint-info');

  if (endpoint) {
    nlwebEndpoint = endpoint;
    section.hidden = false;
    try {
      const url = new URL(endpoint);
      endpointInfo.textContent = url.hostname;
      endpointInfo.title = endpoint;
    } catch {
      endpointInfo.textContent = endpoint;
      endpointInfo.title = endpoint;
    }
  } else {
    nlwebEndpoint = null;
    section.hidden = true;
    endpointInfo.textContent = '';
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
    const schemaContainer = document.createElement('div');
    schemaContainer.className = 'nlweb-result-schema';
    schemaContainer.appendChild(createTreeNode(null, parsed, true));
    card.appendChild(schemaContainer);
  }

  return card;
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

export function renderNlwebChunk(chunk) {
  const results = document.getElementById('nlweb-results');
  const messageType = chunk.message_type;

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

  if (messageType === 'result_batch') {
    const items = chunk.results || chunk.items || [];
    for (const item of items) {
      results.appendChild(createResultCard(item));
    }
    return;
  }

  if (messageType === 'similar_results') {
    const queries = chunk.queries || [];
    if (queries.length > 0) {
      results.appendChild(createSuggestedQueries(queries));
    }
    return;
  }

  if (messageType === 'error') {
    showNlwebError(chunk.error || chunk.message || 'Unknown error');
    return;
  }

  // Skip metadata message types
  if (messageType) return;

  // Generic: treat the chunk itself as a single result item
  if (chunk.name || chunk.title || chunk.url) {
    results.appendChild(createResultCard(chunk));
  }
}

export function setNlwebLoading(loading) {
  const submit = document.getElementById('nlweb-submit');
  const input = document.getElementById('nlweb-query');
  const results = document.getElementById('nlweb-results');

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
