// Side panel — entry point, event listeners, rendering

import { createTreeNode, renderError } from './tree-renderer.js';
import {
  getNlwebEndpoint,
  updateNlwebSection,
  renderNlwebChunk,
  setNlwebLoading,
  showNlwebError
} from './nlweb-ui.js';

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
  const nlwebResults = document.getElementById('nlweb-results');

  // Reset NLWeb state
  setNlwebLoading(false);
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
  } else if (!getNlwebEndpoint()) {
    updateNlwebSection(null);
  }

  const hasJsonLd = data.jsonLd && data.jsonLd.length > 0;
  const hasMicrodata = data.microdata && data.microdata.length > 0;
  const hasRdfa = data.rdfa && data.rdfa.length > 0;
  const hasNlweb = !!getNlwebEndpoint();

  if (!hasJsonLd && !hasMicrodata && !hasRdfa && !hasNlweb) {
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

// NLWeb form handler
document.getElementById('nlweb-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('nlweb-query');
  const query = input.value.trim();
  if (!query || !getNlwebEndpoint()) return;

  const results = document.getElementById('nlweb-results');
  results.innerHTML = '';
  setNlwebLoading(true);

  chrome.runtime.sendMessage({
    type: 'NLWEB_QUERY',
    query,
    endpoint: getNlwebEndpoint(),
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
