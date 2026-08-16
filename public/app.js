// ============================================================================
// Anything to Blocks — Frontend Application
// ============================================================================

// --- State ---
let sessionId = null;
let regions = new Map(); // regionId -> { data, messages, expanded, generating }
let pickerActive = false;
let browserViewReady = false;

// --- DOM shortcuts ---
const $ = (id) => document.getElementById(id);
const statusText = $("status-text");
const workspace = $("workspace");
const urlInput = $("url-input");
const urlGoBtn = $("url-go");
const browserBack = $("browser-back");
const browserForward = $("browser-forward");
const browserReload = $("browser-reload");
const pickerToggle = $("picker-toggle");
const browserContainer = $("browser-container");
const browserPlaceholder = $("browser-placeholder");
const currentUrlLabel = $("current-url");
const conversationsList = $("conversations-list");
const noRegions = $("no-regions");
const regionCount = $("region-count");
const wpSidebar = $("wp-sidebar");
const sidebarToggle = $("sidebar-toggle");
const wpRefreshBtn = $("wp-refresh-btn");
const wpNotConfigured = $("wp-not-configured");
const wpInfo = $("wp-info");
const wpSidebarResizeHandle = $("wp-sidebar-resize-handle");
const conversationsPanel = $("conversations-panel");

// Settings modal
const settingsModal = $("settings-modal");
const settingsMigrationMode = $("settings-migration-mode");
const settingsCommand = $("settings-command");
const settingsArgs = $("settings-args");
const settingsEnv = $("settings-env");
const settingsBlockPrompt = $("settings-block-prompt");
const settingsWpUrl = $("settings-wp-url");
const settingsWpUser = $("settings-wp-user");
const settingsWpPass = $("settings-wp-pass");
const settingsWpMcp = $("settings-wp-mcp");
const saveSettingsBtn = $("save-settings-btn");
const closeSettingsBtn = $("close-settings-btn");

// Detect Electron
const isElectron = typeof window !== "undefined" && window.a2b;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function setStatus(msg, type = "") {
  statusText.textContent = msg;
  statusText.className = `status ${type}`;
}

function clearStatus() {
  statusText.textContent = "";
  statusText.className = "status";
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
let appConfig = { agent: {}, wordpress: {} };

async function loadAppConfig() {
  if (isElectron && window.a2b.getConfig) {
    appConfig = await window.a2b.getConfig();
  }
  // Populate settings form
  settingsMigrationMode.value = appConfig.agent?.migrationMode ?? "structure";
  settingsCommand.value = appConfig.agent?.command ?? "opencode";
  settingsArgs.value = appConfig.agent?.args ?? "acp";
  settingsEnv.value = appConfig.agent?.env ?? "";
  settingsBlockPrompt.value = appConfig.agent?.blockPrompt ?? "";
  settingsWpUrl.value = appConfig.wordpress?.siteUrl ?? "";
  settingsWpUser.value = appConfig.wordpress?.username ?? "";
  settingsWpPass.value = appConfig.wordpress?.applicationPassword ?? "";
  settingsWpMcp.value = appConfig.wordpress?.mcpEndpoint ?? "";
}

async function saveAppConfig() {
  const config = {
    agent: {
      command: settingsCommand.value.trim() || "opencode",
      args: settingsArgs.value.trim() || "acp",
      env: settingsEnv.value.trim(),
      migrationMode: settingsMigrationMode.value,
      blockPrompt: settingsBlockPrompt.value.trim(),
    },
    wordpress: {
      siteUrl: settingsWpUrl.value.trim(),
      username: settingsWpUser.value.trim(),
      applicationPassword: settingsWpPass.value.trim(),
      mcpEndpoint: settingsWpMcp.value.trim() || "/wp-json/mcp/mcp-adapter-default-server",
    },
  };
  if (isElectron && window.a2b.setConfig) {
    await window.a2b.setConfig(config);
  }
  appConfig = config;
  closeSettings();
  // Refresh WordPress info if site URL is set
  if (config.wordpress.siteUrl) {
    await fetchWordPressInfo();
  } else {
    showWpNotConfigured();
  }
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
async function createSession() {
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create session");
    }
    const data = await res.json();
    sessionId = data.sessionId;
    setStatus("Session created", "success");
    setTimeout(clearStatus, 2000);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  }
}

