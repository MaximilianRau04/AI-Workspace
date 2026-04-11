import { speak }              from './voice.js';
import { updateTokenDisplay } from './settings.js';


const chatEl         = document.getElementById("chat");
const input          = document.getElementById("user-input");
const btn            = document.getElementById("send-btn");
const stopBtn        = document.getElementById("stop-btn");
const editIndicator  = document.getElementById("edit-indicator");
const editCancelBtn  = document.getElementById("edit-cancel");
const attachmentBar  = document.getElementById("attachment-bar");
const attachmentName = document.getElementById("attachment-name");

let abortController  = null;
export let currentPairIndex = 0;

// Callback wired from main.js to avoid circular import with sidebar.js
let onTitleUpdate = () => {};
export function setOnTitleUpdate(fn) { onTitleUpdate = fn; }

// --- Edit state ---

let editingPairIndex = null;

export function startEdit(text, pairIndex) {
  editingPairIndex = pairIndex;
  input.value = text;
  input.style.height = "44px";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
  input.focus();
  input.classList.add("editing");
  editIndicator.hidden = false;
}

export function cancelEditMode() {
  editingPairIndex = null;
  input.classList.remove("editing");
  editIndicator.hidden = true;
}

export function resetForNewSession() {
  chatEl.innerHTML = "";
  currentPairIndex = 0;
  cancelEditMode();
}

editCancelBtn.addEventListener("click", () => {
  input.value = "";
  input.style.height = "44px";
  cancelEditMode();
});

// --- Utilities ---


export function showError({ title, detail, retry_after }) {
  const div = document.createElement("div");
  div.className = "bubble error";
  let html = `<strong>${title}</strong><br><span>${detail}</span>`;
  if (retry_after) html += `<br><small>Retry in ${retry_after}s</small>`;
  div.innerHTML = html;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

function makeActionBtn(icon, title) {
  const b = document.createElement("button");
  b.className = "msg-action-btn";
  b.title = title;
  b.textContent = icon;
  return b;
}

async function flashCopy(b, getText) {
  try {
    await navigator.clipboard.writeText(getText());
    const orig = b.textContent;
    b.textContent = "✓";
    setTimeout(() => { b.textContent = orig; }, 1500);
  } catch { /* silent */ }
}

// --- Bubble creation ---

export function addUserWrap(text, pairIndex) {
  const wrap = document.createElement("div");
  wrap.className = "user-wrap";
  wrap.dataset.pairIndex = pairIndex;

  const bubble = document.createElement("div");
  bubble.className = "bubble user";
  bubble.textContent = text;

  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const retryBtn = makeActionBtn("↻", "Try again");
  retryBtn.addEventListener("click", () => {
    editingPairIndex = pairIndex;
    input.value = text;
    sendMessage();
  });

  const copyBtn = makeActionBtn("⧉", "Copy");
  copyBtn.addEventListener("click", () => flashCopy(copyBtn, () => text));

  const editBtn = makeActionBtn("✏", "Edit");
  editBtn.addEventListener("click", () => startEdit(text, pairIndex));

  actions.appendChild(retryBtn);
  actions.appendChild(copyBtn);
  actions.appendChild(editBtn);

  wrap.appendChild(bubble);
  wrap.appendChild(actions);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return wrap;
}

export function addBotWrap(pairIndex) {
  const wrap = document.createElement("div");
  wrap.className = "bot-wrap";
  wrap.dataset.pairIndex = pairIndex;

  const bubble = document.createElement("div");
  bubble.className = "bubble bot";

  const actions = document.createElement("div");
  actions.className = "msg-actions";

  const copyBtn = makeActionBtn("⧉", "Copy");
  copyBtn.addEventListener("click", () =>
    flashCopy(copyBtn, () => bubble.dataset.plain || bubble.innerText)
  );
  actions.appendChild(copyBtn);

  wrap.appendChild(bubble);
  wrap.appendChild(actions);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return wrap;
}

export function setStreaming(active) {
  btn.hidden = active;
  stopBtn.hidden = !active;
}

// --- Rendering ---

export function renderMessages(messages) {
  currentPairIndex = 0;
  for (let i = 0; i < messages.length; i += 2) {
    const pairIdx = currentPairIndex++;
    addUserWrap(messages[i].parts[0], pairIdx);
    if (messages[i + 1]) {
      const bw = addBotWrap(pairIdx);
      const b  = bw.querySelector(".bubble.bot");
      b.dataset.plain = messages[i + 1].parts[0];
      b.innerHTML = marked.parse(messages[i + 1].parts[0]);

    }
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

// --- Streaming ---

export async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const isEdit  = editingPairIndex !== null;
  const pairIdx = isEdit ? editingPairIndex : currentPairIndex;

  cancelEditMode();

  if (isEdit) {
    chatEl.querySelectorAll("[data-pair-index]").forEach(el => {
      if (parseInt(el.dataset.pairIndex) >= pairIdx) el.remove();
    });
    currentPairIndex = pairIdx;
  }

  const pendingFile = attachmentBar.hidden ? null : attachmentName.textContent;
  if (pendingFile) {
    const chip = document.createElement("div");
    chip.className = "msg-attachment";
    chip.dataset.pairIndex = pairIdx;
    chip.textContent = pendingFile;
    chatEl.appendChild(chip);
    chatEl.scrollTop = chatEl.scrollHeight;
    attachmentBar.hidden = true;
  }

  addUserWrap(text, pairIdx);
  input.value = "";
  input.style.height = "44px";

  const botWrap = addBotWrap(pairIdx);
  const bubble  = botWrap.querySelector(".bubble.bot");

  currentPairIndex = pairIdx + 1;
  abortController  = new AbortController();
  setStreaming(true);

  try {
    const body = { message: text, attached_file: pendingFile };
    if (isEdit) body.pair_index = pairIdx;

    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: abortController.signal,
    });

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";
    let stopped   = false;
    let eventType = "message";

    while (!stopped) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith("event: ")) { eventType = line.slice(7).trim(); continue; }
        if (!line.startsWith("data: "))  continue;
        const payload = JSON.parse(line.slice(6));

        if (eventType === "usage") {
          updateTokenDisplay(payload);
          eventType = "message";
          continue;
        }
        if (eventType === "error") {
          botWrap.remove();
          showError(payload);
          stopped = true;
          eventType = "message";
          break;
        }
        if (eventType === "title") {
          onTitleUpdate(payload.id, payload.title);
          eventType = "message";
          continue;
        }

        eventType = "message";
        if (payload === "[DONE]") {
          const plainText = bubble.textContent;
          bubble.dataset.plain = plainText;
          try {
            bubble.innerHTML = marked.parse(plainText);
          } catch (e) {
            console.error("Render error:", e);
            bubble.textContent = plainText;
          }
          speak(plainText);
          stopped = true;
          break;
        }
        for (const char of payload) {
          if (abortController.signal.aborted) { stopped = true; break; }
          bubble.textContent += char;
          chatEl.scrollTop = chatEl.scrollHeight;
          await new Promise(r => setTimeout(r, 8));
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
stopBtn.addEventListener("click", () => { if (abortController) abortController.abort(); });

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

input.addEventListener("input", () => {
  input.style.height = "44px";
  const newHeight = Math.min(input.scrollHeight, 160);
  input.style.height = newHeight + "px";
  input.style.overflowY = newHeight >= 160 ? "auto" : "hidden";
});
