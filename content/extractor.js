// Schema.org structured data extractor
// Extracts JSON-LD, Microdata, and RDFa from the current page

if (typeof window.__uaExtractorLoaded === 'undefined') {
window.__uaExtractorLoaded = true;

// Attempt moderate fixes on broken JSON before giving up
function salvageJson(raw) {
  let text = raw;
  // Strip BOM and non-breaking spaces
  text = text.replace(/^\uFEFF/, '').replace(/\u00A0/g, ' ');
  // Strip single-line JS comments (but not inside strings — best effort)
  text = text.replace(/^\s*\/\/.*$/gm, '');
  // Strip multi-line JS comments
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // Strip trailing commas before } or ]
  text = text.replace(/,\s*([}\]])/g, '$1');
  // Trim whitespace
  text = text.trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractJsonLd() {
  const items = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent);
      // Some sites (e.g. taste.com.au) put multiple schema objects in a single
      // <script> tag as a JSON array instead of using @graph. Flatten them so
      // each item is wrapped individually.
      if (Array.isArray(data)) {
        for (const entry of data) {
          items.push({ data: entry, error: null });
        }
      } else {
        items.push({ data, error: null });
      }
    } catch (e) {
      // Attempt moderate salvage before giving up
      const salvaged = salvageJson(script.textContent);
      if (salvaged) {
        if (Array.isArray(salvaged)) {
          for (const entry of salvaged) {
            items.push({ data: entry, error: null, salvaged: true });
          }
        } else {
          items.push({ data: salvaged, error: null, salvaged: true });
        }
      } else {
        items.push({ data: null, error: e.message, raw: script.textContent.slice(0, 500) });
      }
    }
  });
  return items;
}

function parseMicrodataItem(element) {
  const item = {};
  const itemType = element.getAttribute('itemtype');
  if (itemType) {
    item['@type'] = itemType;
  }

  const children = element.querySelectorAll('[itemprop]');
  children.forEach((child) => {
    // Only process direct children of this itemscope
    if (child.closest('[itemscope]') !== element) return;

    const prop = child.getAttribute('itemprop');
    let value;

    if (child.hasAttribute('itemscope')) {
      value = parseMicrodataItem(child);
    } else if (child.tagName === 'META') {
      value = child.getAttribute('content') || '';
    } else if (child.tagName === 'A' || child.tagName === 'LINK') {
      value = child.getAttribute('href') || '';
    } else if (child.tagName === 'IMG') {
      value = child.getAttribute('src') || '';
    } else if (child.tagName === 'TIME') {
      value = child.getAttribute('datetime') || child.textContent.trim();
    } else {
      value = child.textContent.trim();
    }

    // Support multiple values for the same property
    if (item[prop] !== undefined) {
      if (!Array.isArray(item[prop])) {
        item[prop] = [item[prop]];
      }
      item[prop].push(value);
    } else {
      item[prop] = value;
    }
  });

  return item;
}

function extractMicrodata() {
  const items = [];
  const topLevel = document.querySelectorAll('[itemscope]:not([itemprop])');
  topLevel.forEach((element) => {
    items.push(parseMicrodataItem(element));
  });
  return items;
}

