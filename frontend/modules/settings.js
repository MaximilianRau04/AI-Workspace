const tokenArc     = document.getElementById("token-arc");
const tokenLabel   = document.getElementById("token-label");
const tokenDisplay = document.getElementById("token-display");
const themeBtn     = document.getElementById("theme-btn");

const settingsBtn    = document.getElementById("settings-btn");
const settingsModal  = document.getElementById("settings-modal");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSave   = document.getElementById("settings-save");
const promptInput    = document.getElementById("system-prompt-input");

// Settings model form
const providerSelect   = document.getElementById("provider-select");
const modelNameInput   = document.getElementById("model-name-input");
const modelSuggestions = document.getElementById("model-suggestions");
const apiKeyInput      = document.getElementById("api-key-input");
const baseUrlInput     = document.getElementById("base-url-input");
const baseUrlField     = document.getElementById("base-url-field");
const detectOllamaBtn  = document.getElementById("detect-ollama-btn");
const reasoningToggle  = document.getElementById("reasoning-toggle");
const streamSpeedSelect = document.getElementById("stream-speed-select");

// Header dropdown
const modelSelectorBtn    = document.getElementById("model-selector-btn");
const modelSelectorLabel  = document.getElementById("model-selector-label");
const modelDropdown       = document.getElementById("model-dropdown");
const modelDropdownList   = document.getElementById("model-dropdown-list");
const modelDropdownManage = document.getElementById("model-dropdown-manage");

// -------------------------------------------------------------------------
// Model suggestions per provider (for datalist in Settings)
// -------------------------------------------------------------------------

const MODEL_LISTS = {
  gemini: [
    "gemini-2.5-flash", "gemini-2.5-pro",
    "gemini-2.0-flash", "gemini-2.0-flash-lite",
    "gemini-1.5-flash", "gemini-1.5-pro",
  ],
  openai: [
    "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano",
    "gpt-4o", "gpt-4o-mini",
    "o4-mini", "o3", "o3-mini",
    "llama3.3:70b", "llama3.2:3b", "llama3.1:8b",
    "mistral:7b", "mixtral:8x7b",
    "gemma3:27b", "gemma3:12b", "gemma3:4b",
    "phi4:14b", "phi4-mini:3.8b",
    "deepseek-r1:70b", "deepseek-r1:32b", "deepseek-r1:14b", "deepseek-r1:7b",
    "qwq:32b",
    "devstral:24b",
    "qwen2.5-coder:32b", "qwen2.5-coder:7b",
    "qwen3:32b", "qwen3:14b", "qwen3:8b", "qwen3:4b",
  ],
  anthropic: [
    "claude-opus-4-8",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
  ],
};

// -------------------------------------------------------------------------
// Tab switching
// -------------------------------------------------------------------------

document.querySelectorAll(".settings-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".settings-panel").forEach(p => { p.hidden = true; });
    tab.classList.add("active");
    document.getElementById(`settings-tab-${tab.dataset.tab}`).hidden = false;
  });
});

// -------------------------------------------------------------------------
// Token display
// -------------------------------------------------------------------------

const TOKEN_LIMIT = 1_000_000;

export function updateTokenDisplay({ prompt, reply }) {
  if (prompt < 0) return;
  const pct = Math.min(prompt / TOKEN_LIMIT, 1);
  const arc = (pct * 100).toFixed(1);
  tokenArc.setAttribute("stroke-dasharray", `${arc} ${100 - arc}`);
  const color = pct > 0.85 ? "#e74c3c" : pct > 0.6 ? "#e67e22" : "#2f6df5";
  tokenArc.setAttribute("stroke", color);
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
  tokenLabel.textContent = `${fmt(prompt)} / 1M`;
  tokenDisplay.title = `Context: ${prompt.toLocaleString("en")} tokens\nReply: ${reply.toLocaleString("en")} tokens\nLimit: 1,000,000 tokens`;
}

// -------------------------------------------------------------------------
// Theme
// -------------------------------------------------------------------------

