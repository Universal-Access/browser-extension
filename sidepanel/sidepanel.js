// Side panel — control hub for Universal Access
// Orchestrates schema display, visual transformations, and presets

(function () {
  'use strict';

  // --- State ---
  let currentData = null;
  let isTransformActive = false;

  // --- DOM References ---
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const statusBar = document.getElementById('status-indicator');
  const pageUrl = document.getElementById('page-url');
  const emptyState = document.getElementById('empty-state');
  const displaySection = document.getElementById('display-section');
  const detectedTypeDesc = document.getElementById('detected-type-desc');
  const btnActivate = document.getElementById('btn-activate');
  const btnDeactivate = document.getElementById('btn-deactivate');
  const presetsSection = document.getElementById('presets-section');
  const rawDataSection = document.getElementById('raw-data-section');

  // --- Status Updates ---

  function setStatus(icon, text, className) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusBar.className = 'status-bar ' + (className || '');
  }

  // --- Schema Data Rendering ---

  function handleSchemaData(data) {
    currentData = data;

    if (!data) {
      setStatus('📄', 'No structured data found', 'empty');
      emptyState.hidden = false;
      displaySection.hidden = true;
      presetsSection.hidden = true;
      rawDataSection.hidden = true;
      pageUrl.textContent = '';
      return;
    }

    pageUrl.textContent = data.url || '';
    emptyState.hidden = true;

    const hasEntities = data.entities && data.entities.length > 0;
    const primaryType = data.primaryType || 'Unknown';

    if (hasEntities && primaryType !== 'Unknown') {
      const typeEmoji = { Product: '🛍️', Article: '📰', Recipe: '🍳' }[primaryType] || '📦';
      setStatus(typeEmoji, `${primaryType} detected (${data.entities.length} entities)`, 'found');

      displaySection.hidden = false;
      presetsSection.hidden = false;

      const typeDescs = {
        Product: 'View product details in a clean, accessible layout with price, ratings, and description.',
        Article: 'Read this article in a distraction-free reader mode.',
        Recipe: 'Follow this recipe step-by-step with ingredient checklist.'
      };
      detectedTypeDesc.textContent = typeDescs[primaryType] || `Transform this ${primaryType} into an accessible view.`;
    } else {
      const totalCount = (data.jsonLd || []).length + (data.microdata || []).length + (data.rdfa || []).length;
      if (totalCount > 0) {
        setStatus('📊', `${totalCount} schema items (no supported type)`, 'found');
        displaySection.hidden = true;
        presetsSection.hidden = true;
      } else {
        setStatus('📄', 'No structured data found', 'empty');
        emptyState.hidden = false;
        displaySection.hidden = true;
        presetsSection.hidden = true;
      }
    }

    // Render raw data sections
    const hasAnyRaw = (data.jsonLd?.length || 0) + (data.microdata?.length || 0) + (data.rdfa?.length || 0) > 0;
    rawDataSection.hidden = !hasAnyRaw;
    if (hasAnyRaw) {
      renderSection('jsonld', data.jsonLd, true);
      renderSection('microdata', data.microdata);
      renderSection('rdfa', data.rdfa);
    }
  }

  // --- Activate / Deactivate ---

  btnActivate.addEventListener('click', () => {
    if (!currentData) return;
    chrome.runtime.sendMessage({
      type: 'ACTIVATE_TRANSFORM',
      payload: currentData
    }, () => {
      isTransformActive = true;
      btnActivate.hidden = true;
      btnDeactivate.hidden = false;
    });
  });

  btnDeactivate.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'DEACTIVATE_TRANSFORM' }, () => {
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
    });
  });

  // --- Preset Selection ---

  document.querySelectorAll('.preset-option').forEach((option) => {
    const radio = option.querySelector('input[type="radio"]');
    radio.addEventListener('change', () => {
      // Update active state
      document.querySelectorAll('.preset-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');

      // Send preset change
      chrome.runtime.sendMessage({ type: 'SET_PRESET', preset: radio.value });
    });
  });

  // Restore saved preset
  chrome.storage.local.get('uaPreset', (result) => {
    if (result.uaPreset) {
      const radio = document.querySelector(`input[name="preset"][value="${result.uaPreset}"]`);
      if (radio) {
        radio.checked = true;
        document.querySelectorAll('.preset-option').forEach(o => o.classList.remove('active'));
        radio.closest('.preset-option').classList.add('active');
      }
    }
  });

  // --- Raw Data Tree Rendering ---

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
      toggle.innerHTML = `<span class="arrow">▶</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">[${value.length}]</span>`;
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
      toggle.innerHTML = `<span class="arrow">▶</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">{${keys.length}}${escapeHtml(typeLabel)}</span>`;
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

  // --- Toggle Handlers ---

  document.querySelectorAll('.section-toggle, .subsection-header').forEach((header) => {
    header.addEventListener('click', () => {
      header.classList.toggle('open');
    });
  });

  // --- Initialize ---

  // Request schema data
  chrome.runtime.sendMessage({ type: 'GET_SCHEMA_DATA' }, (response) => {
    if (chrome.runtime.lastError) {
      handleSchemaData(null);
      return;
    }
    handleSchemaData(response);
  });

  // Listen for live updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'SCHEMA_UPDATE') {
      handleSchemaData(message.payload);
    }
    if (message.type === 'DEACTIVATE_TRANSFORM') {
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
    }
  });
})();
