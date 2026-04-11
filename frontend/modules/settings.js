const tokenArc     = document.getElementById("token-arc");
const tokenLabel   = document.getElementById("token-label");
const tokenDisplay = document.getElementById("token-display");
const themeBtn     = document.getElementById("theme-btn");
const settingsBtn    = document.getElementById("settings-btn");
const settingsModal  = document.getElementById("settings-modal");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSave   = document.getElementById("settings-save");
const promptInput    = document.getElementById("system-prompt-input");

const TOKEN_LIMIT = 1_000_000;

// --- Token display ---

export function updateTokenDisplay({ prompt, reply }) {
  const pct = Math.min(prompt / TOKEN_LIMIT, 1);
  const arc = (pct * 100).toFixed(1);
  tokenArc.setAttribute("stroke-dasharray", `${arc} ${100 - arc}`);
  const color = pct > 0.85 ? "#e74c3c" : pct > 0.6 ? "#e67e22" : "#2f6df5";
  tokenArc.setAttribute("stroke", color);
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
  tokenLabel.textContent = `${fmt(prompt)} / 1M`;
  tokenDisplay.title = `Context: ${prompt.toLocaleString("de-DE")} tokens\nReply: ${reply.toLocaleString("de-DE")} tokens\nLimit: 1,000,000 tokens`;
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

// --- Settings modal ---

settingsBtn.addEventListener("click", async () => {
  const res = await fetch("/config");
  const data = await res.json();
  promptInput.value = data.system_prompt;
  settingsModal.hidden = false;
});

settingsCancel.addEventListener("click", () => { settingsModal.hidden = true; });

settingsSave.addEventListener("click", async () => {
  settingsSave.disabled = true;
  await fetch("/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system_prompt: promptInput.value }),
  });
  settingsSave.disabled = false;
  settingsModal.hidden = true;
});