// ---------------------------------------------------------------------------
// Browser navigation
// ---------------------------------------------------------------------------
async function navigateToUrl(url) {
  if (!url) return;
  if (!url.match(/^https?:\/\//)) {
    url = `https://${url}`;
  }
  urlInput.value = url;
  browserPlaceholder.classList.add("hidden");
  setStatus("Loading…");

  try {
    if (isElectron && window.a2b.loadUrl) {
      await window.a2b.loadUrl(url);
    } else {
      const res = await fetch("/api/browser/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) throw new Error("Failed to load URL");
    }
    currentUrlLabel.textContent = url;
    updateBrowserBounds();
    clearStatus();
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
    browserPlaceholder.classList.remove("hidden");
  }
}

async function goBack() {
  if (isElectron && window.a2b.goBack) {
    await window.a2b.goBack();
  }
}

async function goForward() {
  if (isElectron && window.a2b.goForward) {
    await window.a2b.goForward();
  }
}

async function reloadPage() {
  if (isElectron && window.a2b.reload) {
    await window.a2b.reload();
  }
}

// ---------------------------------------------------------------------------
// Element picker
// ---------------------------------------------------------------------------
async function togglePicker() {
  pickerActive = !pickerActive;
  pickerToggle.classList.toggle("active", pickerActive);
  pickerToggle.textContent = pickerActive ? "✕ Cancel" : "🎯 Pick Element";

  if (isElectron && window.a2b.togglePicker) {
    await window.a2b.togglePicker(pickerActive);
  } else {
    const res = await fetch("/api/browser/picker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: pickerActive }),
    });
    if (!res.ok) {
      setStatus("Failed to toggle picker", "error");
      pickerActive = false;
      pickerToggle.classList.remove("active");
      pickerToggle.textContent = "🎯 Pick Element";
    }
  }

  if (pickerActive) {
    setStatus("Click an element in the browser to select it");
  } else {
    clearStatus();
  }
}

// ---------------------------------------------------------------------------
// Browser view bounds management
// ---------------------------------------------------------------------------
function updateBrowserBounds() {
  if (!isElectron || !window.a2b.setBounds) return;

  const rect = browserContainer.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  window.a2b.setBounds({
    x: Math.round(rect.left * dpr),
    y: Math.round(rect.top * dpr),
    width: Math.round(rect.width * dpr),
    height: Math.round(rect.height * dpr),
  });
}

// ---------------------------------------------------------------------------
// Region management
// ---------------------------------------------------------------------------
async function handleElementSelected(data) {
  // Capture screenshot of the element
  let screenshot = null;
  if (isElectron && window.a2b.captureElement && data.boundingRect) {
    const dpr = window.devicePixelRatio || 1;
    screenshot = await window.a2b.captureElement({
      x: data.boundingRect.x * dpr,
      y: data.boundingRect.y * dpr,
      width: data.boundingRect.width * dpr,
      height: data.boundingRect.height * dpr,
    });
  }

  // Create region via server
  const regionData = {
    tagName: data.tagName,
    classes: data.classes || [],
    id: data.id || "",
    attributes: data.attributes || {},
    computedStyles: data.computedStyles || {},
    boundingRect: data.boundingRect || {},
    outerHTML: data.outerHTML || "",
    innerText: data.innerText || "",
    screenshot,
  };

  try {
    const res = await fetch("/api/region", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(regionData),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to register region");
    }
    const result = await res.json();
    addRegionCard(result.regionId, regionData);
    setStatus(`Region selected: ${data.tagName}`, "success");
    setTimeout(clearStatus, 2000);
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error");
  }

  // Turn off picker after selection
  if (pickerActive) {
    pickerActive = false;
    pickerToggle.classList.remove("active");
    pickerToggle.textContent = "🎯 Pick Element";
    if (isElectron && window.a2b.togglePicker) {
      await window.a2b.togglePicker(false);
    }
  }
}

function addRegionCard(regionId, data) {
  regions.set(regionId, { data, messages: [], expanded: true, generating: false });

  if (noRegions) noRegions.style.display = "none";

  const card = document.createElement("div");
  card.className = "region-card expanded";
  card.id = `region-${regionId}`;
  card.innerHTML = `
    <div class="region-card-header">
      <img class="region-card-thumbnail" src="${data.screenshot || ""}" alt="" onerror="this.style.display='none'">
      <div class="region-card-info">
        <div class="region-card-tag">&lt;${data.tagName}${data.id ? `#${data.id}` : ""}${data.classes.length ? `.${data.classes.slice(0, 3).join(".")}` : ""}&gt;</div>
        <div class="region-card-meta">${data.boundingRect.width ? `${Math.round(data.boundingRect.width)}×${Math.round(data.boundingRect.height)}` : ""}</div>
      </div>
      <div class="region-card-actions">
        <button class="btn btn-small btn-ghost region-delete-btn" title="Remove">✕</button>
      </div>
      <span class="expand-arrow">▸</span>
    </div>
    <div class="region-card-body">
      <div class="region-messages"></div>
      <div class="block-output" style="display:none;">
        <div class="block-output-header">
          <span class="block-output-title">Gutenberg Block Markup</span>
          <div class="block-output-actions">
            <button class="btn btn-small btn-ghost block-copy-btn">Copy</button>
          </div>
        </div>
        <pre></pre>
      </div>
      <div class="region-input-area">
        <textarea placeholder="Ask about this region or type a custom block request…" rows="2"></textarea>
        <div class="region-input-actions">
          <button class="btn btn-small btn-primary region-generate-btn">Convert to Block</button>
        </div>
      </div>
    </div>
  `;

  conversationsList.appendChild(card);

  // Wire up events
  const header = card.querySelector(".region-card-header");
  header.addEventListener("click", (e) => {
    if (e.target.closest(".region-delete-btn")) return;
    card.classList.toggle("expanded");
  });

  card.querySelector(".region-delete-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    deleteRegion(regionId);
  });

  card.querySelector(".region-generate-btn").addEventListener("click", () => {
    const textarea = card.querySelector(".region-input-area textarea");
    const customPrompt = textarea.value.trim();
    generateBlock(regionId, customPrompt);
  });

  // Enter to send in textarea
  const textarea = card.querySelector(".region-input-area textarea");
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const customPrompt = textarea.value.trim();
      if (customPrompt) {
        sendRegionChat(regionId, customPrompt);
        textarea.value = "";
      }
    }
  });

  // Copy block markup
  card.querySelector(".block-copy-btn").addEventListener("click", () => {
    const pre = card.querySelector(".block-output pre");
    navigator.clipboard.writeText(pre.textContent).then(() => {
      setStatus("Block markup copied", "success");
      setTimeout(clearStatus, 2000);
    });
  });

  updateRegionCount();
}

function deleteRegion(regionId) {
  regions.delete(regionId);
  const card = $(`region-${regionId}`);
  if (card) card.remove();
  fetch(`/api/region/${regionId}`, { method: "DELETE" }).catch(() => {});
  if (regions.size === 0 && noRegions) {
    noRegions.style.display = "block";
  }
  updateRegionCount();
}

function updateRegionCount() {
  regionCount.textContent = regions.size > 0 ? `(${regions.size})` : "";
}

// ---------------------------------------------------------------------------
// Region chat (SSE streaming)
// ---------------------------------------------------------------------------
async function sendRegionChat(regionId, message) {
  if (!sessionId || !regions.has(regionId)) return;

  const card = $(`region-${regionId}`);
  const messagesEl = card.querySelector(".region-messages");
  addRegionMessage(messagesEl, "user", message);

  const assistantEl = addRegionMessage(messagesEl, "assistant", "");
  assistantEl.classList.add("typing");
  assistantEl.textContent = "Thinking…";

  try {
    const res = await fetch(`/api/region/${regionId}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Chat failed");
    }

    await readSSEStream(res, assistantEl, (text) => {
      const region = regions.get(regionId);
      if (region) region.messages.push({ role: "assistant", content: text });
    });
  } catch (err) {
    assistantEl.classList.remove("typing");
    assistantEl.textContent = `⚠️ Error: ${err.message}`;
    assistantEl.style.color = "var(--danger)";
  }
}

