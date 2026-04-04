const chat = document.getElementById("chat");
const input = document.getElementById("user-input");
const btn = document.getElementById("send-btn");
const stopBtn = document.getElementById("stop-btn");

let abortController = null;

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

        eventType = "message";
        if (payload === "[DONE]") {
          bubble.innerHTML = marked.parse(bubble.textContent);
          stopped = true;
          break;
        }
        if (payload.startsWith?.("[ERROR]")) {
          bubble.textContent = payload.slice(7);
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

    if (!abortController.signal.aborted) {
      bubble.innerHTML = marked.parse(bubble.textContent);
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
