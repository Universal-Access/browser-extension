// Schema.org structured data extractor
// Extracts JSON-LD, Microdata, and RDFa from the current page

function extractJsonLd() {
  const items = [];
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  scripts.forEach((script) => {
    try {
      const data = JSON.parse(script.textContent);
      items.push({ data, error: null });
    } catch (e) {
      items.push({ data: null, error: e.message, raw: script.textContent.slice(0, 500) });
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
  'Course', 'Vehicle', 'FoodEstablishment', 'Restaurant', 'BarOrPub', 'CafeOrCoffeeShop',
  'LocalBusiness', 'Store', 'LodgingBusiness', 'Hotel',
  'Movie', 'TVSeries', 'VideoGame', 'MusicAlbum', 'MusicRecording',
  'CreativeWorkSeason', 'CreativeWorkSeries'
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
  // Handle arrays of types
  if (Array.isArray(rawType)) {
    for (const t of rawType) {
      const n = normalizeType(t);
      if (n) return n;
    }
    return null;
  }
  // Strip schema.org prefix
  const cleaned = String(rawType)
    .replace(/^https?:\/\/schema\.org\//, '')
    .trim();
  if (ARTICLE_TYPES.includes(cleaned)) return 'Article';
  if (WEBPAGE_TYPES.includes(cleaned)) return 'Article';
  if (PRODUCT_TYPES.includes(cleaned)) return 'Product';
  if (EVENT_TYPES.includes(cleaned)) return 'Article';
  if (cleaned === 'Recipe') return 'Recipe';
  return cleaned; // return raw for informational purposes
}

function extractEntitiesFromItem(item, source) {
  const entities = [];
  if (!item || typeof item !== 'object') return entities;

  // Handle @graph arrays (common in Yoast output)
  if (item['@graph'] && Array.isArray(item['@graph'])) {
    for (const node of item['@graph']) {
      entities.push(...extractEntitiesFromItem(node, source));
    }
    return entities;
  }

  const rawType = item['@type'] || item.data?.['@type'];
  const type = normalizeType(rawType);
  if (type) {
    entities.push({
      type,
      rawType: rawType,
      source, // 'jsonLd', 'microdata', 'rdfa'
      data: item.data || item
    });
  }
  return entities;
}

function classifyEntities(extractionData) {
  const entities = [];

  // Process JSON-LD items
  for (const item of (extractionData.jsonLd || [])) {
    if (item.error) continue;
    entities.push(...extractEntitiesFromItem(item.data || item, 'jsonLd'));
  }

  // Process Microdata items
  for (const item of (extractionData.microdata || [])) {
    entities.push(...extractEntitiesFromItem(item, 'microdata'));
  }

  // Process RDFa items
  for (const item of (extractionData.rdfa || [])) {
    entities.push(...extractEntitiesFromItem(item, 'rdfa'));
  }

  // Determine primary type — priority: Recipe > Product > Article
  const typeSet = new Set(entities.map(e => e.type));
  let primaryType = 'Unknown';
  if (typeSet.has('Recipe')) primaryType = 'Recipe';
  else if (typeSet.has('Product')) primaryType = 'Product';
  else if (typeSet.has('Article')) primaryType = 'Article';

  return { entities, primaryType };
}

function extractAll() {
  const raw = {
    jsonLd: extractJsonLd(),
    microdata: extractMicrodata(),
    rdfa: extractRdfa(),
    url: window.location.href
  };
  const { entities, primaryType } = classifyEntities(raw);
  return { ...raw, entities, primaryType };
}

// Send data to service worker on load
const data = extractAll();
chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: data });

// Listen for on-demand re-extraction
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_EXTRACTION') {
    const freshData = extractAll();
    chrome.runtime.sendMessage({ type: 'SCHEMA_DATA', payload: freshData });
    sendResponse(freshData);
  }
});