// ---------------------------------------------------------------------------
// Block generation (SSE streaming)
// ---------------------------------------------------------------------------
async function generateBlock(regionId, customPrompt) {
  if (!sessionId || !regions.has(regionId)) return;

  const region = regions.get(regionId);
  if (region.generating) return;
  region.generating = true;

  const card = $(`region-${regionId}`);
  const messagesEl = card.querySelector(".region-messages");
  const generateBtn = card.querySelector(".region-generate-btn");

  if (customPrompt) {
    addRegionMessage(messagesEl, "user", customPrompt);
  }

  const assistantEl = addRegionMessage(messagesEl, "assistant", "");
  assistantEl.classList.add("typing");
  assistantEl.textContent = "Generating block markup…";
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="btn-spinner"></span>Generating…';

  try {
    const res = await fetch(`/api/region/${regionId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regionId, customPrompt }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Generation failed");
    }

    let blockMarkup = "";
    await readSSEStream(res, assistantEl, (text) => {
      blockMarkup = text;
    });

    // Show block output
    if (blockMarkup) {
      const outputEl = card.querySelector(".block-output");
      const pre = outputEl.querySelector("pre");
      pre.textContent = blockMarkup;
      outputEl.style.display = "block";

      region.messages.push({ role: "assistant", content: blockMarkup });
      region.blockMarkup = blockMarkup;
    }
  } catch (err) {
    assistantEl.classList.remove("typing");
    assistantEl.textContent = `⚠️ Error: ${err.message}`;
    assistantEl.style.color = "var(--danger)";
  } finally {
    region.generating = false;
    generateBtn.disabled = false;
    generateBtn.textContent = "Convert to Block";
  }
}

// ---------------------------------------------------------------------------
// SSE stream reader
// ---------------------------------------------------------------------------
async function readSSEStream(res, assistantEl, onComplete) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResponse = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;
        try {
          const event = JSON.parse(jsonStr);
          if (event.type === "thinking") {
            assistantEl.innerHTML = `<span style="color:var(--text-muted)">Thinking…</span>`;
          } else if (event.type === "tool_event") {
            // Subtle tool event display
            const toolEl = document.createElement("div");
            toolEl.className = "message tool-event";
            toolEl.textContent = `🔧 ${event.tool || "tool"}`;
            assistantEl.parentElement.insertBefore(toolEl, assistantEl);
          } else if (event.type === "complete") {
            finalResponse = event.response || "";
            assistantEl.classList.remove("typing");
            assistantEl.textContent = finalResponse;
          } else if (event.type === "error") {
            throw new Error(event.error || "Agent error");
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Agent error" && !e.message.includes("Failed to create session")) {
            // ignore JSON parse errors
          }
        }
      }
    }
  }

  if (finalResponse) {
    onComplete(finalResponse);
  }
  return finalResponse;
}

function addRegionMessage(messagesEl, role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${role}`;
  const msg = document.createElement("div");
  msg.className = `message ${role}`;
  msg.textContent = text;
  wrapper.appendChild(msg);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return msg;
}

// ---------------------------------------------------------------------------
// WordPress sidebar
// ---------------------------------------------------------------------------
async function fetchWordPressInfo() {
  if (!appConfig.wordpress?.siteUrl) {
    showWpNotConfigured();
    return;
  }

  setStatus("Fetching WordPress info…");

  try {
    const res = await fetch("/api/wordpress/info");
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to fetch WordPress info");
    }
    const info = await res.json();
    renderWordPressInfo(info);
    clearStatus();
  } catch (err) {
    setStatus(`WordPress: ${err.message}`, "error");
    showWpNotConfigured();
  }
}

function showWpNotConfigured() {
  wpNotConfigured.style.display = "block";
  wpInfo.style.display = "none";
}

function renderWordPressInfo(info) {
  wpNotConfigured.style.display = "none";
  wpInfo.style.display = "block";

  // Site info
  const siteEl = $("wp-site-info");
  siteEl.innerHTML = `
    <div class="wp-info-row"><span class="wp-info-label">URL:</span> <span class="wp-info-value">${escapeHtml(info.siteUrl || "")}</span></div>
    <div class="wp-info-row"><span class="wp-info-label">Name:</span> <span class="wp-info-value">${escapeHtml(info.siteName || "—")}</span></div>
    <div class="wp-info-row"><span class="wp-info-label">Description:</span> <span class="wp-info-value">${escapeHtml(info.siteDescription || "—")}</span></div>
  `;

  // Theme
  const themeEl = $("wp-theme-info");
  if (info.theme) {
    themeEl.innerHTML = `
      <div class="wp-info-row"><span class="wp-info-label">Name:</span> <span class="wp-info-value">${escapeHtml(info.theme.name || info.theme.theme_name || "")}</span></div>
      <div class="wp-info-row"><span class="wp-info-label">Version:</span> <span class="wp-info-value">${escapeHtml(info.theme.version || "")}</span></div>
      <div class="wp-info-row"><span class="wp-info-label">Status:</span> <span class="wp-info-value">${escapeHtml(info.theme.status || "active")}</span></div>
    `;
  } else {
    themeEl.innerHTML = `<div class="wp-item-meta">No active theme found</div>`;
  }

  // Plugins
  const pluginList = $("wp-plugin-list");
  const plugins = info.plugins || [];
  $("wp-plugin-count").textContent = plugins.length;
  pluginList.innerHTML = plugins.map(p => `
    <div class="wp-item">
      <div class="wp-item-name">${escapeHtml(p.name || p.plugin)}</div>
      <div class="wp-item-meta">${escapeHtml(p.version || "")} ${p.status === "active" ? "✓" : ""}</div>
    </div>
  `).join("");

  // Block types
  const blockList = $("wp-block-list");
  const blocks = info.blockTypes || [];
  $("wp-block-count").textContent = blocks.length;
  blockList.innerHTML = blocks.slice(0, 50).map(b => `
    <div class="wp-item">
      <div class="wp-item-name">${escapeHtml(b.name)}</div>
      <div class="wp-item-meta">${escapeHtml(b.title || "")}</div>
    </div>
  `).join("") + (blocks.length > 50 ? `<div class="wp-item-meta">…and ${blocks.length - 50} more</div>` : "");

  // Patterns
  const patternList = $("wp-pattern-list");
  const patterns = info.patterns || [];
  $("wp-pattern-count").textContent = patterns.length;
  patternList.innerHTML = patterns.slice(0, 30).map(p => `
    <div class="wp-item">
      <div class="wp-item-name">${escapeHtml(p.title || p.name)}</div>
      <div class="wp-item-meta">${escapeHtml(p.name || "")}</div>
    </div>
  `).join("") + (patterns.length > 30 ? `<div class="wp-item-meta">…and ${patterns.length - 30} more</div>` : "");

  // Templates
  const templateList = $("wp-template-list");
  const templates = info.templates || [];
  $("wp-template-count").textContent = templates.length;
  templateList.innerHTML = templates.map(t => `
    <div class="wp-item">
      <div class="wp-item-name">${escapeHtml(t.slug || t.template_name || "")}</div>
      <div class="wp-item-meta">${escapeHtml(t.title?.rendered || t.description?.rendered || "")}</div>
    </div>
  `).join("");
}

// ---------------------------------------------------------------------------
// Settings modal
// ---------------------------------------------------------------------------
function openSettings() {
  settingsModal.style.display = "flex";
}

function closeSettings() {
  settingsModal.style.display = "none";
}

// ---------------------------------------------------------------------------
// Sidebar toggle & resize
// ---------------------------------------------------------------------------
function toggleSidebar() {
  wpSidebar.classList.toggle("collapsed");
  updateBrowserBounds();
}

// Sidebar resize (drag)
let sidebarDragging = false;

wpSidebarResizeHandle.addEventListener("mousedown", (e) => {
  sidebarDragging = true;
  wpSidebar.classList.add("resizing");
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (sidebarDragging) {
    const rect = wpSidebar.getBoundingClientRect();
    const newWidth = e.clientX - rect.left;
    if (newWidth >= 200 && newWidth <= 500) {
      wpSidebar.style.width = `${newWidth}px`;
    }
    updateBrowserBounds();
  }
});

document.addEventListener("mouseup", () => {
  if (sidebarDragging) {
    sidebarDragging = false;
    wpSidebar.classList.remove("resizing");
    updateBrowserBounds();
  }
});

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------------------------------------------------------------------------
// Event wiring
// ---------------------------------------------------------------------------
urlGoBtn.addEventListener("click", () => navigateToUrl(urlInput.value.trim()));
urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") navigateToUrl(urlInput.value.trim());
});
browserBack.addEventListener("click", goBack);
browserForward.addEventListener("click", goForward);
browserReload.addEventListener("click", reloadPage);
pickerToggle.addEventListener("click", togglePicker);
sidebarToggle.addEventListener("click", toggleSidebar);
wpRefreshBtn.addEventListener("click", fetchWordPressInfo);

