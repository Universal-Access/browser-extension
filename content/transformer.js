// Visual Transformation Engine
// Creates an accessible overlay that replaces the cluttered page with a clean,
// schema-driven view optimized for the detected entity type.
// Resolves @graph references to build a complete entity picture.

(function () {
  'use strict';

  const OVERLAY_ID = 'ua-accessible-overlay';
  const OVERLAY_STYLE_ID = 'ua-overlay-styles';

  let currentOverlay = null;
  let originalOverflow = '';

  // --- @graph resolver ---
  // Yoast and many CMS output @graph arrays where entities reference each other via @id.
  // This function builds an index and resolves references so each entity has full data.

  function buildGraphIndex(schemaData) {
    const index = new Map();
    const allItems = [];

    // Collect all entities from JSON-LD
    if (schemaData.jsonLd) {
      for (const item of schemaData.jsonLd) {
        const data = item.data || item;
        if (data && data['@graph'] && Array.isArray(data['@graph'])) {
          for (const node of data['@graph']) {
            if (node['@id']) index.set(node['@id'], node);
            allItems.push(node);
          }
        } else if (data) {
          if (data['@id']) index.set(data['@id'], data);
          allItems.push(data);
        }
      }
    }

    return { index, allItems };
  }

  function resolveRef(value, index, depth = 0) {
    if (depth > 5) return value; // prevent cycles
    if (!value || typeof value !== 'object') return value;
    if (value['@id'] && Object.keys(value).length <= 2 && index.has(value['@id'])) {
      return resolveRef(index.get(value['@id']), index, depth + 1);
    }
    return value;
  }

  function resolveEntity(data, index) {
    if (!data || typeof data !== 'object') return data;
    const resolved = Array.isArray(data) ? [...data] : { ...data };
    for (const key of Object.keys(resolved)) {
      const val = resolved[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        resolved[key] = resolveRef(val, index);
      } else if (Array.isArray(val)) {
        resolved[key] = val.map(item =>
          typeof item === 'object' ? resolveRef(item, index) : item
        );
      }
    }
    return resolved;
  }

  // Find the best Product entity by merging all Product-typed nodes
  function findProductData(schemaData) {
    const { index, allItems } = buildGraphIndex(schemaData);
    const productTypes = ['Product', 'SoftwareApplication', 'WebApplication', 'MobileApplication', 'IndividualProduct'];

    let merged = {};
    for (const item of allItems) {
      const type = item['@type'];
      const types = Array.isArray(type) ? type : [type];
      if (types.some(t => productTypes.includes(t))) {
        const resolved = resolveEntity(item, index);
        // Merge — later values win, but don't overwrite with empty
        for (const [k, v] of Object.entries(resolved)) {
          if (v !== null && v !== undefined && v !== '') {
            merged[k] = v;
          }
        }
      }
    }

    // Also resolve nested objects in the merged result
    merged = resolveEntity(merged, index);

    // Collect FAQ questions from the graph
    const faqs = allItems
      .filter(item => item['@type'] === 'Question')
      .map(q => {
        const resolved = resolveEntity(q, index);
        const answer = resolved.acceptedAnswer || resolved.suggestedAnswer;
        return {
          question: resolved.name || resolved.text || '',
          answer: answer ? (typeof answer === 'object' ? answer.text : answer) : ''
        };
      })
      .filter(f => f.question);

    return { product: merged, faqs, index };
  }

  // --- Renderers ---

  function renderProduct(entity, schemaData) {
    const { product: d, faqs } = findProductData(schemaData);

    // Fallback to the entity data if graph resolution found nothing
    const data = Object.keys(d).length > 2 ? d : entity.data;

    const name = data.name || 'Product';
    const description = data.description || '';
    const image = extractImage(data);
    const price = extractPrice(data);
    const brand = extractBrand(data);
    const rating = extractRating(data);
    const sku = data.sku || data.mpn || '';
    const availability = extractAvailability(data);
    const category = data.applicationCategory || data.category || '';
    const os = data.operatingSystem || '';
    const url = data.url || '';

    return `
      <article class="ua-card ua-product" role="main" aria-label="Product: ${esc(name)}">
        ${image ? `<div class="ua-card-image"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name)}</h1>
          ${brand ? `<p class="ua-meta ua-brand">by ${esc(brand)}</p>` : ''}
          ${category ? `<p class="ua-meta"><span class="ua-tag">${esc(category)}</span></p>` : ''}
          ${os ? `<p class="ua-meta">Platform: ${esc(os)}</p>` : ''}

          <div class="ua-product-highlights">
            ${price ? `<div class="ua-price-block">
              <span class="ua-price" aria-label="Price: ${esc(price)}">${esc(price)}</span>
              ${availability ? `<span class="ua-availability">${esc(availability)}</span>` : ''}
            </div>` : ''}
            ${rating ? `
              <div class="ua-rating" aria-label="Rating: ${rating.value} out of ${rating.best}">
                <span class="ua-stars">${renderStars(rating.value, rating.best)}</span>
                <span class="ua-rating-value">${rating.value}/${rating.best}</span>
                ${rating.count ? `<span class="ua-review-count">(${rating.count} reviews)</span>` : ''}
              </div>
            ` : ''}
          </div>

          ${sku ? `<p class="ua-meta ua-sku">SKU: ${esc(sku)}</p>` : ''}
          ${description ? `<div class="ua-description">${formatText(description)}</div>` : ''}

          ${url ? `<div class="ua-actions">
            <a href="${esc(url)}" class="ua-button" target="_blank" rel="noopener noreferrer">View Product →</a>
          </div>` : ''}

          ${faqs.length > 0 ? `
            <section class="ua-section ua-faq" aria-label="Frequently Asked Questions">
              <h2 class="ua-section-title">Frequently Asked Questions</h2>
              <dl class="ua-faq-list">
                ${faqs.map(f => `
                  <div class="ua-faq-item">
                    <dt class="ua-faq-question">${esc(f.question)}</dt>
                    ${f.answer ? `<dd class="ua-faq-answer">${formatText(f.answer)}</dd>` : ''}
                  </div>
                `).join('')}
              </dl>
            </section>
          ` : ''}
        </div>
      </article>
    `;
  }

  function renderArticle(entity, schemaData) {
    const { index } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const headline = d.headline || d.name || 'Article';
    const author = extractAuthor(d);
    const datePublished = formatDate(d.datePublished);
    const dateModified = formatDate(d.dateModified);
    const image = extractImage(d);
    const body = d.articleBody || d.text || d.description || '';
    const wordCount = d.wordCount || '';

    return `
      <article class="ua-card ua-article" role="main" aria-label="Article: ${esc(headline)}">
        ${image ? `<div class="ua-card-image ua-article-hero"><img src="${esc(image)}" alt="${esc(headline)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body ua-reader">
          <h1 class="ua-title">${esc(headline)}</h1>
          <div class="ua-article-meta">
            ${author ? `<span class="ua-author">By ${esc(author)}</span>` : ''}
            ${datePublished ? `<time class="ua-date" datetime="${esc(d.datePublished || '')}">${esc(datePublished)}</time>` : ''}
            ${dateModified && dateModified !== datePublished ? `<span class="ua-date-modified">Updated: ${esc(dateModified)}</span>` : ''}
            ${wordCount ? `<span class="ua-word-count">${esc(wordCount)} words</span>` : ''}
          </div>
          ${body ? `<div class="ua-article-body">${formatText(body)}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderRecipe(entity, schemaData) {
    const { index } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const name = d.name || 'Recipe';
    const image = extractImage(d);
    const description = d.description || '';
    const prepTime = formatDuration(d.prepTime);
    const cookTime = formatDuration(d.cookTime);
    const totalTime = formatDuration(d.totalTime);
    const servings = d.recipeYield || '';
    const ingredients = extractList(d.recipeIngredient);
    const instructions = extractInstructions(d.recipeInstructions);
    const rating = extractRating(d);
    const nutrition = d.nutrition || null;
    const category = d.recipeCategory || '';
    const cuisine = d.recipeCuisine || '';

    return `
      <article class="ua-card ua-recipe" role="main" aria-label="Recipe: ${esc(name)}">
        ${image ? `<div class="ua-card-image"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name)}</h1>
          ${description ? `<p class="ua-description">${esc(description)}</p>` : ''}

          <div class="ua-recipe-stats">
            ${prepTime ? `<div class="ua-stat"><span class="ua-stat-label">Prep</span><span class="ua-stat-value">${esc(prepTime)}</span></div>` : ''}
            ${cookTime ? `<div class="ua-stat"><span class="ua-stat-label">Cook</span><span class="ua-stat-value">${esc(cookTime)}</span></div>` : ''}
            ${totalTime ? `<div class="ua-stat"><span class="ua-stat-label">Total</span><span class="ua-stat-value">${esc(totalTime)}</span></div>` : ''}
            ${servings ? `<div class="ua-stat"><span class="ua-stat-label">Servings</span><span class="ua-stat-value">${esc(Array.isArray(servings) ? servings[0] : servings)}</span></div>` : ''}
          </div>

          ${category || cuisine ? `
            <p class="ua-meta">
              ${category ? `<span class="ua-tag">${esc(Array.isArray(category) ? category.join(', ') : category)}</span>` : ''}
              ${cuisine ? `<span class="ua-tag">${esc(Array.isArray(cuisine) ? cuisine.join(', ') : cuisine)}</span>` : ''}
            </p>
          ` : ''}

          ${rating ? `
            <div class="ua-rating" aria-label="Rating: ${rating.value} out of ${rating.best}">
              <span class="ua-stars">${renderStars(rating.value, rating.best)}</span>
              ${rating.count ? `<span class="ua-review-count">(${rating.count} reviews)</span>` : ''}
            </div>
          ` : ''}

          ${ingredients.length > 0 ? `
            <section class="ua-section" aria-label="Ingredients">
              <h2 class="ua-section-title">Ingredients</h2>
              <ul class="ua-ingredients-list">
                ${ingredients.map(i => `<li><label class="ua-checkbox"><input type="checkbox"><span>${esc(i)}</span></label></li>`).join('')}
              </ul>
            </section>
          ` : ''}

          ${instructions.length > 0 ? `
            <section class="ua-section" aria-label="Instructions">
              <h2 class="ua-section-title">Instructions</h2>
              <ol class="ua-instructions-list">
                ${instructions.map(s => `<li class="ua-step">${formatText(s)}</li>`).join('')}
              </ol>
            </section>
          ` : ''}

          ${nutrition ? renderNutrition(nutrition) : ''}
        </div>
      </article>
    `;
  }

  // --- Data Helpers ---

  function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatText(text) {
    if (!text) return '';
    // Preserve existing HTML links in answers
    const decoded = String(text).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/&#8226;/g, '•');
    // Simple sanitize: allow only <a>, <strong>, <em>, <br>
    const clean = decoded.replace(/<(?!\/?(?:a|strong|em|b|i|br)\b)[^>]*>/gi, '');
    // Split into paragraphs
    return clean.split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  function extractImage(data) {
    const img = data.image;
    if (!img) {
      // Check for thumbnailUrl
      if (data.thumbnailUrl) return data.thumbnailUrl;
      return null;
    }
    if (typeof img === 'string') return img;
    if (Array.isArray(img)) {
      for (const i of img) {
        if (typeof i === 'string') return i;
        if (i?.url || i?.contentUrl) return i.url || i.contentUrl;
      }
      return null;
    }
    return img.url || img.contentUrl || null;
  }

  function extractPrice(data) {
    // Direct price
    if (data.price && data.priceCurrency) {
      return formatPrice(data.price, data.priceCurrency);
    }
    // Nested offers
    const offers = data.offers;
    if (!offers) return null;
    const offerList = Array.isArray(offers) ? offers : [offers];
    for (const offer of offerList) {
      const price = offer?.price || offer?.lowPrice;
      const currency = offer?.priceCurrency || '';
      if (price) return formatPrice(price, currency);
    }
    return null;
  }

  function formatPrice(price, currency) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(price);
    } catch {
      return `${currency} ${price}`;
    }
  }

  function extractAvailability(data) {
    const offers = data.offers;
    if (!offers) return null;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const avail = offer?.availability || '';
    const cleaned = String(avail).replace(/^https?:\/\/schema\.org\//, '');
    const labels = {
      'InStock': '✓ In Stock',
      'OutOfStock': '✗ Out of Stock',
      'PreOrder': '⏳ Pre-Order',
      'LimitedAvailability': '⚠ Limited',
      'Discontinued': '✗ Discontinued',
      'SoldOut': '✗ Sold Out',
      'OnlineOnly': '🌐 Online Only',
      'InStoreOnly': '🏪 In Store Only'
    };
    return labels[cleaned] || null;
  }

  function extractBrand(data) {
    const brand = data.brand;
    if (!brand) return '';
    if (typeof brand === 'string') return brand;
    return brand.name || '';
  }

  function extractRating(data) {
    const r = data.aggregateRating;
    if (!r) return null;
    return {
      value: parseFloat(r.ratingValue) || 0,
      best: parseFloat(r.bestRating) || 5,
      count: r.ratingCount || r.reviewCount || null
    };
  }

  function renderStars(value, best = 5) {
    const normalized = (value / best) * 5;
    const full = Math.floor(normalized);
    const half = normalized - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '⯨' : '') + '☆'.repeat(empty);
  }

  function extractAuthor(data) {
    const author = data.author;
    if (!author) return null;
    if (typeof author === 'string') return author;
    if (Array.isArray(author)) return author.map(a => a.name || a).join(', ');
    return author.name || null;
  }

  function formatDate(dateStr) {
    if (!dateStr) return null;
    try {
      return new Date(dateStr).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function formatDuration(iso) {
    if (!iso) return null;
    const m = String(iso).match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return iso;
    const parts = [];
    if (m[1]) parts.push(`${m[1]}h`);
    if (m[2]) parts.push(`${m[2]}m`);
    if (m[3]) parts.push(`${m[3]}s`);
    return parts.join(' ') || iso;
  }

  function extractList(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(v => typeof v === 'string' ? v : v.text || v.name || String(v));
    if (typeof val === 'string') return val.split('\n').filter(Boolean);
    return [];
  }

  function extractInstructions(val) {
    if (!val) return [];
    if (typeof val === 'string') return val.split(/\n+/).filter(Boolean);
    if (Array.isArray(val)) {
      const steps = [];
      for (const item of val) {
        if (typeof item === 'string') {
          steps.push(item);
        } else if (item.text) {
          steps.push(item.text);
        } else if (item.itemListElement) {
          for (const sub of extractList(item.itemListElement)) {
            steps.push(typeof sub === 'string' ? sub : sub.text || String(sub));
          }
        } else if (item.name) {
          steps.push(item.name);
        }
      }
      return steps;
    }
    return [];
  }

  function renderNutrition(nutrition) {
    if (!nutrition || typeof nutrition !== 'object') return '';
    const fields = [
      ['calories', 'Calories'],
      ['fatContent', 'Fat'],
      ['carbohydrateContent', 'Carbs'],
      ['proteinContent', 'Protein'],
      ['fiberContent', 'Fiber'],
      ['sugarContent', 'Sugar'],
      ['sodiumContent', 'Sodium']
    ];
    const rows = fields
      .filter(([key]) => nutrition[key])
      .map(([key, label]) => `<tr><td>${label}</td><td>${esc(nutrition[key])}</td></tr>`);

    if (rows.length === 0) return '';
    return `
      <section class="ua-section" aria-label="Nutrition Facts">
        <h2 class="ua-section-title">Nutrition Facts</h2>
        <table class="ua-nutrition-table">
          <tbody>${rows.join('')}</tbody>
        </table>
      </section>
    `;
  }

  // --- Overlay Management ---

  function createOverlay(html, type) {
    removeOverlay();

    // Inject base styles
    if (!document.getElementById(OVERLAY_STYLE_ID)) {
      const link = document.createElement('link');
      link.id = OVERLAY_STYLE_ID;
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL('content/renderers/base.css');
      document.head.appendChild(link);
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Accessible view');
    overlay.className = `ua-overlay ua-type-${type.toLowerCase()}`;

    overlay.innerHTML = `
      <header class="ua-overlay-header">
        <div class="ua-header-left">
          <span class="ua-logo" aria-hidden="true">♿</span>
          <span class="ua-header-title">Universal Access</span>
          <span class="ua-type-badge">${esc(type)}</span>
        </div>
        <button class="ua-close-btn" aria-label="Close accessible view" title="Close accessible view">✕</button>
      </header>
      <main class="ua-overlay-content">
        ${html}
      </main>
    `;

    overlay.querySelector('.ua-close-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DEACTIVATE_TRANSFORM' });
      removeOverlay();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        chrome.runtime.sendMessage({ type: 'DEACTIVATE_TRANSFORM' });
        removeOverlay();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.body.appendChild(overlay);
    currentOverlay = overlay;
    overlay.focus();
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      existing.remove();
      document.body.style.overflow = originalOverflow;
      currentOverlay = null;
    }
  }

  // --- Main Activation ---

  function activate(schemaData) {
    if (!schemaData || !schemaData.entities || schemaData.entities.length === 0) {
      return;
    }

    const type = schemaData.primaryType;
    const entity = schemaData.entities.find(e => e.type === type) || schemaData.entities[0];

    let html = '';
    switch (type) {
      case 'Product':
        html = renderProduct(entity, schemaData);
        break;
      case 'Article':
        html = renderArticle(entity, schemaData);
        break;
      case 'Recipe':
        html = renderRecipe(entity, schemaData);
        break;
      default:
        html = `<div class="ua-card"><div class="ua-card-body"><h1 class="ua-title">Structured Data Detected</h1><p class="ua-description">Entity type: ${esc(type)}</p></div></div>`;
    }

    createOverlay(html, type);
  }

  // --- Message Listener ---

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ACTIVATE_TRANSFORM') {
      activate(message.payload);
      sendResponse({ success: true });
    }
    if (message.type === 'DEACTIVATE_TRANSFORM') {
      removeOverlay();
      sendResponse({ success: true });
    }
  });
})();
