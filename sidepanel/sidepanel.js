// Side panel rendering logic

let nlwebEndpoint = null;

function createTreeNode(key, value, isRoot = false) {
  const node = document.createElement('div');
  node.className = 'tree-node' + (isRoot ? ' root' : '');

  if (value === null || value === undefined) {
    node.innerHTML = key !== null
      ? `<span class="tree-key">${escapeHtml(key)}</span>: <span class="tree-value null">null</span>`
      : `<span class="tree-value null">null</span>`;
    return node;
  }

  if (Array.isArray(value)) {
    const toggle = document.createElement('div');
    toggle.className = 'tree-toggle';
    toggle.innerHTML = `<span class="arrow">&#9654;</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">[${value.length}]</span>`;
    toggle.addEventListener('click', () => toggle.classList.toggle('open'));

    const children = document.createElement('div');
    children.className = 'tree-children';
    value.forEach((item, i) => {
      children.appendChild(createTreeNode(String(i), item));
    });

    node.appendChild(toggle);
    node.appendChild(children);
    return node;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const typeLabel = value['@type'] ? ` (${value['@type']})` : '';

    const toggle = document.createElement('div');
    toggle.className = 'tree-toggle' + (isRoot ? ' open' : '');
    toggle.innerHTML = `<span class="arrow">&#9654;</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">{${keys.length}}${escapeHtml(typeLabel)}</span>`;
    toggle.addEventListener('click', () => toggle.classList.toggle('open'));

    const children = document.createElement('div');
    children.className = 'tree-children';
    keys.forEach((k) => {
      children.appendChild(createTreeNode(k, value[k]));
    });

    node.appendChild(toggle);
    node.appendChild(children);
    return node;
  }

  // Leaf value
  const type = typeof value;
  const displayValue = type === 'string' ? `"${escapeHtml(value)}"` : escapeHtml(String(value));
  node.innerHTML = key !== null
    ? `<span class="tree-key">${escapeHtml(key)}</span>: <span class="tree-value ${type}">${displayValue}</span>`
    : `<span class="tree-value ${type}">${displayValue}</span>`;
  return node;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderError(item) {
  const el = document.createElement('div');
  el.className = 'schema-error';
  el.innerHTML = `<div class="error-label">Parse Error: ${escapeHtml(item.error)}</div>`;
  if (item.raw) {
    el.innerHTML += `<div class="error-raw">${escapeHtml(item.raw)}</div>`;
  }
  return el;
}

function renderSection(sectionId, items, isJsonLd = false) {
  const section = document.getElementById(`section-${sectionId}`);
  const countEl = document.getElementById(`count-${sectionId}`);
  const itemsEl = document.getElementById(`items-${sectionId}`);

  if (!items || items.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  countEl.textContent = items.length;
  itemsEl.innerHTML = '';

  items.forEach((item) => {
    if (isJsonLd) {
      if (item.error) {
        itemsEl.appendChild(renderError(item));
      } else {
        itemsEl.appendChild(createTreeNode(null, item.data, true));
      }
    } else {
      itemsEl.appendChild(createTreeNode(null, item, true));
    }
  });
}

function updateNlwebSection(endpoint, method) {
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

function renderData(data) {
  const emptyState = document.getElementById('empty-state');
  const pageUrl = document.getElementById('page-url');
  const nlwebResults = document.getElementById('nlweb-results');

  // Reset NLWeb state
  nlwebResults.innerHTML = '';

  if (!data) {
    emptyState.hidden = false;
    pageUrl.textContent = '';
    document.getElementById('section-jsonld').hidden = true;
    document.getElementById('section-microdata').hidden = true;
    document.getElementById('section-rdfa').hidden = true;
    updateNlwebSection(null);
    return;
  }

  pageUrl.textContent = data.url || '';

  // Handle NLWeb discovery
  if (data.nlweb && data.nlweb.endpoint) {
    updateNlwebSection(data.nlweb.endpoint, data.nlweb.method);
  } else if (!nlwebEndpoint) {
    // Only hide if we haven't already resolved an endpoint independently
    updateNlwebSection(null);
  }

  const hasJsonLd = data.jsonLd && data.jsonLd.length > 0;
  const hasMicrodata = data.microdata && data.microdata.length > 0;
  const hasRdfa = data.rdfa && data.rdfa.length > 0;
  const hasNlweb = !!nlwebEndpoint;

  if (!hasJsonLd && !hasMicrodata && !hasRdfa && !hasNlweb) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  renderSection('jsonld', data.jsonLd, true);
  renderSection('microdata', data.microdata);
  renderSection('rdfa', data.rdfa);
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

function createResultCard(item) {
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

  // If schema_object present, render it with the tree viewer
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
      document.getElementById('nlweb-form').dispatchEvent(new Event('submit'));
    });
    container.appendChild(btn);
  }
  return container;
}

// Render a chunk from the NLWeb stream, handling different message_type formats
function renderNlwebChunk(chunk) {
  const results = document.getElementById('nlweb-results');
  const messageType = chunk.message_type;

  if (messageType === 'summary' || messageType === 'chat_response') {
    const title = chunk.title || '';
    const message = chunk.message || chunk.summary || chunk.text || chunk.content || '';
    if (title || message) {
      // Insert summary at the top, before result cards
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

function setNlwebLoading(loading) {
  const submit = document.getElementById('nlweb-submit');
  const input = document.getElementById('nlweb-query');
  const results = document.getElementById('nlweb-results');

  submit.disabled = loading;
  input.disabled = loading;
  submit.textContent = loading ? '...' : 'Ask';

  if (loading) {
    // Remove any previous loading indicator
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

function showNlwebError(message) {
  const results = document.getElementById('nlweb-results');
  const err = document.createElement('div');
  err.className = 'nlweb-error';
  err.textContent = message;
  results.appendChild(err);
}

// Section toggle handlers
document.querySelectorAll('.section-header').forEach((header) => {
  header.addEventListener('click', () => {
    header.classList.toggle('open');
  });
});

// NLWeb form handler
document.getElementById('nlweb-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('nlweb-query');
  const query = input.value.trim();
  if (!query || !nlwebEndpoint) return;

  const results = document.getElementById('nlweb-results');
  results.innerHTML = '';
  setNlwebLoading(true);

  chrome.runtime.sendMessage({
    type: 'NLWEB_QUERY',
    query,
    endpoint: nlwebEndpoint,
    mode: 'summarize'
  });
});

// Request data on load
chrome.runtime.sendMessage({ type: 'GET_SCHEMA_DATA' }, (response) => {
  if (chrome.runtime.lastError) {
    renderData(null);
    return;
  }
  renderData(response);
});

// Listen for live updates
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'SCHEMA_UPDATE') {
    renderData(message.payload);
  }

  if (message.type === 'NLWEB_ENDPOINT') {
updateNlwebSection(message.endpoint, message.method);
  }

  if (message.type === 'NLWEB_RESULT_CHUNK') {
    if (message.error) {
      setNlwebLoading(false);
      showNlwebError(message.error);
      return;
    }

    if (message.done) {
      setNlwebLoading(false);
      return;
    }

    if (message.chunk) {
      renderNlwebChunk(message.chunk);
    }
  }
});
