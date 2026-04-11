const chat = document.getElementById("chat");
const input = document.getElementById("user-input");
const btn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");

let abortController = null;

function showError({ title, detail, retry_after }) {
  const div = document.createElement("div");
  div.className = "bubble error";
  let html = `<strong>${title}</strong><br><span>${detail}</span>`;
  if (retry_after) html += `<br><small>Retry in ${retry_after}s</small>`;
  div.innerHTML = html;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addBubble(text, role) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

function setStreaming(active) {
  btn.hidden = active;
  stopBtn.hidden = !active;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  // show attachment chip above the message if a file was attached
  const pendingFile = attachmentBar.hidden ? null : attachmentName.textContent;
  if (pendingFile) {
    const chip = document.createElement("div");
    chip.className = "msg-attachment";
    chip.textContent = pendingFile;
    chat.appendChild(chip);
    chat.scrollTop = chat.scrollHeight;
    attachmentBar.hidden = true;
  }

  addBubble(text, "user");
  input.value = "";
  input.style.height = "44px";

  const bubble = addBubble("", "bot");

  abortController = new AbortController();
  setStreaming(true);

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, attached_file: pendingFile }),
      signal: abortController.signal,
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let stopped = false;
    let eventType = "message";

    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }

        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (eventType === "usage") {
          updateTokenDisplay(payload);
          eventType = "message";
          continue;
        }

        if (eventType === "error") {
          bubble.remove();
          showError(payload);
          stopped = true;
          eventType = "message";
          break;
        }

        if (eventType === "title") {
          updateSessionTitle(payload.id, payload.title);
          eventType = "message";
          continue;
        }

        eventType = "message";
        if (payload === "[DONE]") {
          const plainText = bubble.textContent;
          bubble.innerHTML = marked.parse(plainText);
          speak(plainText);
          stopped = true;
          break;
        }
        for (const char of payload) {
          if (abortController.signal.aborted) { stopped = true; break; }
          bubble.textContent += char;
          chat.scrollTop = chat.scrollHeight;
          await new Promise(r => setTimeout(r, 10));
        }
      }
    }
  } catch (e) {
    if (e.name !== "AbortError") bubble.textContent = "Connection error.";
  }

  setStreaming(false);
  abortController = null;
  input.focus();
}

btn.addEventListener("click", sendMessage);

stopBtn.addEventListener("click", () => {
  if (abortController) abortController.abort();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("input", () => {
  input.style.height = "44px";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});

// --- Sidebar ---

const sidebarToggle  = document.getElementById("sidebar-toggle");
const sidebar        = document.getElementById("sidebar");
const newChatBtn     = document.getElementById("new-chat-btn");
const sessionList    = document.getElementById("session-list");

let currentSessionId = null;

function openSidebar() {
  sidebar.classList.add("open");
  sidebarToggle.classList.add("open");
  loadSessions();
}

function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarToggle.classList.remove("open");
}

sidebarToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});


function formatDate(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr + "Z");
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) return d.toLocaleDateString("de-DE", { weekday: "short" });
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