saveSettingsBtn.addEventListener("click", saveAppConfig);
closeSettingsBtn.addEventListener("click", closeSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

// Electron IPC events
if (isElectron) {
  if (window.a2b.onNavigated) {
    window.a2b.onNavigated((url) => {
      urlInput.value = url;
      currentUrlLabel.textContent = url;
      updateBrowserBounds();
    });
  }

  if (window.a2b.onBrowserResize) {
    window.a2b.onBrowserResize(() => {
      updateBrowserBounds();
    });
  }

  if (window.a2b.onElementSelected) {
    window.a2b.onElementSelected((data) => {
      handleElementSelected(data);
    });
  }

  if (window.a2b.onPickerEnabled) {
    window.a2b.onPickerEnabled(() => {
      pickerActive = true;
      pickerToggle.classList.add("active");
      pickerToggle.textContent = "✕ Cancel";
    });
  }

  if (window.a2b.onPickerDisabled) {
    window.a2b.onPickerDisabled(() => {
      pickerActive = false;
      pickerToggle.classList.remove("active");
      pickerToggle.textContent = "🎯 Pick Element";
    });
  }

  if (window.a2b.onOpenSettings) {
    window.a2b.onOpenSettings(() => openSettings());
  }
}

// Window resize → update browser bounds
window.addEventListener("resize", () => {
  updateBrowserBounds();
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
(async function init() {
  await loadAppConfig();
  await createSession();
  if (appConfig.wordpress?.siteUrl) {
    await fetchWordPressInfo();
  } else {
    showWpNotConfigured();
  }
  // Initial bounds after layout settles
  setTimeout(updateBrowserBounds, 100);
})();