function applyTheme(light) {
  document.body.classList.toggle("light", light);
  themeBtn.textContent = light ? "🌙" : "☀️";
}

applyTheme(localStorage.getItem("theme") === "light");

themeBtn.addEventListener("click", () => {
  const isLight = !document.body.classList.contains("light");
  applyTheme(isLight);
  localStorage.setItem("theme", isLight ? "light" : "dark");
  themeBtn.classList.remove("spinning");
  void themeBtn.offsetWidth;
  themeBtn.classList.add("spinning");
  themeBtn.addEventListener("animationend", () => themeBtn.classList.remove("spinning"), { once: true });
});

// -------------------------------------------------------------------------
// Settings form helpers
// -------------------------------------------------------------------------

function updateSuggestions(provider) {
  modelSuggestions.innerHTML = (MODEL_LISTS[provider] || [])
    .map(m => `<option value="${m}">`)
    .join("");
}

function updateBaseUrlVisibility(provider) {
  baseUrlField.hidden = provider !== "openai";
}

providerSelect.addEventListener("change", () => {
  const p = providerSelect.value;
  updateSuggestions(p);
  updateBaseUrlVisibility(p);
  modelNameInput.value = MODEL_LISTS[p]?.[0] ?? "";
});

// -------------------------------------------------------------------------
// Detect Ollama models
// -------------------------------------------------------------------------

