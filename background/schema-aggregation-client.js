// Schema Aggregation client — probes XML endpoint and fetches NDJSON product data

/**
 * Probes the Yoast Schema Aggregation XML endpoint and extracts post type slugs.
 * Runs in the service worker to avoid same-origin/CORS issues in content scripts.
 * @param {string} origin - The site origin (e.g. "https://example.com")
 * @returns {Promise<string[]|null>} Array of post type slugs, or null if unavailable
 */
export async function probeSchemaAggregation(origin) {
  const url = `${origin}/wp-json/yoast/v1/schema-aggregator/get-xml`;
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/xml, text/xml, */*' }
    });
    if (!resp.ok) return null;
    const text = await resp.text();

    // Service workers have no DOMParser — extract <loc> URLs with regex
    const locRegex = /<loc>\s*(.*?)\s*<\/loc>/gi;
    const slugs = new Set();
    let locMatch;
    let locCount = 0;
    while ((locMatch = locRegex.exec(text)) !== null) {
      locCount++;
      const locUrl = locMatch[1].trim();
      const slugMatch = locUrl.match(/\/get-schema\/([^/?]+)/);
      if (slugMatch) slugs.add(slugMatch[1]);
    }
    if (locCount === 0) return null;

    return slugs.size > 0 ? Array.from(slugs) : null;
  } catch {
    return null;
  }
}

/**
 * Fetches all Product entities from the schema aggregation NDJSON endpoint.
 * @param {string} origin - The site origin (e.g. "https://example.com")
 * @returns {Promise<Array>} Array of Product-typed schema entities
 */
export async function fetchAggregatedProducts(origin) {
  const url = `${origin}/wp-json/yoast/v1/schema-aggregator/get-schema/product`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);

  const text = await resp.text();
  const products = [];

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      // Filter to Product-typed entities
      if (isProduct(parsed)) {
        products.push(parsed);
      } else if (parsed['@graph'] && Array.isArray(parsed['@graph'])) {
        for (const node of parsed['@graph']) {
          if (isProduct(node)) products.push(node);
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return products;
}

function isProduct(obj) {
  if (!obj || typeof obj !== 'object') return false;
  const type = obj['@type'];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  const productTypes = ['Product', 'SoftwareApplication', 'WebApplication', 'MobileApplication', 'IndividualProduct'];
  return types.some(t => typeof t === 'string' && productTypes.includes(t));
}
