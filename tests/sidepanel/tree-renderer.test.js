import { describe, it, expect } from 'vitest';
import { escapeHtml, createTreeNode, renderError } from '../../sidepanel/tree-renderer.js';

describe('escapeHtml', () => {
  it('escapes <, >, and &', () => {
    const result = escapeHtml('<div>foo &amp; bar</div>');
    expect(result).toContain('&lt;');
    expect(result).toContain('&gt;');
    expect(result).toContain('&amp;');
    expect(result).not.toContain('<div>');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('passes through plain text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});

describe('createTreeNode', () => {
  it('renders leaf string value', () => {
    const node = createTreeNode('name', 'Alice');
    expect(node.className).toBe('tree-node');
    expect(node.innerHTML).toContain('name');
    expect(node.innerHTML).toContain('Alice');
    expect(node.innerHTML).toContain('tree-value string');
  });

  it('renders leaf number value', () => {
    const node = createTreeNode('count', 42);
    expect(node.innerHTML).toContain('42');
    expect(node.innerHTML).toContain('tree-value number');
  });

  it('renders null value', () => {
    const node = createTreeNode('field', null);
    expect(node.innerHTML).toContain('tree-value null');
    expect(node.innerHTML).toContain('null');
  });

  it('renders array with count', () => {
    const node = createTreeNode('items', ['a', 'b', 'c']);
    expect(node.innerHTML).toContain('[3]');
    expect(node.querySelector('.tree-children').children).toHaveLength(3);
  });

  it('renders object with @type label', () => {
    const node = createTreeNode('product', { '@type': 'Product', name: 'Widget' });
    expect(node.innerHTML).toContain('(Product)');
    expect(node.innerHTML).toContain('{2}');
  });

  it('renders nested structures', () => {
    const node = createTreeNode('root', {
      items: [{ name: 'A' }],
    });
    const children = node.querySelector('.tree-children');
    expect(children).toBeTruthy();
    // items is an object key, its child should be an array node
    const itemsNode = children.querySelector('.tree-children');
    expect(itemsNode).toBeTruthy();
  });

  it('adds root class when isRoot is true', () => {
    const node = createTreeNode('data', { a: 1 }, true);
    expect(node.className).toContain('root');
    // Root toggle should be open by default
    const toggle = node.querySelector('.tree-toggle');
    expect(toggle.className).toContain('open');
  });
});

describe('renderError', () => {
  it('displays error message', () => {
    const el = renderError({ error: 'Invalid JSON' });
    expect(el.className).toBe('schema-error');
    expect(el.innerHTML).toContain('Invalid JSON');
    expect(el.innerHTML).toContain('Parse Error');
  });

  it('includes raw content when present', () => {
    const el = renderError({ error: 'Bad data', raw: '{broken json' });
    expect(el.innerHTML).toContain('{broken json');
    expect(el.innerHTML).toContain('error-raw');
  });
});
