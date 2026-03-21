// Tree node rendering and HTML utilities

import { iconChevronRight } from './icons.js';

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function createTreeNode(key, value, isRoot = false) {
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
    toggle.innerHTML = `<span class="arrow">${iconChevronRight()}</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">[${value.length}]</span>`;
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
    toggle.innerHTML = `<span class="arrow">${iconChevronRight()}</span> ${key !== null ? `<span class="tree-key">${escapeHtml(key)}</span>` : ''} <span style="color:#666">{${keys.length}}${escapeHtml(typeLabel)}</span>`;
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

export function renderError(item) {
  const el = document.createElement('div');
  el.className = 'schema-error';
  el.innerHTML = `<div class="error-label">Parse Error: ${escapeHtml(item.error)}</div>`;
  if (item.raw) {
    el.innerHTML += `<div class="error-raw">${escapeHtml(item.raw)}</div>`;
  }
  return el;
}
