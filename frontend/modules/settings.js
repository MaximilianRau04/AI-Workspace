const tokenArc     = document.getElementById("token-arc");
const tokenLabel   = document.getElementById("token-label");
const tokenDisplay = document.getElementById("token-display");
const themeBtn     = document.getElementById("theme-btn");

const settingsBtn    = document.getElementById("settings-btn");
const settingsModal  = document.getElementById("settings-modal");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSave   = document.getElementById("settings-save");
const promptInput    = document.getElementById("system-prompt-input");

// Model UI
const providerSelect   = document.getElementById("provider-select");
const modelNameInput   = document.getElementById("model-name-input");
const modelSuggestions = document.getElementById("model-suggestions");
const apiKeyInput      = document.getElementById("api-key-input");
const baseUrlInput     = document.getElementById("base-url-input");
const baseUrlField     = document.getElementById("base-url-field");
const detectOllamaBtn  = document.getElementById("detect-ollama-btn");

// Tab switching
document.querySelectorAll(".settings-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".settings-panel").forEach(p => { p.hidden = true; });
    tab.classList.add("active");
    document.getElementById(`settings-tab-${tab.dataset.tab}`).hidden = false;
  });
});

const TOKEN_LIMIT = 1_000_000;

// --- Token display ---

export function updateTokenDisplay({ prompt, reply }) {
  if (prompt < 0) return; // provider doesn't emit usage
  const pct = Math.min(prompt / TOKEN_LIMIT, 1);
  const arc = (pct * 100).toFixed(1);
  tokenArc.setAttribute("stroke-dasharray", `${arc} ${100 - arc}`);
  const color = pct > 0.85 ? "#e74c3c" : pct > 0.6 ? "#e67e22" : "#2f6df5";
  tokenArc.setAttribute("stroke", color);
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
  tokenLabel.textContent = `${fmt(prompt)} / 1M`;
  tokenDisplay.title = `Context: ${prompt.toLocaleString("en")} tokens\nReply: ${reply.toLocaleString("en")} tokens\nLimit: 1,000,000 tokens`;
}

// --- Theme ---

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

// --- Model preset suggestions ---

const MODEL_PRESETS = {
  gemini:    ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"],
  openai:    ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "qwen3:8b", "qwen3:4b", "llama3.2:3b", "mistral:7b", "phi4:14b", "gemma3:4b"],
  anthropic: ["claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"],
};

function updateSuggestions(provider) {
  const presets = MODEL_PRESETS[provider] || [];
  modelSuggestions.innerHTML = presets
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
  if (!modelNameInput.value || MODEL_PRESETS[p]?.length) {
    modelNameInput.value = MODEL_PRESETS[p]?.[0] ?? "";
  }
});

// --- Detect Ollama models ---

detectOllamaBtn.addEventListener("click", async () => {
  detectOllamaBtn.textContent = "Detecting…";
  detectOllamaBtn.disabled = true;
  const baseUrl = baseUrlInput.value.trim() || "http://localhost:11434/v1";
  try {
    const res  = await fetch(`/config/ollama-models?base_url=${encodeURIComponent(baseUrl)}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    // Merge detected models into suggestions
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

// --- Settings modal ---

settingsBtn.addEventListener("click", async () => {
  const res  = await fetch("/config");
  const data = await res.json();

  // System prompt
  promptInput.value = data.system_prompt;

  // Model config
  const m = data.model || {};
  providerSelect.value  = m.provider  || "gemini";
  modelNameInput.value  = m.model     || "";
  apiKeyInput.value     = m.api_key   || "";
  baseUrlInput.value    = m.base_url  || "";

  updateSuggestions(providerSelect.value);
  updateBaseUrlVisibility(providerSelect.value);

  settingsModal.hidden = false;
});

settingsCancel.addEventListener("click", () => { settingsModal.hidden = true; });

settingsSave.addEventListener("click", async () => {
  settingsSave.disabled = true;

  // Save system prompt
  await fetch("/config", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ system_prompt: promptInput.value }),
  });

  // Save model config
  await fetch("/config/model", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      provider: providerSelect.value,
      model:    modelNameInput.value.trim(),
      api_key:  apiKeyInput.value.trim(),
      base_url: baseUrlInput.value.trim(),
    }),
  });

  settingsSave.disabled = false;
  settingsModal.hidden  = true;
});