function parseRdfaItem(element) {
  const item = {};
  const typeOf = element.getAttribute('typeof');
  if (typeOf) {
    item['@type'] = typeOf;
  }
  const vocab = element.getAttribute('vocab');
  if (vocab) {
    item['@vocab'] = vocab;
  }
  // RDFa resource (or href for A/LINK) functions as an @id
  let resource = element.getAttribute('resource');
  if (!resource && (element.tagName === 'A' || element.tagName === 'LINK')) {
    resource = element.getAttribute('href');
  }
  if (resource) {
    item['@id'] = resource;
  }

  const children = element.querySelectorAll('[property]');
  children.forEach((child) => {
    // Only process direct children of this typeof scope
    const closestTypeof = child.parentElement && child.parentElement.closest('[typeof]');
    if (closestTypeof !== element) return;

    const prop = child.getAttribute('property');
    let value;

    if (child.hasAttribute('typeof')) {
      value = parseRdfaItem(child);
    } else if (child.hasAttribute('content')) {
      value = child.getAttribute('content');
    } else if (child.tagName === 'A' || child.tagName === 'LINK') {
      value = child.getAttribute('href') || '';
    } else if (child.tagName === 'IMG') {
      value = child.getAttribute('src') || '';
    } else if (child.tagName === 'TIME') {
      value = child.getAttribute('datetime') || child.textContent.trim();
    } else {
      value = child.textContent.trim();
    }

    if (item[prop] !== undefined) {
      if (!Array.isArray(item[prop])) {
        item[prop] = [item[prop]];
      }
      item[prop].push(value);
    } else {
      item[prop] = value;
    }
  });

  return item;
}

function extractRdfa() {
  const items = [];
  const topLevel = document.querySelectorAll('[typeof]');
  // Filter to only top-level typeof elements (not nested inside another typeof)
  topLevel.forEach((element) => {
    const parent = element.parentElement && element.parentElement.closest('[typeof]');
    if (!parent) {
      items.push(parseRdfaItem(element));
    }
  });
  return items;
}

// --- Entity Classification ---

const ARTICLE_TYPES = [
  'Article', 'NewsArticle', 'BlogPosting', 'TechArticle', 'ScholarlyArticle', 'Report',
  'SocialMediaPosting', 'DiscussionForumPosting', 'LiveBlogPosting', 'AnalysisNewsArticle',
  'AskPublicNewsArticle', 'BackgroundNewsArticle', 'OpinionNewsArticle', 'ReportageNewsArticle',
  'ReviewNewsArticle', 'Review', 'CriticReview', 'UserReview', 'EmployerReview',
  'Book', 'Chapter', 'Thesis', 'HowTo', 'Guide'
];
const WEBPAGE_TYPES = [
  'WebPage', 'CheckoutPage', 'CollectionPage', 'FAQPage', 'ItemPage',
  'AboutPage', 'ContactPage', 'ProfilePage', 'SearchResultsPage',
  'RealEstateListing', 'MedicalWebPage', 'QAPage'
];
const PRODUCT_TYPES = [
  'Product', 'SoftwareApplication', 'IndividualProduct', 'ProductGroup',
  'MobileApplication', 'WebApplication', 'Service', 'Offer', 'AggregateOffer',
  'Course', 'Vehicle',
  'Movie', 'TVSeries', 'VideoGame', 'MusicAlbum', 'MusicRecording',
  'CreativeWorkSeason', 'CreativeWorkSeries'
];
const LOCAL_BUSINESS_TYPES = [
  'LocalBusiness', 'Store', 'LodgingBusiness', 'Hotel',
  'FoodEstablishment', 'Restaurant', 'BarOrPub', 'CafeOrCoffeeShop'
];
const EVENT_TYPES = [
  'Event', 'BusinessEvent', 'ChildrensEvent', 'ComedyEvent', 'CourseInstance',
  'DanceEvent', 'DeliveryEvent', 'EducationEvent', 'EventSeries', 'ExhibitionEvent',
  'Festival', 'FoodEvent', 'Hackathon', 'LiteraryEvent', 'MusicEvent',
  'PublicationEvent', 'SaleEvent', 'ScreeningEvent', 'SocialEvent', 'SportsEvent',
  'TheaterEvent', 'VisualArtsEvent'
];

