import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { probeSchemaAggregation, fetchAggregatedProducts } from '../../background/schema-aggregation-client.js';

describe('probeSchemaAggregation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts slugs from valid XML with <loc> entries', async () => {
    const xml = `<?xml version="1.0"?>
      <urlset>
        <url><loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/product</loc></url>
        <url><loc>https://example.com/wp-json/yoast/v1/schema-aggregator/get-schema/post</loc></url>
      </urlset>`;
    fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve(xml) });

    const result = await probeSchemaAggregation('https://example.com');
    expect(result).toEqual(expect.arrayContaining(['product', 'post']));
    expect(result).toHaveLength(2);
  });

  it('returns null for non-ok response', async () => {
    fetch.mockResolvedValue({ ok: false });
    expect(await probeSchemaAggregation('https://example.com')).toBeNull();
  });

  it('returns null when no <loc> tags found', async () => {
    fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve('<urlset></urlset>') });
    expect(await probeSchemaAggregation('https://example.com')).toBeNull();
  });

  it('returns null on network error', async () => {
    fetch.mockRejectedValue(new Error('Network error'));
    expect(await probeSchemaAggregation('https://example.com')).toBeNull();
  });
});

describe('fetchAggregatedProducts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('parses NDJSON with Product types', async () => {
    const ndjson = '{"@type":"Product","name":"Widget"}\n{"@type":"Product","name":"Gadget"}\n';
    fetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(ndjson) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const products = await fetchAggregatedProducts('https://example.com');
    expect(products).toHaveLength(2);
    expect(products[0].name).toBe('Widget');
    expect(products[1].name).toBe('Gadget');
  });

  it('extracts products from @graph nested objects', async () => {
    const ndjson = JSON.stringify({
      '@graph': [
        { '@type': 'Product', name: 'A' },
        { '@type': 'WebPage', name: 'B' },
        { '@type': 'SoftwareApplication', name: 'C' },
      ],
    });
    fetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(ndjson) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const products = await fetchAggregatedProducts('https://example.com');
    expect(products).toHaveLength(2);
    expect(products.map(p => p.name)).toEqual(['A', 'C']);
  });

  it('paginates until 404', async () => {
    const page1 = '{"@type":"Product","name":"P1"}\n';
    const page2 = '{"@type":"Product","name":"P2"}\n';
    fetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(page1) })
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(page2) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const products = await fetchAggregatedProducts('https://example.com');
    expect(products).toHaveLength(2);
    expect(products.map(p => p.name)).toEqual(['P1', 'P2']);
  });

  it('throws on HTTP error on page 1', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Internal Server Error' });
    await expect(fetchAggregatedProducts('https://example.com')).rejects.toThrow('HTTP 500');
  });

  it('filters non-Product types', async () => {
    const ndjson = '{"@type":"Product","name":"Yes"}\n{"@type":"WebPage","name":"No"}\n{"@type":"Person","name":"No"}\n';
    fetch
      .mockResolvedValueOnce({ ok: true, text: () => Promise.resolve(ndjson) })
      .mockResolvedValueOnce({ ok: false, status: 404 });

    const products = await fetchAggregatedProducts('https://example.com');
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe('Yes');
  });
});
