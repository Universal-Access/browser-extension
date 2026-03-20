// Visual Transformation Engine
// Creates an accessible overlay that replaces the cluttered page with a clean,
// schema-driven view optimized for the detected entity type.

(function () {
  'use strict';

  const OVERLAY_ID = 'ua-accessible-overlay';
  const OVERLAY_STYLE_ID = 'ua-overlay-styles';

  let currentOverlay = null;
  let originalOverflow = '';

  // --- Renderers ---
  // Each renderer returns an HTML string for its entity type

  function renderProduct(entity) {
    const d = entity.data;
    const name = d.name || 'Product';
    const description = d.description || '';
    const image = extractImage(d);
    const price = extractPrice(d);
    const brand = d.brand?.name || d.brand || '';
    const rating = extractRating(d);
    const sku = d.sku || '';
    const availability = extractAvailability(d);

    return `
      <article class="ua-card ua-product" role="main" aria-label="Product: ${esc(name)}">
        ${image ? `<div class="ua-card-image"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name)}</h1>
          ${brand ? `<p class="ua-meta ua-brand">by ${esc(brand)}</p>` : ''}
          ${price ? `<p class="ua-price" aria-label="Price: ${esc(price)}">${esc(price)}</p>` : ''}
          ${availability ? `<p class="ua-availability">${esc(availability)}</p>` : ''}
          ${rating ? `
            <div class="ua-rating" aria-label="Rating: ${rating.value} out of ${rating.best}">
              <span class="ua-stars">${renderStars(rating.value, rating.best)}</span>
              ${rating.count ? `<span class="ua-review-count">(${rating.count} reviews)</span>` : ''}
            </div>
          ` : ''}
          ${sku ? `<p class="ua-meta ua-sku">SKU: ${esc(sku)}</p>` : ''}
          ${description ? `<div class="ua-description">${formatText(description)}</div>` : ''}
        </div>
      </article>
    `;
  }

  function renderArticle(entity) {
    const d = entity.data;
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

  function renderRecipe(entity) {
    const d = entity.data;
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
    // Convert newlines to paragraphs
    return esc(text).split(/\n\n+/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
  }

  function extractImage(data) {
    const img = data.image;
    if (!img) return null;
    if (typeof img === 'string') return img;
    if (Array.isArray(img)) return typeof img[0] === 'string' ? img[0] : img[0]?.url || img[0]?.contentUrl || null;
    return img.url || img.contentUrl || null;
  }

  function extractPrice(data) {
    const offers = data.offers;
    if (!offers) return null;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const price = offer?.price || offer?.lowPrice;
    const currency = offer?.priceCurrency || '';
    if (!price) return null;
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
      'LimitedAvailability': '⚠ Limited Availability'
    };
    return labels[cleaned] || null;
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
    // Parse ISO 8601 duration: PT1H30M, PT45M, etc.
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
          // HowToSection
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

    // Close button handler
    overlay.querySelector('.ua-close-btn').addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'DEACTIVATE_TRANSFORM' });
      removeOverlay();
    });

    // Escape key handler
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        chrome.runtime.sendMessage({ type: 'DEACTIVATE_TRANSFORM' });
        removeOverlay();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);

    // Freeze page scroll
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.body.appendChild(overlay);
    currentOverlay = overlay;

    // Focus the overlay for screen readers
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
    // Find the primary entity of the detected type
    const entity = schemaData.entities.find(e => e.type === type) || schemaData.entities[0];

    let html = '';
    switch (type) {
      case 'Product':
        html = renderProduct(entity);
        break;
      case 'Article':
        html = renderArticle(entity);
        break;
      case 'Recipe':
        html = renderRecipe(entity);
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