function normalizeType(rawType) {
  if (!rawType) return null;
  if (Array.isArray(rawType)) {
    for (const t of rawType) {
      const n = normalizeType(t);
      if (n) return n;
    }
    return null;
  }
  if (typeof rawType === 'object' && rawType !== null) {
    if (rawType['@value']) return normalizeType(rawType['@value']);
    return null;
  }
  if (typeof rawType !== 'string') return null;
  const cleaned = rawType.replace(/^https?:\/\/schema\.org\//, '').trim();
  if (!cleaned) return null;
  if (ARTICLE_TYPES.includes(cleaned)) return 'Article';
  if (WEBPAGE_TYPES.includes(cleaned)) return 'Article';
  if (PRODUCT_TYPES.includes(cleaned)) return 'Product';
  if (LOCAL_BUSINESS_TYPES.includes(cleaned)) return 'LocalBusiness';
  if (EVENT_TYPES.includes(cleaned)) return 'Event';
  if (cleaned === 'FAQPage') return 'FAQPage';
  if (cleaned === 'Recipe') return 'Recipe';
  return cleaned;
}

function extractEntitiesFromItem(item, source) {
  const entities = [];
  if (!item || typeof item !== 'object') return entities;
  try {
    // Handle arrays of items (e.g. JSON-LD arrays that weren't flattened upstream)
    if (Array.isArray(item)) {
      for (const entry of item) {
        entities.push(...extractEntitiesFromItem(entry, source));
      }
      return entities;
    }
    if (item['@graph'] && Array.isArray(item['@graph'])) {
      for (const node of item['@graph']) {
        entities.push(...extractEntitiesFromItem(node, source));
      }
      return entities;
    }
    const rawType = item['@type'] || item.data?.['@type'];
    const type = normalizeType(rawType);
    if (type) {
      entities.push({ type, rawType, source, data: item.data || item });
    }
  } catch (e) {
    console.warn('[Universal Access] Skipped malformed entity:', e.message);
  }
  return entities;
}

function classifyEntities(extractionData) {
  const entities = [];
  for (const item of (extractionData.jsonLd || [])) {
    if (item.error) continue;
    entities.push(...extractEntitiesFromItem(item.data || item, 'jsonLd'));
  }
  for (const item of (extractionData.microdata || [])) {
    entities.push(...extractEntitiesFromItem(item, 'microdata'));
  }
  for (const item of (extractionData.rdfa || [])) {
    entities.push(...extractEntitiesFromItem(item, 'rdfa'));
  }
  const typeSet = new Set(entities.map(e => e.type));
  let primaryType = 'Unknown';
  if (typeSet.has('Recipe')) primaryType = 'Recipe';
  else if (typeSet.has('Event')) primaryType = 'Event';
  else if (typeSet.has('Product')) primaryType = 'Product';
  else if (typeSet.has('LocalBusiness')) primaryType = 'LocalBusiness';
  else if (typeSet.has('Article')) primaryType = 'Article';
  else if (typeSet.has('FAQPage')) primaryType = 'FAQPage';
  return { entities, primaryType };
}

function extractAll() {
  const raw = {
    jsonLd: extractJsonLd(),
    microdata: extractMicrodata(),
    rdfa: extractRdfa(),
    nlweb: discoverNlweb(), // NLWeb discovery currently tested against news.microsoft.com
    url: window.location.href
  };
  const { entities, primaryType } = classifyEntities(raw);
  return { ...raw, entities, primaryType };
}

// Guard against "Extension context invalidated" errors after extension reload
function isExtContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Send data to service worker on load
const data = extractAll();
if (isExtContextValid()) {
  try {
    chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: data });
  } catch {
    // Extension context invalidated
  }
}

// Listen for on-demand re-extraction
// Guard inside the callback — listener persists beyond context lifetime
try {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (!isExtContextValid()) return;
      if (message.type === 'REQUEST_EXTRACTION') {
        const freshData = extractAll();
        try {
          chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: freshData });
        } catch {
          // Extension context invalidated
        }
        sendResponse(freshData);
      }
    } catch (e) {
      if (!String(e.message).includes('Extension context invalidated')) {
        console.warn('[Universal Access] Extractor listener error:', e.message);
      }
    }
  });
} catch {
  // Extension context already invalidated at registration time
}

} // end __uaExtractorLoaded guard
