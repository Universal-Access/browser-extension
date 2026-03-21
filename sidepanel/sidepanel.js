// Side panel — control hub for Universal Access
// Integrates schema display, visual transformations, presets, and NLWeb

import { createTreeNode, renderError } from "./tree-renderer.js";
import { initTTSSettings } from "./text-to-speech.js";
import {
  getNlwebEndpoint,
  updateNlwebSection,
  renderNlwebChunk,
  setNlwebLoading,
  showNlwebError,
  onLoadingChange,
} from "./nlweb-ui.js";

(function () {
  "use strict";

  // --- State ---
  let currentData = null;
  let isTransformActive = false;
  let speechController = null;

  // --- DOM References ---
  const statusIcon = document.getElementById("status-icon");
  const statusText = document.getElementById("status-text");
  const statusBar = document.getElementById("status-indicator");
  const pageUrl = document.getElementById("page-url");
  const emptyState = document.getElementById("empty-state");
  const displaySection = document.getElementById("display-section");
  const detectedTypeDesc = document.getElementById("detected-type-desc");
  const btnActivate = document.getElementById("btn-activate");
  const btnDeactivate = document.getElementById("btn-deactivate");
  const presetsSection = document.getElementById("presets-section");
  const ttsSection = document.getElementById("tts-section");
  const navSection = document.getElementById("nav-section");
  const navLinks = document.getElementById("nav-links");
  const aggregationSection = document.getElementById("aggregation-section");
  const btnBrowseProducts = document.getElementById("btn-browse-products");
  const aggregationStatus = document.getElementById("aggregation-status");
  const rawDataSection = document.getElementById("raw-data-section");

  // --- Theme Segmented Control (Light / Dark) ---

  let currentTheme = "light";

  function applyTheme(theme) {
    currentTheme = theme;
    if (theme === "dark") {
      document.body.setAttribute("data-theme", "dark");
    } else {
      document.body.removeAttribute("data-theme");
    }
    // Update segmented control UI
    document
      .getElementById("seg-theme-light")
      ?.classList.toggle("active", theme === "light");
    document
      .getElementById("seg-theme-light")
      ?.setAttribute("aria-checked", String(theme === "light"));
    document
      .getElementById("seg-theme-dark")
      ?.classList.toggle("active", theme === "dark");
    document
      .getElementById("seg-theme-dark")
      ?.setAttribute("aria-checked", String(theme === "dark"));
    chrome.storage.local.set({ uaTheme: theme });
    // Send theme to content script overlay
    chrome.runtime.sendMessage({ type: "SET_THEME", theme: theme });
  }

  // Restore saved theme, or default to OS preference
  chrome.storage.local.get("uaTheme", (result) => {
    if (result.uaTheme === "dark" || result.uaTheme === "light") {
      applyTheme(result.uaTheme);
    } else {
      // No saved preference — use OS setting as default
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      applyTheme(prefersDark ? "dark" : "light");
    }
  });

  // Theme segmented control click handlers
  document
    .getElementById("seg-theme-light")
    ?.addEventListener("click", () => applyTheme("light"));
  document
    .getElementById("seg-theme-dark")
    ?.addEventListener("click", () => applyTheme("dark"));

  initTTSSettings();

  // --- STT Integration ---

  if (typeof createSpeechRecognitionController === "function") {
    speechController = createSpeechRecognitionController({
      inputId: "nlweb-query",
      micId: "nlweb-mic",
      statusId: "nlweb-stt-status",
      language: "en-US",
    });
    speechController.init();
  }
  onLoadingChange((loading) => {
    if (loading && speechController?.isListening()) speechController.stop();
    if (speechController) speechController.setDisabled(loading);
  });

  // --- Status Updates ---

  function setStatus(icon, text, className) {
    statusIcon.textContent = icon;
    statusText.textContent = text;
    statusBar.className = "status-bar " + (className || "");
  }

  // --- Schema Data Rendering ---

  function handleSchemaData(data) {
    currentData = data;

    // Reset NLWeb state
    const nlwebResults = document.getElementById("nlweb-results");
    setNlwebLoading(false);
    if (nlwebResults) nlwebResults.innerHTML = "";

    if (!data) {
      setStatus("📄", "No structured data found", "empty");
      emptyState.hidden = false;
      displaySection.hidden = true;
      presetsSection.hidden = true;
      ttsSection.hidden = true;
      navSection.hidden = true;
      rawDataSection.hidden = true;
      updateNlwebSection(null);
      pageUrl.textContent = "";
      return;
    }

    pageUrl.textContent = data.url || "";
    emptyState.hidden = true;

    // Handle NLWeb discovery
    if (data.nlweb && data.nlweb.endpoint) {
      updateNlwebSection(data.nlweb.endpoint, data.nlweb.method);
    } else if (!getNlwebEndpoint()) {
      updateNlwebSection(null);
    }

    const hasEntities = data.entities && data.entities.length > 0;
    const primaryType = data.primaryType || "Unknown";
    const hasNlweb = !!getNlwebEndpoint();

    if (hasEntities && primaryType !== "Unknown") {
      const typeEmoji =
        {
          Product: "🛍️",
          Article: "📰",
          Recipe: "🍳",
          Event: "📅",
          LocalBusiness: "🏢",
          FAQPage: "❓",
        }[primaryType] || "📦";
      setStatus(
        typeEmoji,
        `${primaryType} detected (${data.entities.length} entities)`,
        "found",
      );

      displaySection.hidden = false;
      presetsSection.hidden = false;
      ttsSection.hidden = !hasNlweb;

      const typeDescs = {
        Product:
          "View product details in a clean, accessible layout with price, ratings, and description.",
        Article: "Read this article in a distraction-free reader mode.",
        Recipe: "Follow this recipe step-by-step with ingredient checklist.",
        Event:
          "View event details with date, location, and ticketing information.",
        LocalBusiness:
          "See business info with address, hours, phone, and ratings.",
        FAQPage:
          "Browse frequently asked questions in an accessible accordion.",
      };
      detectedTypeDesc.textContent =
        typeDescs[primaryType] ||
        `Transform this ${primaryType} into an accessible view.`;
    } else {
      const totalCount =
        (data.jsonLd || []).length +
        (data.microdata || []).length +
        (data.rdfa || []).length;
      if (totalCount > 0 || hasNlweb) {
        setStatus("📊", `${totalCount} schema items found`, "found");
        displaySection.hidden = true;
        presetsSection.hidden = true;
        ttsSection.hidden = !hasNlweb;
      } else {
        setStatus("📄", "No structured data found", "empty");
        emptyState.hidden = false;
        displaySection.hidden = true;
        presetsSection.hidden = true;
        ttsSection.hidden = true;
      }
    }

    // Fetch and render schemamap navigation
    fetchSchemamapForSidepanel(data);

    // Render raw data sections
    const hasAnyRaw =
      (data.jsonLd?.length || 0) +
        (data.microdata?.length || 0) +
        (data.rdfa?.length || 0) >
      0;
    rawDataSection.hidden = !hasAnyRaw;
    if (hasAnyRaw) {
      renderSection("jsonld", data.jsonLd, true);
      renderSection("microdata", data.microdata);
      renderSection("rdfa", data.rdfa);
    }
  }

  // --- Schemamap Navigation (Sidepanel) ---

  function fetchSchemamapForSidepanel(schemaData) {
    const origin = schemaData.url ? new URL(schemaData.url).origin : null;
    if (!origin) {
      navSection.hidden = true;
      return;
    }
    chrome.runtime.sendMessage(
      {
        type: "GET_SCHEMAMAP",
        origin: origin,
        schemaData: schemaData,
      },
      (response) => {
        if (
          chrome.runtime.lastError ||
          !response ||
          !response.navItems ||
          response.navItems.length === 0
        ) {
          navSection.hidden = true;
          return;
        }
        navSection.hidden = false;
        navLinks.innerHTML = "";
        renderNavLinks(response.navItems, navLinks);
      },
    );
  }

  function renderNavLinks(items, container) {
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "nav-link-item";
      if (item.url) {
        const link = document.createElement("a");
        link.href = item.url;
        link.textContent = item.name || item.url;
        link.target = "_blank";
        link.className = "nav-link";
        li.appendChild(link);
      } else {
        const span = document.createElement("span");
        span.textContent = item.name;
        span.className = "nav-link-label";
        li.appendChild(span);
      }
      if (item.children && item.children.length > 0) {
        const subList = document.createElement("ul");
        subList.className = "nav-link-sublist";
        renderNavLinks(item.children, subList);
        li.appendChild(subList);
      }
      container.appendChild(li);
    }
  }

  // --- Activate / Deactivate ---

  btnActivate.addEventListener("click", () => {
    if (!currentData) return;
    chrome.runtime.sendMessage(
      {
        type: "ACTIVATE_TRANSFORM",
        payload: currentData,
      },
      () => {
        isTransformActive = true;
        btnActivate.hidden = true;
        btnDeactivate.hidden = false;
      },
    );
  });

  btnDeactivate.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "DEACTIVATE_TRANSFORM" }, () => {
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
    });
  });

  // --- Dyslexia Toggle ---

  let dyslexiaEnabled = false;

  function applyDyslexia(enabled) {
    dyslexiaEnabled = enabled;
    const toggle = document.getElementById("toggle-dyslexia");
    if (toggle) toggle.setAttribute("aria-checked", String(enabled));
    document.body.classList.toggle("sp-preset-dyslexia", enabled);
    // Send to content script
    chrome.runtime.sendMessage({
      type: "SET_PRESETS",
      presets: { dyslexia: enabled },
    });
    chrome.storage.local.set({ uaPresets: { dyslexia: enabled } });
  }

  document.getElementById("toggle-dyslexia")?.addEventListener("click", () => {
    applyDyslexia(!dyslexiaEnabled);
  });

  document
    .getElementById("toggle-dyslexia")
    ?.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        applyDyslexia(!dyslexiaEnabled);
      }
    });

  // Restore saved state (with v1/v2 migration)
  chrome.storage.local.get(
    ["uaPreset", "uaDyslexia", "uaPresets"],
    (result) => {
      if (result.uaPresets && typeof result.uaPresets === "object") {
        if (result.uaPresets.dyslexia) applyDyslexia(true);
      } else if (typeof result.uaDyslexia === "boolean") {
        if (result.uaDyslexia) applyDyslexia(true);
        chrome.storage.local.remove("uaDyslexia");
      } else if (result.uaPreset) {
        if (result.uaPreset === "dyslexia") applyDyslexia(true);
        chrome.storage.local.remove("uaPreset");
      }
    },
  );

  // --- Raw Data Tree Rendering ---

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
    itemsEl.innerHTML = "";

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

  // --- Copy JSON ---

  document.getElementById("btn-copy-json").addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentData) return;
    const output = {};
    if (currentData.jsonLd?.length)
      output.jsonLd = currentData.jsonLd.map((i) => i.data || i);
    if (currentData.microdata?.length) output.microdata = currentData.microdata;
    if (currentData.rdfa?.length) output.rdfa = currentData.rdfa;
    if (currentData.entities?.length) output.entities = currentData.entities;
    output.primaryType = currentData.primaryType || null;
    output.url = currentData.url || "";
    const json = JSON.stringify(output, null, 2);
    navigator.clipboard.writeText(json).then(() => {
      const btn = document.getElementById("btn-copy-json");
      btn.textContent = "✅ Copied!";
      setTimeout(() => {
        btn.textContent = "📋 Copy";
      }, 2000);
    });
  });

  // --- Toggle Handlers ---

  document
    .querySelectorAll(".section-toggle, .subsection-header")
    .forEach((header) => {
      header.addEventListener("click", () => {
        header.classList.toggle("open");
        const isOpen = header.classList.contains("open");
        header.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });
    });

  // --- NLWeb form handler ---

  document.getElementById("nlweb-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("nlweb-query");
    const query = input.value.trim();
    if (!query || !getNlwebEndpoint()) return;
    if (speechController?.isListening()) speechController.stop();
    const results = document.getElementById("nlweb-results");
    results.innerHTML = "";
    setNlwebLoading(true);
    chrome.runtime.sendMessage({
      type: "NLWEB_QUERY",
      query,
      endpoint: getNlwebEndpoint(),
      mode: "summarize",
    });
  });

  // --- Schema Aggregation ---

  function showAggregationSection(state) {
    if (state && state.hasProducts) {
      aggregationSection.hidden = false;
    } else {
      aggregationSection.hidden = true;
    }
  }

  btnBrowseProducts.addEventListener("click", () => {
    aggregationStatus.textContent = "Loading products…";
    btnBrowseProducts.disabled = true;
    chrome.runtime.sendMessage({ type: "FETCH_AGGREGATED_PRODUCTS" });
  });

  // --- Initialize ---

  function refreshSchemaData() {
    isTransformActive = false;
    btnActivate.hidden = false;
    btnDeactivate.hidden = true;

    chrome.runtime.sendMessage({ type: "GET_SCHEMA_DATA" }, (response) => {
      if (chrome.runtime.lastError) {
        handleSchemaData(null);
        return;
      }
      handleSchemaData(response);
    });
  }

  // Initial loads
  chrome.runtime.sendMessage({ type: "GET_AGGREGATION_STATE" }, (response) => {
    if (chrome.runtime.lastError) return;
    showAggregationSection(response);
  });

  refreshSchemaData();

  // Re-fetch when the active tab navigates to a new page
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || tabs[0].id !== tabId) return;

      if (changeInfo.status === "loading") {
        setStatus("🔍", "Scanning page…", "");
        handleSchemaData(null);
        showAggregationSection(null);
      }

      if (changeInfo.status === "complete") {
        refreshSchemaData();
      }
    });
  });

  // Listen for live updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "TAB_ACTIVATED") {
      handleSchemaData(message.payload);
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
      showAggregationSection(message.aggregation);
      if (message.nlweb) {
        updateNlwebSection(message.nlweb.endpoint, message.nlweb.method);
      }
    }
    if (message.type === "SCHEMA_UPDATE") {
      handleSchemaData(message.payload);
    }
    if (message.type === "DEACTIVATE_TRANSFORM") {
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
    }
    if (message.type === "SCHEMA_AGGREGATION_AVAILABLE") {
      showAggregationSection(message);
    }
    if (message.type === "AGGREGATED_PRODUCTS_RESULT") {
      btnBrowseProducts.disabled = false;
      if (message.error) {
        aggregationStatus.textContent = `Error: ${message.error}`;
        return;
      }
      if (!message.products || message.products.length === 0) {
        aggregationStatus.textContent = "No products found.";
        return;
      }
      aggregationStatus.textContent = `Found ${message.products.length} products. Opening overlay…`;
      chrome.runtime.sendMessage({
        type: "ACTIVATE_PRODUCT_BROWSE",
        products: message.products,
      });
      setTimeout(() => {
        aggregationStatus.textContent = "";
      }, 3000);
    }
    if (message.type === "NLWEB_ENDPOINT") {
      updateNlwebSection(message.endpoint, message.method);
    }
    if (message.type === "NLWEB_RESULT_CHUNK") {
      if (message.error) {
        setNlwebLoading(false);
        showNlwebError(message.error);
        return;
      }
      if (message.done) {
        setNlwebLoading(false);
        return;
      }
      if (message.chunk) {
        renderNlwebChunk(message.chunk);
      }
    }
  });
})();
