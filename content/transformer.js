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
  let previouslyFocusedElement = null;

  // Guard against "Extension context invalidated" errors after extension reload
  function isContextValid() {
    try {
      return !!chrome.runtime?.id;
    } catch {
      return false;
    }
  }

  function safeSendMessage(msg) {
    try {
      if (isContextValid()) {
        chrome.runtime.sendMessage(msg).catch(() => {});
      }
    } catch {
      // Extension context invalidated — silently ignore
    }
  }

  // --- Utilities ---

  // Safely traverse nested properties: safeGet(obj, 'a.b.0.c') → null on any failure
  function safeGet(obj, path) {
    try {
      return path.split('.').reduce((cur, key) => {
        if (cur == null) return undefined;
        return cur[key];
      }, obj) ?? null;
    } catch {
      return null;
    }
  }

  // --- @graph resolver ---
  // Yoast and many CMS output @graph arrays where entities reference each other via @id.
  // This function builds an index and resolves references so each entity has full data.
  // Now indexes JSON-LD, Microdata, and RDFa sources for full parity.

  function buildGraphIndex(schemaData) {
    const index = new Map();
    const allItems = [];

    try {
      // Collect all entities from JSON-LD
      if (schemaData.jsonLd) {
        for (const item of schemaData.jsonLd) {
          const data = item.data || item;
          if (!data || typeof data !== 'object') continue;
          // Handle JSON-LD arrays (multiple schema objects in one <script>)
          if (Array.isArray(data)) {
            for (const entry of data) {
              if (!entry || typeof entry !== 'object') continue;
              if (entry['@id']) index.set(entry['@id'], entry);
              allItems.push(entry);
            }
          } else if (data['@graph'] && Array.isArray(data['@graph'])) {
            for (const node of data['@graph']) {
              if (!node || typeof node !== 'object') continue;
              if (node['@id']) index.set(node['@id'], node);
              allItems.push(node);
            }
          } else {
            if (data['@id']) index.set(data['@id'], data);
            allItems.push(data);
          }
        }
      }

      // Index Microdata items
      if (schemaData.microdata) {
        for (const item of schemaData.microdata) {
          if (!item || typeof item !== 'object') continue;
          if (item['@id']) index.set(item['@id'], item);
          allItems.push(item);
        }
      }

      // Index RDFa items
      if (schemaData.rdfa) {
        for (const item of schemaData.rdfa) {
          if (!item || typeof item !== 'object') continue;
          if (item['@id']) index.set(item['@id'], item);
          allItems.push(item);
        }
      }
    } catch (e) {
      console.warn('[Universal Access] Error building graph index:', e.message);
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
      try {
        if (!item || typeof item !== 'object') continue;
        const type = item['@type'];
        if (!type) continue;
        const types = Array.isArray(type) ? type : [type];
        if (types.some(t => typeof t === 'string' && productTypes.includes(t))) {
          const resolved = resolveEntity(item, index);
          // Merge — later values win, but don't overwrite with empty
          for (const [k, v] of Object.entries(resolved)) {
            if (v !== null && v !== undefined && v !== '') {
              merged[k] = v;
            }
          }
        }
      } catch (e) {
        console.warn('[Universal Access] Skipped bad product node:', e.message);
      }
    }

    // Also resolve nested objects in the merged result
    try {
      merged = resolveEntity(merged, index);
    } catch {
      // Keep unresolved merged data
    }

    // Collect FAQ questions from the graph
    let faqs = [];
    try {
      faqs = allItems
        .filter(item => item && item['@type'] === 'Question')
        .map(q => {
          const resolved = resolveEntity(q, index);
          const answer = resolved.acceptedAnswer || resolved.suggestedAnswer;
          return {
            question: resolved.name || resolved.text || '',
            answer: answer ? (typeof answer === 'object' ? answer.text : answer) : ''
          };
        })
        .filter(f => f.question);
    } catch {
      faqs = [];
    }

    return { product: merged, faqs, index };
  }

  // --- Renderers ---
  // Each renderer is wrapped in try/catch to prevent a single bad field from crashing the entire view.

  function renderError(name, type) {
    return `
      <article class="ua-card" role="main">
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name || type || 'Content')}</h1>
          <p class="ua-description" style="color: var(--ua-color-text-secondary);">
            Some structured data was found but couldn't be fully rendered. The data may be incomplete or in an unexpected format.
          </p>
        </div>
      </article>
    `;
  }

  function renderProduct(entity, schemaData) {
    try {
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
    const buyUrl = extractBuyUrl(data);

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

          ${url || buyUrl ? `<div class="ua-actions">
            ${url ? `<a href="${esc(url)}" class="ua-button" target="_blank" rel="noopener noreferrer">View Product →</a>` : ''}
            ${buyUrl && buyUrl !== url ? `<a href="${esc(buyUrl)}" class="ua-button ua-button-buy" target="_blank" rel="noopener noreferrer">Buy Product →</a>` : ''}
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
    } catch (e) {
      console.warn('[Universal Access] renderProduct error:', e.message);
      return renderError(entity?.data?.name, 'Product');
    }
  }

  function renderArticle(entity, schemaData) {
    try {
    const { index, allItems } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const headline = d.headline || d.name || 'Article';
    const author = extractAuthor(d);
    const datePublished = formatDate(d.datePublished);
    const dateModified = formatDate(d.dateModified);
    const image = extractImage(d);
    const body = d.articleBody || d.text || d.description || '';
    const wordCount = d.wordCount || '';

    // Search for Organization data to enrich homepages
    let orgHtml = '';
    const org = d.about?.[0] || d.publisher?.[0] || d.about || d.publisher || allItems.find(i => i['@type'] === 'Organization' || (Array.isArray(i['@type']) && i['@type'].includes('Organization')));
    if (org) {
      const resolvedOrg = resolveEntity(org, index);
      const name = resolvedOrg.name;
      const slogan = resolvedOrg.slogan;
      const founder = resolvedOrg.founder?.name || resolvedOrg.founder;
      const employees = resolvedOrg.numberOfEmployees;
      const socials = extractList(resolvedOrg.sameAs);

      if (name) {
        orgHtml = `
          <div class="ua-org-profile" style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--ua-color-border);">
            <h2 class="ua-section-title">About ${esc(name)}</h2>
            ${slogan ? `<p class="ua-meta" style="font-size: 16px; font-style: italic;">"${esc(slogan)}"</p>` : ''}
            <ul style="list-style: none; padding: 0; margin: 12px 0;">
              ${founder ? `<li><strong>Founder:</strong> ${esc(founder)}</li>` : ''}
              ${employees ? `<li><strong>Employees:</strong> ${esc(employees)}</li>` : ''}
            </ul>
            ${socials.length > 0 ? `
              <div style="margin-top: 12px;">
                <strong>Links & Socials:</strong>
                <ul style="padding-left: 20px; font-size: 14px;">
                  ${socials.map(s => `<li><a href="${esc(s)}" target="_blank" style="color: var(--ua-color-primary);">${esc(s)}</a></li>`).join('')}
                </ul>
              </div>
            ` : ''}
          </div>
        `;
      }
    }

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
          ${orgHtml}
        </div>
      </article>
    `;
    } catch (e) {
      console.warn('[Universal Access] renderArticle error:', e.message);
      return renderError(entity?.data?.headline || entity?.data?.name, 'Article');
    }
  }


  function renderRecipe(entity, schemaData) {
    try {
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
    } catch (e) {
      console.warn('[Universal Access] renderRecipe error:', e.message);
      return renderError(entity?.data?.name, 'Recipe');
    }
  }

  function renderEvent(entity, schemaData) {
    try {
    const { index } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const name = d.name || 'Event';
    const description = d.description || '';
    const image = extractImage(d);
    const startDate = formatDate(d.startDate);
    const endDate = formatDate(d.endDate);
    const startTime = d.startDate ? formatTime(d.startDate) : '';
    const endTime = d.endDate ? formatTime(d.endDate) : '';
    const location = extractLocation(d);
    const organizer = d.organizer ? (typeof d.organizer === 'string' ? d.organizer : d.organizer.name || '') : '';
    const price = extractPrice(d);
    const url = d.url || '';
    const status = d.eventStatus ? String(d.eventStatus).replace(/^https?:\/\/schema\.org\//, '') : '';
    const attendance = d.eventAttendanceMode ? String(d.eventAttendanceMode).replace(/^https?:\/\/schema\.org\//, '') : '';

    const statusLabels = {
      'EventScheduled': '✓ Scheduled',
      'EventPostponed': '⏳ Postponed',
      'EventCancelled': '✗ Cancelled',
      'EventRescheduled': '🔄 Rescheduled',
      'EventMovedOnline': '🌐 Moved Online'
    };
    const attendanceLabels = {
      'OfflineEventAttendanceMode': '📍 In Person',
      'OnlineEventAttendanceMode': '🌐 Online',
      'MixedEventAttendanceMode': '📍🌐 Hybrid'
    };

    return `
      <article class="ua-card ua-event" role="main" aria-label="Event: ${esc(name)}">
        ${image ? `<div class="ua-card-image"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name)}</h1>

          <div class="ua-event-details">
            ${startDate ? `
              <div class="ua-event-date">
                <span class="ua-event-label">When</span>
                <span class="ua-event-value">
                  ${esc(startDate)}${startTime ? ` at ${esc(startTime)}` : ''}${endDate && endDate !== startDate ? ` — ${esc(endDate)}` : ''}${endTime && endDate === startDate ? ` — ${esc(endTime)}` : ''}
                </span>
              </div>
            ` : ''}
            ${location ? `
              <div class="ua-event-location">
                <span class="ua-event-label">Where</span>
                <span class="ua-event-value">${esc(location)}</span>
              </div>
            ` : ''}
            ${organizer ? `
              <div class="ua-event-organizer">
                <span class="ua-event-label">Organizer</span>
                <span class="ua-event-value">${esc(organizer)}</span>
              </div>
            ` : ''}
          </div>

          <div class="ua-event-tags">
            ${status && statusLabels[status] ? `<span class="ua-tag">${statusLabels[status]}</span>` : ''}
            ${attendance && attendanceLabels[attendance] ? `<span class="ua-tag">${attendanceLabels[attendance]}</span>` : ''}
            ${price ? `<span class="ua-tag ua-price">${esc(price)}</span>` : ''}
          </div>

          ${description ? `<div class="ua-description">${formatText(description)}</div>` : ''}

          ${url ? `<div class="ua-actions">
            <a href="${esc(url)}" class="ua-button" target="_blank" rel="noopener noreferrer">View Event →</a>
          </div>` : ''}
        </div>
      </article>
    `;
    } catch (e) {
      console.warn('[Universal Access] renderEvent error:', e.message);
      return renderError(entity?.data?.name, 'Event');
    }
  }

  function renderLocalBusiness(entity, schemaData) {
    try {
    const { index } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const name = d.name || 'Business';
    const description = d.description || '';
    const image = extractImage(d);
    const rating = extractRating(d);
    const address = extractAddress(d);
    const telephone = d.telephone || '';
    const url = d.url || '';
    const priceRange = d.priceRange || '';
    const hours = extractOpeningHours(d);
    const cuisine = d.servesCuisine || '';

    return `
      <article class="ua-card ua-business" role="main" aria-label="Business: ${esc(name)}">
        ${image ? `<div class="ua-card-image"><img src="${esc(image)}" alt="${esc(name)}" loading="lazy"></div>` : ''}
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(name)}</h1>

          ${rating ? `
            <div class="ua-rating" aria-label="Rating: ${rating.value} out of ${rating.best}">
              <span class="ua-stars">${renderStars(rating.value, rating.best)}</span>
              <span class="ua-rating-value">${rating.value}/${rating.best}</span>
              ${rating.count ? `<span class="ua-review-count">(${rating.count} reviews)</span>` : ''}
            </div>
          ` : ''}

          ${priceRange || cuisine ? `<p class="ua-meta">
            ${priceRange ? `<span class="ua-tag">${esc(priceRange)}</span>` : ''}
            ${cuisine ? `<span class="ua-tag">${esc(Array.isArray(cuisine) ? cuisine.join(', ') : cuisine)}</span>` : ''}
          </p>` : ''}

          <div class="ua-business-info">
            ${address ? `<div class="ua-info-row"><span class="ua-info-label">Address</span><span class="ua-info-value">${esc(address)}</span></div>` : ''}
            ${telephone ? `<div class="ua-info-row"><span class="ua-info-label">Phone</span><a href="tel:${esc(telephone)}" class="ua-info-value ua-phone-link">${esc(telephone)}</a></div>` : ''}
            ${hours ? `<div class="ua-info-row"><span class="ua-info-label">Hours</span><span class="ua-info-value">${esc(hours)}</span></div>` : ''}
          </div>

          ${description ? `<div class="ua-description">${formatText(description)}</div>` : ''}

          ${url ? `<div class="ua-actions">
            <a href="${esc(url)}" class="ua-button" target="_blank" rel="noopener noreferrer">Visit Website →</a>
          </div>` : ''}
        </div>
      </article>
    `;
    } catch (e) {
      console.warn('[Universal Access] renderLocalBusiness error:', e.message);
      return renderError(entity?.data?.name, 'LocalBusiness');
    }
  }

  function renderFAQ(entity, schemaData) {
    try {
    const { index, allItems } = buildGraphIndex(schemaData);
    const d = resolveEntity(entity.data, index);

    const title = d.name || d.headline || 'Frequently Asked Questions';

    // Collect all Question entities
    const faqs = allItems
      .filter(item => item && (item['@type'] === 'Question' || (Array.isArray(item['@type']) && item['@type'].includes('Question'))))
      .map(q => {
        try {
          const resolved = resolveEntity(q, index);
          const answer = resolved.acceptedAnswer || resolved.suggestedAnswer;
          return {
            question: resolved.name || resolved.text || '',
            answer: answer ? (typeof answer === 'object' ? answer.text : answer) : ''
          };
        } catch { return null; }
      })
      .filter(f => f && f.question);

    // Also check mainEntity for embedded questions
    if (faqs.length === 0 && d.mainEntity) {
      const mainEntities = Array.isArray(d.mainEntity) ? d.mainEntity : [d.mainEntity];
      for (const q of mainEntities) {
        if (q && q['@type'] === 'Question') {
          const answer = q.acceptedAnswer || q.suggestedAnswer;
          faqs.push({
            question: q.name || q.text || '',
            answer: answer ? (typeof answer === 'object' ? answer.text : answer) : ''
          });
        }
      }
    }

    return `
      <article class="ua-card ua-faq-page" role="main" aria-label="FAQ: ${esc(title)}">
        <div class="ua-card-body">
          <h1 class="ua-title">${esc(title)}</h1>
          ${faqs.length > 0 ? `
            <div class="ua-faq-accordion">
              ${faqs.map(f => `
                <details class="ua-faq-detail">
                  <summary class="ua-faq-summary">${esc(f.question)}</summary>
                  ${f.answer ? `<div class="ua-faq-body">${formatText(f.answer)}</div>` : ''}
                </details>
              `).join('')}
            </div>
          ` : '<p class="ua-description">No questions found in the structured data.</p>'}
        </div>
      </article>
    `;
    } catch (e) {
      console.warn('[Universal Access] renderFAQ error:', e.message);
      return renderError(entity?.data?.name, 'FAQPage');
    }
  }

  // --- Supplemental Renderers ---

  function renderBreadcrumb(allItems) {
    try {
      const bcList = allItems.find(item =>
        item && (item['@type'] === 'BreadcrumbList' || (Array.isArray(item['@type']) && item['@type'].includes('BreadcrumbList')))
      );
      if (!bcList || !bcList.itemListElement) return '';

      const items = (Array.isArray(bcList.itemListElement) ? bcList.itemListElement : [bcList.itemListElement])
        .filter(i => i && (i.name || i.item))
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(i => ({
          name: i.name || (typeof i.item === 'string' ? i.item : i.item?.name || ''),
          url: typeof i.item === 'string' ? i.item : i.item?.url || i.item?.['@id'] || ''
        }))
        .filter(i => i.name);

      if (items.length === 0) return '';

      return `
        <nav class="ua-breadcrumb" aria-label="Breadcrumb">
          <ol class="ua-breadcrumb-list">
            ${items.map((item, idx) => `
              <li class="ua-breadcrumb-item">
                ${item.url && idx < items.length - 1
                  ? `<a href="${esc(item.url)}" class="ua-breadcrumb-link">${esc(item.name)}</a>`
                  : `<span class="ua-breadcrumb-current" aria-current="page">${esc(item.name)}</span>`
                }
              </li>
            `).join('')}
          </ol>
        </nav>
      `;
    } catch {
      return '';
    }
  }

  function renderItemList(allItems) {
    try {
      const itemList = allItems.find(item =>
        item && (item['@type'] === 'ItemList' || (Array.isArray(item['@type']) && item['@type'].includes('ItemList')))
      );
      if (!itemList || !itemList.itemListElement) return '';

      const items = (Array.isArray(itemList.itemListElement) ? itemList.itemListElement : [itemList.itemListElement])
        .filter(i => i && (i.name || i.url))
        .sort((a, b) => (a.position || 0) - (b.position || 0))
        .map(i => ({
          name: i.name || '',
          url: i.url || ''
        }))
        .filter(i => i.name || i.url);

      if (items.length === 0) return '';

      const listName = itemList.name || 'Related Items';

      return `
        <section class="ua-item-list" aria-label="${esc(listName)}">
          <h2 class="ua-section-title">${esc(listName)}</h2>
          <ol class="ua-item-list-items">
            ${items.map(item => `
              <li class="ua-item-list-entry">
                ${item.url
                  ? `<a href="${esc(item.url)}" class="ua-item-list-link" target="_blank" rel="noopener noreferrer">${esc(item.name || item.url)}</a>`
                  : `<span>${esc(item.name)}</span>`
                }
              </li>
            `).join('')}
          </ol>
        </section>
      `;
    } catch {
      return '';
    }
  }

  // --- Data Helpers ---

  function esc(str) {
    if (str == null) return '';
    // Decode common entities before textContent escapes them again
    const decoded = String(str)
      .replace(/&amp;/g, '&')
      .replace(/&#8226;/g, '•')
      .replace(/&#039;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
    const div = document.createElement('div');
    div.textContent = decoded;
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
    try {
      // Direct price
      if (data.price && data.priceCurrency) {
        return formatPrice(data.price, data.priceCurrency);
      }
      // Nested offers
      const offers = data.offers;
      if (!offers) return null;
      const offerList = Array.isArray(offers) ? offers : [offers];
      for (const offer of offerList) {
        if (!offer || typeof offer !== 'object') continue;
        let price = offer.price || offer.lowPrice;
        let currency = offer.priceCurrency || '';

        // Check priceSpecification
        if (!price && offer.priceSpecification) {
          const specs = Array.isArray(offer.priceSpecification) ? offer.priceSpecification : [offer.priceSpecification];
          for (const spec of specs) {
            if (spec && spec.price) {
              price = spec.price;
              currency = currency || spec.priceCurrency;
              break;
            }
          }
        }

        if (price) return formatPrice(price, currency);
      }
    } catch (e) {
      console.warn('[Universal Access] extractPrice error:', e.message);
    }
    return null;
  }

  function formatPrice(price, currency) {
    const numPrice = Number(price);
    if (isNaN(numPrice)) {
      // Non-numeric price — display raw value
      return currency ? `${currency} ${price}` : String(price);
    }
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(numPrice);
    } catch {
      return `${currency || '$'} ${numPrice}`;
    }
  }

  function extractBuyUrl(data) {
    const offers = data.offers;
    if (!offers) return null;
    const list = Array.isArray(offers) ? offers : [offers];
    for (const offer of list) {
      if (offer?.url) return offer.url;
    }
    return null;
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
    const safeValue = Number(value) || 0;
    const safeBest = Number(best) || 5;
    const normalized = Math.max(0, Math.min(5, (safeValue / safeBest) * 5));
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

  function formatTime(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function extractLocation(data) {
    const loc = data.location;
    if (!loc) return '';
    if (typeof loc === 'string') return loc;
    if (loc.name && loc.address) {
      const addr = typeof loc.address === 'string' ? loc.address : formatAddressObj(loc.address);
      return addr ? `${loc.name}, ${addr}` : loc.name;
    }
    if (loc.name) return loc.name;
    if (loc.address) return typeof loc.address === 'string' ? loc.address : formatAddressObj(loc.address);
    if (loc.url) return loc.url;
    return '';
  }

  function formatAddressObj(addr) {
    if (!addr || typeof addr !== 'object') return '';
    const parts = [
      addr.streetAddress,
      addr.addressLocality,
      addr.addressRegion,
      addr.postalCode,
      addr.addressCountry
    ].filter(Boolean);
    return parts.join(', ');
  }

  function extractAddress(data) {
    const addr = data.address;
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    return formatAddressObj(addr);
  }

  function extractOpeningHours(data) {
    const hours = data.openingHoursSpecification || data.openingHours;
    if (!hours) return '';
    if (typeof hours === 'string') return hours;
    if (Array.isArray(hours)) {
      if (typeof hours[0] === 'string') return hours.join(', ');
      const dayNames = { 0: 'Mon', 1: 'Tue', 2: 'Wed', 3: 'Thu', 4: 'Fri', 5: 'Sat', 6: 'Sun',
        'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu',
        'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun',
        'https://schema.org/Monday': 'Mon', 'https://schema.org/Tuesday': 'Tue',
        'https://schema.org/Wednesday': 'Wed', 'https://schema.org/Thursday': 'Thu',
        'https://schema.org/Friday': 'Fri', 'https://schema.org/Saturday': 'Sat',
        'https://schema.org/Sunday': 'Sun'
      };
      return hours.map(h => {
        if (typeof h === 'string') return h;
        const days = (Array.isArray(h.dayOfWeek) ? h.dayOfWeek : [h.dayOfWeek])
          .filter(Boolean)
          .map(d => dayNames[d] || String(d).replace(/^https?:\/\/schema\.org\//, '').slice(0, 3))
          .join(', ');
        const opens = h.opens || '';
        const closes = h.closes || '';
        return `${days}: ${opens}–${closes}`;
      }).join(' | ');
    }
    return '';
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

  // --- Schemamap Navigation Renderer ---

  function renderNavHtml(navItems) {
    if (!navItems || navItems.length === 0) return '';

    function renderNavItem(item) {
      const isCurrent = item.url && window.location.href.includes(item.url.replace(/\/$/, ''));
      const currentAttr = isCurrent ? ' aria-current="page"' : '';

      if (item.children && item.children.length > 0) {
        return `
          <li class="ua-nav-item ua-nav-has-children">
            ${item.url
              ? `<a href="${esc(item.url)}" class="ua-nav-link"${currentAttr}>${esc(item.name)}</a>`
              : `<span class="ua-nav-label">${esc(item.name)}</span>`
            }
            <button class="ua-nav-toggle" aria-expanded="false" aria-label="Expand ${esc(item.name)} submenu">&#9662;</button>
            <ul class="ua-nav-submenu" role="menu">
              ${item.children.map(child => `
                <li class="ua-nav-item">
                  <a href="${esc(child.url)}" class="ua-nav-link" role="menuitem">${esc(child.name)}</a>
                </li>
              `).join('')}
            </ul>
          </li>
        `;
      }

      return `
        <li class="ua-nav-item">
          <a href="${esc(item.url)}" class="ua-nav-link"${currentAttr}>${esc(item.name)}</a>
        </li>
      `;
    }

    return `
      <nav class="ua-nav" role="navigation" aria-label="Site navigation">
        <ul class="ua-nav-list">
          ${navItems.map(renderNavItem).join('')}
        </ul>
      </nav>
    `;
  }

  function bindNavInteractions(overlay) {
    // Toggle submenus
    overlay.querySelectorAll('.ua-nav-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        // Close all other submenus
        overlay.querySelectorAll('.ua-nav-toggle').forEach(other => {
          other.setAttribute('aria-expanded', 'false');
        });
        btn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      });
    });

    // Close submenus on Escape within nav
    overlay.querySelector('.ua-nav')?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        overlay.querySelectorAll('.ua-nav-toggle').forEach(btn => {
          btn.setAttribute('aria-expanded', 'false');
        });
        e.stopPropagation(); // don't close the whole overlay
      }
    });

    // Close submenus when clicking outside
    overlay.addEventListener('click', (e) => {
      if (!e.target.closest('.ua-nav-has-children')) {
        overlay.querySelectorAll('.ua-nav-toggle').forEach(btn => {
          btn.setAttribute('aria-expanded', 'false');
        });
      }
    });
  }

  // --- Focus Management ---

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function trapFocus(overlay) {
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(overlay.querySelectorAll(FOCUSABLE_SELECTOR));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  // --- Overlay Management ---

  function createOverlay(html, type, navHtml) {
    removeOverlay();

    // Save focus for restoration on close
    previouslyFocusedElement = document.activeElement;

    // Inject base styles
    if (!document.getElementById(OVERLAY_STYLE_ID)) {
      try {
        const link = document.createElement('link');
        link.id = OVERLAY_STYLE_ID;
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content/renderers/base.css');
        document.head.appendChild(link);
      } catch {
        // Extension context invalidated — styles won't load but overlay can still render
      }
    }

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Accessible view');
    overlay.setAttribute('tabindex', '-1');
    overlay.className = `ua-overlay ua-type-${type.toLowerCase()}`;

    overlay.innerHTML = `
      <a href="#ua-main-content" class="ua-skip-link">Skip to content</a>
      <header class="ua-overlay-header">
        <div class="ua-header-left">
          <span class="ua-logo" aria-hidden="true">♿</span>
          <span class="ua-header-title">Universal Access</span>
          <span class="ua-type-badge">${esc(type)}</span>
        </div>
        <button class="ua-close-btn" aria-label="Close accessible view" title="Close accessible view">✕</button>
      </header>
      ${navHtml || ''}
      <main class="ua-overlay-content" id="ua-main-content">
        ${html}
      </main>
    `;

    // Bind nav interactions if nav is present
    if (navHtml) {
      bindNavInteractions(overlay);
    }

    overlay.querySelector('.ua-close-btn').addEventListener('click', () => {
      safeSendMessage({ type: 'DEACTIVATE_TRANSFORM' });
      removeOverlay();
    });

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        safeSendMessage({ type: 'DEACTIVATE_TRANSFORM' });
        removeOverlay();
      }
    };
    document.addEventListener('keydown', escHandler);
    overlay._escHandler = escHandler;

    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    document.body.appendChild(overlay);
    currentOverlay = overlay;
    trapFocus(overlay);
    overlay.focus();
  }

  function removeOverlay() {
    const existing = document.getElementById(OVERLAY_ID);
    if (existing) {
      if (existing._escHandler) {
        document.removeEventListener('keydown', existing._escHandler);
      }
      existing.remove();
      document.body.style.overflow = originalOverflow;
      currentOverlay = null;
      // Restore focus to the element that was focused before the overlay opened
      if (previouslyFocusedElement && typeof previouslyFocusedElement.focus === 'function') {
        previouslyFocusedElement.focus();
        previouslyFocusedElement = null;
      }
    }
  }

  // --- Main Activation ---

  async function activate(schemaData) {
    if (!schemaData || !schemaData.entities || schemaData.entities.length === 0) {
      return;
    }

    try {
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
        case 'Event':
          html = renderEvent(entity, schemaData);
          break;
        case 'LocalBusiness':
          html = renderLocalBusiness(entity, schemaData);
          break;
        case 'FAQPage':
          html = renderFAQ(entity, schemaData);
          break;
        default:
          html = `<div class="ua-card"><div class="ua-card-body"><h1 class="ua-title">Structured Data Detected</h1><p class="ua-description">Entity type: ${esc(type)}</p></div></div>`;
      }

      // Supplemental renderers — append breadcrumb and item list if present
      const { allItems } = buildGraphIndex(schemaData);
      const breadcrumbHtml = renderBreadcrumb(allItems);
      const itemListHtml = renderItemList(allItems);
      if (breadcrumbHtml || itemListHtml) {
        html = breadcrumbHtml + html + itemListHtml;
      }

      // Fetch schemamap navigation (non-blocking — overlay renders even if this fails)
      let navHtml = '';
      try {
        if (typeof window.__uaGetSchemamap === 'function') {
          const navItems = await window.__uaGetSchemamap(window.location.origin, schemaData);
          navHtml = renderNavHtml(navItems);
        }
      } catch {
        navHtml = '';
      }

      createOverlay(html, type, navHtml);
    } catch (e) {
      console.error('[Universal Access] Fatal rendering error:', e);
      const errorHtml = `
        <article class="ua-card" role="main">
          <div class="ua-card-body">
            <h1 class="ua-title">Rendering Error</h1>
            <p class="ua-description">We found structured data on this page but encountered an error while rendering it. The data may be malformed or in an unexpected format.</p>
          </div>
        </article>
      `;
      try {
        createOverlay(errorHtml, 'Error');
      } catch {
        // Last resort — can't even create the overlay
        console.error('[Universal Access] Could not create error overlay');
      }
    }
  }

  // --- Message Listener ---
  // The listener may fire after the extension context is invalidated (e.g. after reload).
  // We guard inside the callback itself since the listener persists beyond context lifetime.

  // --- Product Browse (Aggregation) ---

  const PRODUCT_PAGE_SIZE = 2;
  let productBrowseState = { products: [], page: 0 };

  function activateProductBrowse(products) {
    productBrowseState = { products, page: 0 };
    const totalPages = Math.ceil(products.length / PRODUCT_PAGE_SIZE);
    const html = renderProductPage(0, products, totalPages);
    createOverlay(html, 'Products');
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        const prev = e.target.closest('.ua-pagination-prev');
        const next = e.target.closest('.ua-pagination-next');
        if (prev && prev.getAttribute('aria-disabled') !== 'true' && productBrowseState.page > 0) {
          productBrowseState.page--;
          updateOverlayContent(overlay, productBrowseState.products, Math.ceil(productBrowseState.products.length / PRODUCT_PAGE_SIZE));
        }
        if (next && next.getAttribute('aria-disabled') !== 'true') {
          const tp = Math.ceil(productBrowseState.products.length / PRODUCT_PAGE_SIZE);
          if (productBrowseState.page < tp - 1) {
            productBrowseState.page++;
            updateOverlayContent(overlay, productBrowseState.products, tp);
          }
        }
      });
    }
  }

  function renderProductPage(pageNum, products, totalPages) {
    const start = pageNum * PRODUCT_PAGE_SIZE;
    const pageProducts = products.slice(start, start + PRODUCT_PAGE_SIZE);

    const cardsHtml = pageProducts.map(product => {
      // Wrap each product in its own minimal schemaData so findProductData doesn't merge them
      const wrappedSchema = {
        jsonLd: [{ data: product }],
        microdata: [],
        rdfa: [],
        entities: [{ type: 'Product', data: product }],
        primaryType: 'Product'
      };
      return renderProduct({ type: 'Product', data: product }, wrappedSchema);
    }).join('');

    const prevDisabled = pageNum === 0;
    const nextDisabled = pageNum >= totalPages - 1;

    const paginationHtml = `
      <nav class="ua-pagination" aria-label="Product pagination">
        <button class="ua-button ua-pagination-prev"${prevDisabled ? ' aria-disabled="true"' : ''}><span aria-hidden="true">←</span> Previous</button>
        <span class="ua-pagination-info">Page ${pageNum + 1} of ${totalPages}</span>
        <button class="ua-button ua-pagination-next"${nextDisabled ? ' aria-disabled="true"' : ''}>Next <span aria-hidden="true">→</span></button>
      </nav>
    `;

    return cardsHtml + paginationHtml;
  }

  function updateOverlayContent(overlay, products, totalPages) {
    const content = overlay.querySelector('#ua-main-content');
    if (!content) return;
    content.innerHTML = renderProductPage(productBrowseState.page, products, totalPages);

    // Announce page change to screen readers via persistent live region
    let announcer = overlay.querySelector('#ua-page-announce');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'ua-page-announce';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'ua-sr-only';
      overlay.appendChild(announcer);
    }
    announcer.textContent = `Page ${productBrowseState.page + 1} of ${totalPages}`;

    // Move focus to first product card heading
    const firstHeading = content.querySelector('.ua-title');
    if (firstHeading) {
      firstHeading.setAttribute('tabindex', '-1');
      firstHeading.focus();
    }
  }

  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (!isContextValid()) return;
        if (message.type === 'ACTIVATE_TRANSFORM') {
          activate(message.payload);
          sendResponse({ success: true });
        }
        if (message.type === 'DEACTIVATE_TRANSFORM') {
          removeOverlay();
          sendResponse({ success: true });
        }
        if (message.type === 'ACTIVATE_PRODUCT_BROWSE') {
          if (message.products && message.products.length > 0) {
            activateProductBrowse(message.products);
          }
          sendResponse({ success: true });
        }
      } catch (e) {
        // Silently handle context invalidation or other errors in the listener
        if (!String(e.message).includes('Extension context invalidated')) {
          console.warn('[Universal Access] Message listener error:', e.message);
        }
      }
    });
  } catch {
    // Extension context already invalidated at registration time
  }
})();