detectOllamaBtn.addEventListener("click", async () => {
  detectOllamaBtn.textContent = "Detecting…";
  detectOllamaBtn.disabled = true;
  const baseUrl = baseUrlInput.value.trim() || "http://localhost:11434/v1";
  try {
    const res  = await fetch(`/config/ollama-models?base_url=${encodeURIComponent(baseUrl)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const existing = Array.from(modelSuggestions.options).map(o => o.value);
    for (const m of data.models) {
      if (!existing.includes(m)) {
        const opt = document.createElement("option");
        opt.value = m;
        modelSuggestions.appendChild(opt);
      }
    }
    if (data.models.length) {
      modelNameInput.value = data.models[0];
      detectOllamaBtn.textContent = `✓ ${data.models.length} found`;
    } else {
      detectOllamaBtn.textContent = "None found";
    }
  } catch (err) {
    detectOllamaBtn.textContent = "Failed";
    console.error("Ollama detect:", err);
  } finally {
    detectOllamaBtn.disabled = false;
    setTimeout(() => { detectOllamaBtn.textContent = "Detect models"; }, 3000);
  }
});

// -------------------------------------------------------------------------
// Saved models list (auto-managed, no manual naming)
// -------------------------------------------------------------------------

let _saved = [];  // [{ id, model, provider, api_key, base_url, reasoning }]

function _persistSaved() {
  return fetch("/config/presets", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ presets: _saved }),
  });
}

function _upsertSaved(entry) {
  const idx = _saved.findIndex(
    s => s.provider === entry.provider && s.model === entry.model
  );
  if (idx >= 0) {
    _saved[idx] = entry;  // update existing (e.g. new api_key)
  } else {
    _saved.push(entry);
  }
}

// -------------------------------------------------------------------------
// Header dropdown
// -------------------------------------------------------------------------

function _renderModelDropdown(activeId) {
  modelDropdownList.innerHTML = "";
  if (!_saved.length) {
    const empty = document.createElement("p");
    empty.className = "model-dropdown-empty";
    empty.textContent = "Noch keine Modelle gespeichert.";
    modelDropdownList.appendChild(empty);
    return;
  }
  for (const s of _saved) {
    const row = document.createElement("div");
    row.className = "model-dropdown-row";

    const btn = document.createElement("button");
    btn.className = "model-dropdown-item" + (s.id === activeId ? " active" : "");
    btn.innerHTML = `<span class="mdi-name">${s.model}</span><span class="mdi-sub">${s.provider}</span>`;
    btn.addEventListener("click", async () => {
      await _activateSaved(s);
      _closeDropdown();
    });

    const del = document.createElement("button");
    del.className = "model-dropdown-del";
    del.title = "Remove";
    del.textContent = "✕";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      _saved = _saved.filter(x => x.id !== s.id);
      await _persistSaved();
      _renderModelDropdown(activeId);
    });

    row.appendChild(btn);
    row.appendChild(del);
    modelDropdownList.appendChild(row);
  }
}

async function _activateSaved(s) {
  await fetch("/config/model", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      provider:  s.provider,
      model:     s.model,
      api_key:   s.api_key,
      base_url:  s.base_url,
      reasoning: s.reasoning,
    }),
  });
  modelSelectorLabel.textContent = s.model;
  _renderModelDropdown(s.id);
}

function _closeDropdown() {
  modelDropdown.hidden = true;
  modelSelectorBtn.classList.remove("open");
}

modelSelectorBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (!modelDropdown.hidden) {
    _closeDropdown();
  } else {
    modelDropdown.hidden = false;
    modelSelectorBtn.classList.add("open");
  }
});

document.addEventListener("click", (e) => {
  if (!modelDropdown.hidden && !modelDropdown.contains(e.target) && e.target !== modelSelectorBtn) {
    _closeDropdown();
  }
});

modelDropdownManage.addEventListener("click", () => {
  _closeDropdown();
  settingsModal.hidden = false;
  _switchTab("model");
});

// -------------------------------------------------------------------------
// Init
// -------------------------------------------------------------------------

export async function initModelDropdown() {
  const res  = await fetch("/config");
  const data = await res.json();
  _saved = data.model?.presets || [];
  const m = data.model || {};
  modelSelectorLabel.textContent = m.model || "—";
  const active = _saved.find(s => s.provider === m.provider && s.model === m.model);
  _renderModelDropdown(active?.id);
}

// -------------------------------------------------------------------------
// Settings modal open/close helpers
// -------------------------------------------------------------------------

function _switchTab(name) {
  document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".settings-panel").forEach(p => { p.hidden = true; });
  document.querySelector(`.settings-tab[data-tab="${name}"]`).classList.add("active");
  document.getElementById(`settings-tab-${name}`).hidden = false;
}

settingsBtn.addEventListener("click", async () => {
  const res  = await fetch("/config");
  const data = await res.json();

  promptInput.value = data.system_prompt;

  const m = data.model || {};
  providerSelect.value    = m.provider  || "gemini";
  modelNameInput.value    = m.model     || "";
  apiKeyInput.value       = m.api_key   || "";
  baseUrlInput.value      = m.base_url  || "";
  reasoningToggle.checked = m.reasoning || false;
  _saved = m.presets || [];

  updateSuggestions(providerSelect.value);
  updateBaseUrlVisibility(providerSelect.value);

  streamSpeedSelect.value = localStorage.getItem("streamDelay") ?? "8";

  // Always open on Model tab so the user sees their current config
  _switchTab("model");

  settingsModal.hidden = false;
});

settingsCancel.addEventListener("click", () => { settingsModal.hidden = true; });

settingsSave.addEventListener("click", async () => {
  settingsSave.disabled = true;

  await fetch("/config", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ system_prompt: promptInput.value }),
  });

  const entry = {
    id:        `${providerSelect.value}::${modelNameInput.value.trim()}`,
    provider:  providerSelect.value,
    model:     modelNameInput.value.trim(),
    api_key:   apiKeyInput.value.trim(),
    base_url:  baseUrlInput.value.trim(),
    reasoning: reasoningToggle.checked,
  };

  await fetch("/config/model", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(entry),
  });

  // Auto-add to saved list
  _upsertSaved(entry);
  await _persistSaved();

  modelSelectorLabel.textContent = entry.model;
  _renderModelDropdown(entry.id);

  localStorage.setItem("streamDelay", streamSpeedSelect.value);

  // Clear sensitive fields after save
  apiKeyInput.value  = "";
  baseUrlInput.value = "";

  settingsSave.disabled = false;
  settingsModal.hidden  = true;
});
