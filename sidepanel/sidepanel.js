// Side panel — control hub for Universal Access
// Integrates schema display, visual transformations, presets, and NLWeb

import { createTreeNode, renderError, escapeHtml } from "./tree-renderer.js";
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
  const llmStatus = document.getElementById("llm-status");
  const llmModelBadge = document.getElementById("llm-model-badge");
  const llmChatHistory = document.getElementById("llm-chat-history");
  const llmChatForm = document.getElementById("llm-chat-form");
  const llmChatInput = document.getElementById("llm-chat-input");
  const llmSendBtn = document.getElementById("llm-send-btn");

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

  // --- Local LLM Chat Widget ---

  const defaultLlmModelId = webllm.getAvailableModels()[0]?.id || null;

  function setLlmStatus(text) {
    if (llmStatus) llmStatus.textContent = text;
  }

  function appendLlmMessage(role, html = "") {
    const row = document.createElement("div");
    row.className = `llm-message ${role}`;

    const bubble = document.createElement("div");
    bubble.className = "llm-message-bubble nlweb-result-description";
    bubble.innerHTML = html;

    row.appendChild(bubble);
    llmChatHistory.appendChild(row);
    llmChatHistory.scrollTop = llmChatHistory.scrollHeight;
    return bubble;
  }

  function renderInlineMarkdown(text) {
    let html = escapeHtml(text);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    return html;
  }

  function markdownToHtml(markdown) {
    const lines = String(markdown || "")
      .replace(/\r\n/g, "\n")
      .split("\n");
    const out = [];
    let inCode = false;
    let codeLines = [];
    let listType = null;

    function closeList() {
      if (!listType) return;
      out.push(listType === "ol" ? "</ol>" : "</ul>");
      listType = null;
    }

    for (const rawLine of lines) {
      const line = rawLine || "";
      const trimmed = line.trim();

      if (trimmed.startsWith("```")) {
        closeList();
        if (!inCode) {
          inCode = true;
          codeLines = [];
        } else {
          out.push(
            `<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
          );
          inCode = false;
          codeLines = [];
        }
        continue;
      }

      if (inCode) {
        codeLines.push(line);
        continue;
      }

      if (!trimmed) {
        closeList();
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        closeList();
        const level = headingMatch[1].length;
        out.push(
          `<h${level}>${renderInlineMarkdown(headingMatch[2])}</h${level}>`,
        );
        continue;
      }

      const blockQuoteMatch = trimmed.match(/^>\s?(.*)$/);
      if (blockQuoteMatch) {
        closeList();
        out.push(
          `<blockquote>${renderInlineMarkdown(blockQuoteMatch[1])}</blockquote>`,
        );
        continue;
      }

      const ulMatch = trimmed.match(/^[-*]\s+(.*)$/);
      if (ulMatch) {
        if (listType !== "ul") {
          closeList();
          out.push("<ul>");
          listType = "ul";
        }
        out.push(`<li>${renderInlineMarkdown(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = trimmed.match(/^\d+\.\s+(.*)$/);
      if (olMatch) {
        if (listType !== "ol") {
          closeList();
          out.push("<ol>");
          listType = "ol";
        }
        out.push(`<li>${renderInlineMarkdown(olMatch[1])}</li>`);
        continue;
      }

      closeList();
      out.push(`<p>${renderInlineMarkdown(trimmed)}</p>`);
    }

    if (inCode) {
      out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
    }
    closeList();
    return (
      out.join("\n") || `<p>${renderInlineMarkdown(String(markdown || ""))}</p>`
    );
  }

  async function ensureLocalLlmReady() {
    if (webllm.isReady()) return;
    if (!defaultLlmModelId) {
      throw new Error("No local LLM model is configured.");
    }

    if (!llmInitPromise) {
      setLlmStatus("Loading local model...");
      llmInitPromise = webllm
        .initializeEngine(defaultLlmModelId, (progress) => {
          const pct = Number(progress.percent || 0).toFixed(0);
          setLlmStatus(`Loading local model (${pct}%): ${progress.text}`);
        })
        .finally(() => {
          llmInitPromise = null;
        });
    }

    await llmInitPromise;
    if (llmModelBadge) {
      llmModelBadge.textContent = webllm.getCurrentModel() || "Loaded";
    }
    setLlmStatus("Model ready.");
  }

  async function runLocalLlmChatQuery(query) {
    appendLlmMessage("user", `<p>${escapeHtml(query)}</p>`);
    const assistantBubble = appendLlmMessage("assistant", "<p>...</p>");

    let receivedChunk = false;
    let streamingMarkdown = "";
    webllm.onChatMessage((msg) => {
      if (msg.type === "chunk" && msg.content) {
        receivedChunk = true;
        streamingMarkdown += msg.content;
        assistantBubble.innerHTML = markdownToHtml(streamingMarkdown);
        llmChatHistory.scrollTop = llmChatHistory.scrollHeight;
      }
    });

    setLlmStatus("Extracting page context...");
    const pageMarkdown = await getActivePageMarkdown();

    await ensureLocalLlmReady();
    setLlmStatus("Generating response...");
    const response = await webllm.sendMessage(query, 512, pageMarkdown);

    if (!receivedChunk) {
      assistantBubble.innerHTML = markdownToHtml(
        response.message || "No response.",
      );
    }
    setLlmStatus("Ready");
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
      if (!query) return;

      const endpoint = getNlwebEndpoint();
      if (!endpoint) {
        showNlwebError("No NLWeb endpoint available for this site.");
        return;
      }
      if (speechController?.isListening()) speechController.stop();

      const results = document.getElementById("nlweb-results");
      results.innerHTML = "";
      setNlwebLoading(true);
      input.value = "";

      chrome.runtime.sendMessage({
        type: "NLWEB_QUERY",
        query,
        endpoint,
        mode: "summarize",
      });
    });

  llmChatForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = llmChatInput.value.trim();
    if (!query || llmChatInProgress) return;

    llmChatInProgress = true;
    llmChatInput.disabled = true;
    llmSendBtn.disabled = true;
    llmChatInput.value = "";

    try {
      await runLocalLlmChatQuery(query);
    } catch (err) {
      console.error("[LLM] Chat widget error:", err);
      appendLlmMessage(
        "assistant",
        `<p>${escapeHtml(`Error: ${err.message || "Unknown error"}`)}</p>`,
      );
      setLlmStatus("Error while generating response.");
    } finally {
      llmChatInProgress = false;
      llmChatInput.disabled = false;
      llmSendBtn.disabled = false;
      llmChatInput.focus();
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
