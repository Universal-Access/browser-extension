// Side panel rendering logic

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

function renderData(data) {
  const emptyState = document.getElementById('empty-state');
  const pageUrl = document.getElementById('page-url');

  if (!data) {
    emptyState.hidden = false;
    pageUrl.textContent = '';
    document.getElementById('section-jsonld').hidden = true;
    document.getElementById('section-microdata').hidden = true;
    document.getElementById('section-rdfa').hidden = true;
    return;
  }

  pageUrl.textContent = data.url || '';

  const hasJsonLd = data.jsonLd && data.jsonLd.length > 0;
  const hasMicrodata = data.microdata && data.microdata.length > 0;
  const hasRdfa = data.rdfa && data.rdfa.length > 0;

  if (!hasJsonLd && !hasMicrodata && !hasRdfa) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  renderSection('jsonld', data.jsonLd, true);
  renderSection('microdata', data.microdata);
  renderSection('rdfa', data.rdfa);
}

// Section toggle handlers
document.querySelectorAll('.section-header').forEach((header) => {
  header.addEventListener('click', () => {
    header.classList.toggle('open');
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
});