function renderSessionList(sessions, activeId) {
  sessionList.innerHTML = "";
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = "Noch keine Chats";
    sessionList.appendChild(empty);
    return;
  }
  for (const s of sessions) {
    const item = document.createElement("div");
    item.className = "session-item" + (s.id === activeId ? " active" : "");
    item.dataset.id = s.id;

    const titleEl = document.createElement("span");
    titleEl.className = "session-title";
    titleEl.textContent = s.title || "New Chat";

    const dateEl = document.createElement("span");
    dateEl.className = "session-date";
    dateEl.textContent = formatDate(s.updated_at);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "session-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.title = "Löschen";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Diesen Chat löschen?")) return;
      const res = await fetch(`/sessions/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      currentSessionId = data.current_id;
      if (data.current_id !== s.id) {
        await renderCurrentSession(data.current_id);
      }
      loadSessions();
    });

    item.appendChild(titleEl);
    item.appendChild(dateEl);
    item.appendChild(deleteBtn);

    item.addEventListener("click", async () => {
      if (s.id === currentSessionId) return;
      await switchSession(s.id);
    });

    sessionList.appendChild(item);
  }
}

async function loadSessions() {
  const res = await fetch("/sessions");
  const data = await res.json();
  currentSessionId = data.current_id;
  renderSessionList(data.sessions, data.current_id);
}

async function switchSession(sessionId) {
  const res = await fetch(`/sessions/${sessionId}`);
  const data = await res.json();
  currentSessionId = data.id;
  chat.innerHTML = "";
  renderMessages(data.messages);
}

async function renderCurrentSession(sessionId) {
  const res = await fetch(`/sessions/${sessionId}`);
  const data = await res.json();
  chat.innerHTML = "";
  renderMessages(data.messages);
}

function renderMessages(messages) {
  for (const m of messages) {
    if (m.role === "user") {
      addBubble(m.parts[0], "user");
    } else if (m.role === "model") {
      const bubble = document.createElement("div");
      bubble.className = "bubble bot";
      bubble.innerHTML = marked.parse(m.parts[0]);
      chat.appendChild(bubble);
    }
  }
  chat.scrollTop = chat.scrollHeight;
}

function updateSessionTitle(id, title) {
  const item = sessionList.querySelector(`[data-id="${id}"]`);
  if (item) {
    const titleEl = item.querySelector(".session-title");
    if (titleEl) titleEl.textContent = title;
  }
}

newChatBtn.addEventListener("click", async () => {
  const res = await fetch("/sessions/new", { method: "POST" });
  const data = await res.json();
  currentSessionId = data.id;
  chat.innerHTML = "";
  renderSessionList(await fetch("/sessions").then(r => r.json()).then(d => d.sessions), currentSessionId);
  input.focus();
});

// On page load: show current session messages
(async () => {
  const res = await fetch("/sessions");
  const data = await res.json();
  currentSessionId = data.current_id;
  if (currentSessionId) {
    const sessRes = await fetch(`/sessions/${currentSessionId}`);
    const sess = await sessRes.json();
    renderMessages(sess.messages);
  }
})();

// --- Voice input (STT) ---
const micBtn = document.getElementById("mic-btn");
let recognition = null;
let isRecording = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function beep(frequency, duration, type = "sine", volume = 0.3) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gain.gain.setValueAtTime(volume, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + duration);
}

function playStartSound() {
  beep(440, 0.08);
  setTimeout(() => beep(660, 0.12), 80);
}

function playStopSound() {
  beep(660, 0.08);
  setTimeout(() => beep(440, 0.12), 80);
}

let mediaRecorder = null;
let audioChunks = [];

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
      return;
  }
  audioChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    const form = new FormData();
    form.append("audio", blob, "audio.webm");
    try {
      const res  = await fetch("/stt", { method: "POST", body: form });
      const data = await res.json();
      if (data.text) {
        input.value = data.text;
        input.style.height = "44px";
        input.style.height = Math.min(input.scrollHeight, 160) + "px";
        input.focus();
      }
    } catch { /* silent */ }
    isRecording = false;
    micBtn.classList.remove("recording");
    micBtn.title = "Click to speak";
  };
  playStartSound();
  mediaRecorder.start();
  isRecording = true;
  micBtn.classList.add("recording");
  micBtn.title = "Click to stop";
}

micBtn.addEventListener("click", () => {
  if (isRecording && mediaRecorder) {
    playStopSound();
    mediaRecorder.stop();
  } else {
    startRecording();
  }
});

// --- Voice output (TTS) ---
const ttsBtn = document.getElementById("tts-btn");
let ttsEnabled = false;

let currentAudio = null;

ttsBtn.addEventListener("click", () => {
  ttsEnabled = !ttsEnabled;
  ttsBtn.textContent = ttsEnabled ? "🔊" : "🔇";
  ttsBtn.classList.toggle("active", ttsEnabled);
  if (!ttsEnabled && currentAudio) { currentAudio.pause(); currentAudio = null; }
});

async function speak(text) {
  if (!ttsEnabled) return;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  try {
    const res = await fetch("/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    currentAudio = new Audio(url);
    currentAudio.play();
    currentAudio.onended = () => { URL.revokeObjectURL(url); currentAudio = null; };
  } catch { /* silent */ }
}

// --- Drag & drop ---
const dropOverlay = document.getElementById("drop-overlay");
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  dragCounter++;
  dropOverlay.hidden = false;
});

document.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.hidden = true; }
});

document.addEventListener("dragover", (e) => e.preventDefault());

document.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.hidden = true;

  const file = e.dataTransfer.files[0];
  if (!file) return;

  const allowed = [".txt", ".md", ".pdf"];
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!allowed.includes(ext)) {
    uploadStatus.textContent = `Unsupported type. Allowed: ${allowed.join(", ")}`;
    setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
    return;
  }

  attachmentName.textContent = file.name;
  attachmentBar.hidden = false;
  uploadStatus.textContent = "Indexing…";

  const form = new FormData();
  form.append("file", file);
  const res  = await fetch("/docs/upload", { method: "POST", body: form });
  const data = await res.json();

  if (data.error) {
    uploadStatus.textContent = `Error: ${data.error}`;
    attachmentBar.hidden = true;
  } else {
    uploadStatus.textContent = `✓ ${data.chunks} chunks indexed`;
    loadDocs();
  }
  setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
});

// --- Docs modal ---
const docsModal  = document.getElementById("docs-modal");
const docsClose  = document.getElementById("docs-close");
const docsList   = document.getElementById("docs-list");
const uploadBtn       = document.getElementById("upload-btn");
const uploadInput     = document.getElementById("upload-input");
const uploadStatus    = document.getElementById("upload-status");
const attachmentBar   = document.getElementById("attachment-bar");
const attachmentName  = document.getElementById("attachment-name");
const attachmentRemove = document.getElementById("attachment-remove");

async function loadDocs() {
  const res  = await fetch("/docs");
  const data = await res.json();
  docsList.innerHTML = "";
  if (!data.files.length) {
    docsList.innerHTML = "<li class='empty'>No documents indexed yet.</li>";
    return;
  }
  for (const file of data.files) {
    const li  = document.createElement("li");
    li.textContent = file;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.addEventListener("click", async () => {
      await fetch("/docs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      loadDocs();
    });
    li.appendChild(btn);
    docsList.appendChild(li);
  }
}

uploadBtn.addEventListener("click", () => uploadInput.click());

docsClose.addEventListener("click", () => { docsModal.hidden = true; });

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files[0];
  if (!file) return;

  attachmentName.textContent = file.name;
  attachmentBar.hidden = false;

  uploadStatus.textContent = "Indexing…";
  const form = new FormData();
  form.append("file", file);
  const res  = await fetch("/docs/upload", { method: "POST", body: form });
  const data = await res.json();
  uploadInput.value = "";

  if (data.error) {
    uploadStatus.textContent = `Error: ${data.error}`;
    attachmentBar.hidden = true;
  } else {
    uploadStatus.textContent = `✓ ${data.chunks} chunks indexed`;
    loadDocs();
  }
  setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
});

attachmentRemove.addEventListener("click", async () => {
  const name = attachmentName.textContent;
  attachmentBar.hidden = true;
  await fetch("/docs/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: name }),
  });
  loadDocs();
});

// --- Settings modal ---
const tokenArc   = document.getElementById("token-arc");
const tokenLabel = document.getElementById("token-label");
const tokenDisplay = document.getElementById("token-display");
const TOKEN_LIMIT = 1_000_000;

function updateTokenDisplay({ prompt, reply }) {
  const pct = Math.min(prompt / TOKEN_LIMIT, 1);
  const arc = (pct * 100).toFixed(1);
  tokenArc.setAttribute("stroke-dasharray", `${arc} ${100 - arc}`);

  const color = pct > 0.85 ? "#e74c3c" : pct > 0.6 ? "#e67e22" : "#2f6df5";
  tokenArc.setAttribute("stroke", color);

  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1) + "k" : n;
  tokenLabel.textContent = `${fmt(prompt)} / 1M`;
  tokenDisplay.title = `Context: ${prompt.toLocaleString("de-DE")} tokens\nReply: ${reply.toLocaleString("de-DE")} tokens\nLimit: 1,000,000 tokens`;
}

const settingsBtn    = document.getElementById("settings-btn");
const settingsModal  = document.getElementById("settings-modal");
const settingsCancel = document.getElementById("settings-cancel");
const settingsSave   = document.getElementById("settings-save");
const promptInput    = document.getElementById("system-prompt-input");

settingsBtn.addEventListener("click", async () => {
  const res = await fetch("/config");
  const data = await res.json();
  promptInput.value = data.system_prompt;
  settingsModal.hidden = false;
});

settingsCancel.addEventListener("click", () => {
  settingsModal.hidden = true;
});

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
