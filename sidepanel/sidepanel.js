// Side panel — control hub for Universal Access
// Integrates schema display, visual transformations, presets, and NLWeb

import { createTreeNode, renderError } from "./tree-renderer.js";
import {
  getNlwebEndpoint,
  updateNlwebSection,
  renderNlwebChunk,
  setNlwebLoading,
  showNlwebError,
  onLoadingChange,
} from "./nlweb-ui.js";
import * as webllm from "./webllm-chat.js";

(function () {
  "use strict";

  // --- State ---
  let currentData = null;
  let isTransformActive = false;
  let speechController = null;
  let llmChatInProgress = false;
  let llmInitPromise = null;

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
  const navSection = document.getElementById("nav-section");
  const navLinks = document.getElementById("nav-links");
  const rawDataSection = document.getElementById("raw-data-section");

  // --- Theme Toggle ---

  const THEMES = ["auto", "light", "dark"];
  const THEME_ICONS = { auto: "⚙", light: "☀", dark: "🌙" };
  const THEME_LABELS = {
    auto: "Theme: Auto",
    light: "Theme: Light",
    dark: "Theme: Dark",
  };
  let currentTheme = "auto";

  function applyTheme(theme) {
    currentTheme = theme;
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = THEME_ICONS[theme];
      btn.title = THEME_LABELS[theme];
      btn.setAttribute("aria-label", THEME_LABELS[theme]);
    }
    if (theme === "auto") {
      document.body.removeAttribute("data-theme");
    } else {
      document.body.setAttribute("data-theme", theme);
    }
    chrome.storage.local.set({ uaTheme: theme });
  }

  // Restore saved theme
  chrome.storage.local.get("uaTheme", (result) => {
    if (result.uaTheme && THEMES.includes(result.uaTheme)) {
      applyTheme(result.uaTheme);
    }
  });

  document.getElementById("theme-toggle")?.addEventListener("click", () => {
    const nextIdx = (THEMES.indexOf(currentTheme) + 1) % THEMES.length;
    applyTheme(THEMES[nextIdx]);
  });

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

  // --- Local LLM Fallback (used by NLWeb input when endpoint is unavailable) ---

  const defaultLlmModelId = webllm.getAvailableModels()[0]?.id || null;

  function setLoaderText(text) {
    const loader = document.querySelector("#nlweb-results .nlweb-loading");
    if (loader) loader.textContent = text;
  }

  function createLocalLlmAnswerCard() {
    const card = document.createElement("div");
    card.className = "nlweb-result-card nlweb-summary-card";

    const title = document.createElement("div");
    title.className = "nlweb-summary-title";
    title.textContent = "Local LLM";

    const body = document.createElement("div");
    body.className = "nlweb-result-description";

    card.appendChild(title);
    card.appendChild(body);
    return { card, body };
  }

  async function ensureLocalLlmReady() {
    if (webllm.isReady()) return;
    if (!defaultLlmModelId) {
      throw new Error("No local LLM model is configured.");
    }

    if (!llmInitPromise) {
      llmInitPromise = webllm
        .initializeEngine(defaultLlmModelId, (progress) => {
          const pct = Number(progress.percent || 0).toFixed(0);
          setLoaderText(`Loading local model (${pct}%): ${progress.text}`);
        })
        .finally(() => {
          llmInitPromise = null;
        });
    }

    await llmInitPromise;
  }

  async function runLocalLlmFallbackQuery(query) {
    const results = document.getElementById("nlweb-results");
    const { card, body } = createLocalLlmAnswerCard();
    results.appendChild(card);

    let receivedChunk = false;
    webllm.onChatMessage((msg) => {
      if (msg.type === "chunk" && msg.content) {
        receivedChunk = true;
        body.textContent += msg.content;
      }
    });

    setLoaderText(
      webllm.isReady() ?
        "Generating local answer..."
      : "Loading local model...",
    );

    setLoaderText("Extracting page content...");
    const pageMarkdown = await getActivePageMarkdown();

    await ensureLocalLlmReady();
    setLoaderText("Generating local answer...");
    const response = await webllm.sendMessage(query, 512, pageMarkdown);

    if (!receivedChunk) {
      body.textContent = response.message || "No response.";
    }
  }

  function getActivePageMarkdown() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_PAGE_MARKDOWN" }, (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          const fallback = [
            currentData?.url ? `URL: ${currentData.url}` : null,
            "[Page markdown extraction unavailable]",
          ]
            .filter(Boolean)
            .join("\n");
          resolve(fallback);
          return;
        }
        const title = response.title || "";
        const url = response.url || currentData?.url || "";
        const markdown = (response.markdown || "").trim();
        const withMeta = [
          title ? `# ${title}` : null,
          url ? `URL: ${url}` : null,
          markdown || "[Page markdown extraction returned empty content]",
        ]
          .filter(Boolean)
          .join("\n\n");
        resolve(withMeta);
      });
    });
  }

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

    if (!hasNlweb && data.url && !webllm.isReady() && !llmInitPromise) {
      ensureLocalLlmReady().catch((err) => {
        console.warn("[LLM] Preload failed:", err);
      });
    }

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
      } else {
        setStatus("📄", "No structured data found", "empty");
        emptyState.hidden = false;
        displaySection.hidden = true;
        presetsSection.hidden = true;
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

  // --- Preset Selection ---

  document.querySelectorAll(".preset-option").forEach((option) => {
    const radio = option.querySelector('input[type="radio"]');
    radio.addEventListener("change", () => {
      document
        .querySelectorAll(".preset-option")
        .forEach((o) => o.classList.remove("active"));
      option.classList.add("active");
      chrome.runtime.sendMessage({ type: "SET_PRESET", preset: radio.value });
    });
  });

  // Restore saved preset
  chrome.storage.local.get("uaPreset", (result) => {
    if (result.uaPreset) {
      const radio = document.querySelector(
        `input[name="preset"][value="${result.uaPreset}"]`,
      );
      if (radio) {
        radio.checked = true;
        document
          .querySelectorAll(".preset-option")
          .forEach((o) => o.classList.remove("active"));
        radio.closest(".preset-option").classList.add("active");
      }
    }
  });

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

  document
    .getElementById("nlweb-form")
    .addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("nlweb-query");
      const query = input.value.trim();
      if (!query || llmChatInProgress) return;

      const endpoint = getNlwebEndpoint();
      if (speechController?.isListening()) speechController.stop();

      const results = document.getElementById("nlweb-results");
      results.innerHTML = "";
      setNlwebLoading(true);
      input.value = "";

      if (endpoint) {
        chrome.runtime.sendMessage({
          type: "NLWEB_QUERY",
          query,
          endpoint,
          mode: "summarize",
        });
        return;
      }

      llmChatInProgress = true;
      try {
        await runLocalLlmFallbackQuery(query);
      } catch (err) {
        console.error("[LLM] Fallback query error:", err);
        showNlwebError(`Local LLM error: ${err.message || "Unknown error"}`);
      } finally {
        llmChatInProgress = false;
        setNlwebLoading(false);
      }
    });

  // --- Initialize ---

  chrome.runtime.sendMessage({ type: "GET_SCHEMA_DATA" }, (response) => {
    if (chrome.runtime.lastError) {
      handleSchemaData(null);
      return;
    }
    handleSchemaData(response);
  });

  // Listen for live updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "SCHEMA_UPDATE") {
      handleSchemaData(message.payload);
    }
    if (message.type === "DEACTIVATE_TRANSFORM") {
      isTransformActive = false;
      btnActivate.hidden = false;
      btnDeactivate.hidden = true;
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
