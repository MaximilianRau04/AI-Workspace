import { speak }              from './voice.js';
import { updateTokenDisplay } from './settings.js';


const chatEl         = document.getElementById("chat");
const homeHero       = document.getElementById("home-hero");
const input          = document.getElementById("user-input");
const btn            = document.getElementById("send-btn");
const stopBtn        = document.getElementById("stop-btn");
const attachmentBar  = document.getElementById("attachment-bar");
const attachmentName = document.getElementById("attachment-name");

let abortController  = null;
export let currentPairIndex = 0;

// Callback wired from main.js to avoid circular import with sidebar.js
let onTitleUpdate = () => {};
export function setOnTitleUpdate(fn) { onTitleUpdate = fn; }

// Called by sidebar.js when no session exists yet (home mode)
let onBeforeSend = null;
export function setOnBeforeSend(fn) { onBeforeSend = fn; }

export function setHomeMode(enabled) {
  document.body.classList.toggle("home", enabled);
  homeHero.hidden = !enabled;
}

// --- Edit state ---

let editingPairIndex = null;

export function cancelEditMode() {
  editingPairIndex = null;
  input.classList.remove("editing");
}

export function resetForNewSession() {
  chatEl.innerHTML = "";
  currentPairIndex = 0;
  cancelEditMode();
}

// --- Inline edit ---

function startInlineEdit(wrap, text, pairIndex) {
  const bubble  = wrap.querySelector(".bubble.user");
  const actions = wrap.querySelector(".msg-actions");

  const ta = document.createElement("textarea");
  ta.className = "inline-edit-ta";
  ta.value = text;

  const inlineActions = document.createElement("div");
  inlineActions.className = "inline-edit-actions";

  const saveBtn   = document.createElement("button");
  saveBtn.className   = "inline-edit-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className   = "inline-edit-cancel";
  cancelBtn.textContent = "Cancel";

  inlineActions.appendChild(cancelBtn);
  inlineActions.appendChild(saveBtn);

  saveBtn.addEventListener("click", () => {
    const newText = ta.value.trim();
    if (!newText) return;
    ta.remove();
    inlineActions.remove();
    editingPairIndex = pairIndex;
    input.value = newText;
    sendMessage();
  });

  cancelBtn.addEventListener("click", () => {
    ta.remove();
    inlineActions.remove();
    bubble.hidden = false;
    actions.hidden = false;
  });

  ta.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.preventDefault(); cancelBtn.click(); }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveBtn.click(); }
  });

  ta.addEventListener("input", () => {
    ta.style.height = "auto";
    ta.style.height = ta.scrollHeight + "px";
  });

  bubble.hidden = true;
  actions.hidden = true;
  wrap.insertBefore(ta, actions);
  wrap.insertBefore(inlineActions, actions);

  requestAnimationFrame(() => {
    ta.style.height = ta.scrollHeight + "px";
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
}

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

export function addUserWrap(text, pairIndex, attachedFile = null) {
  const wrap = document.createElement("div");
  wrap.className = "user-wrap";
  wrap.dataset.pairIndex = pairIndex;

  if (attachedFile) {
    const ext = attachedFile.includes('.') ? attachedFile.split('.').pop().toUpperCase() : 'FILE';
    const chip = document.createElement("div");
    chip.className = "msg-attachment";
    chip.innerHTML =
      `<div class="msg-attachment-icon"><svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/></svg></div>` +
      `<div class="msg-attachment-meta"><span class="msg-attachment-filename">${attachedFile}</span><span class="msg-attachment-type">${ext}</span></div>`;
    wrap.appendChild(chip);
  }

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
  editBtn.addEventListener("click", () => startInlineEdit(wrap, text, pairIndex));

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

  wrap.appendChild(bubble);
  chatEl.appendChild(wrap);
  chatEl.scrollTop = chatEl.scrollHeight;
  return wrap;
}

function addCodeCopyButtons(bubble) {
  bubble.querySelectorAll("pre").forEach(pre => {
    if (pre.parentElement.classList.contains("code-block-wrap")) return;

    // Syntax highlighting
    const codeEl = pre.querySelector("code");
    if (codeEl && typeof hljs !== "undefined") {
      hljs.highlightElement(codeEl);
    }

    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.title = "Copy";
    btn.textContent = "⧉";
    btn.addEventListener("click", () => flashCopy(btn, () => pre.innerText));
    wrap.appendChild(btn);
  });
}

export function setStreaming(active) {
  btn.hidden = active;
  stopBtn.hidden = !active;
}

export function showLoadingSkeleton() {
  chatEl.innerHTML = `
    <div class="chat-skeleton-wrap">
      <div class="skeleton-row user"><div class="skeleton-line"></div></div>
      <div class="skeleton-row bot"><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>
      <div class="skeleton-row user"><div class="skeleton-line short"></div></div>
      <div class="skeleton-row bot"><div class="skeleton-line"></div><div class="skeleton-line shorter"></div><div class="skeleton-line short"></div></div>
    </div>`;
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
      const plain = messages[i + 1].parts[0];
      b.dataset.plain = plain;
      try {
        b.innerHTML = marked.parse(plain);
        addCodeCopyButtons(b);
      } catch (e) {
        console.error("Render error:", e);
        b.textContent = plain;
      }

    }
  }
  chatEl.scrollTop = chatEl.scrollHeight;
}

// --- Streaming ---

export async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  const chatId = onBeforeSend ? await onBeforeSend() : null;

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
  if (pendingFile) attachmentBar.hidden = true;

  addUserWrap(text, pairIdx, pendingFile);
  input.value = "";
  input.style.height = "44px";

  const botWrap = addBotWrap(pairIdx);
  const bubble  = botWrap.querySelector(".bubble.bot");
  bubble.innerHTML = '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
  let streamStarted    = false;
  let thinkingEl       = null;
  let thinkingBody     = null;
  let thinkingStart    = 0;

  currentPairIndex = pairIdx + 1;
  abortController  = new AbortController();
  setStreaming(true);

  try {
    const body = { message: text, attached_file: pendingFile };
    if (isEdit) body.pair_index = pairIdx;

    const res = await fetch(`/chats/${chatId}/messages`, {
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
        if (eventType === "thinking") {
          if (!thinkingEl) {
            thinkingStart = Date.now();
            thinkingEl = document.createElement("details");
            thinkingEl.className = "thinking-block streaming";
            thinkingEl.open = true;
            const summary = document.createElement("summary");
            summary.className = "thinking-summary";
            summary.innerHTML = '<span class="thinking-dot"></span><span class="thinking-label">Thinking…</span>';
            thinkingBody = document.createElement("div");
            thinkingBody.className = "thinking-body";
            thinkingEl.appendChild(summary);
            thinkingEl.appendChild(thinkingBody);
            botWrap.insertBefore(thinkingEl, bubble);
          }
          thinkingBody.textContent += payload;
          chatEl.scrollTop = chatEl.scrollHeight;
          eventType = "message";
          continue;
        }

        eventType = "message";
        if (payload === "[DONE]") {
          if (thinkingEl) {
            thinkingEl.classList.remove("streaming");
            const elapsed = Math.round((Date.now() - thinkingStart) / 1000);
            const label = thinkingEl.querySelector(".thinking-label");
            if (label) label.textContent = elapsed > 0 ? `Thought for ${elapsed}s` : "Thought";
          }
          const plainText = bubble.textContent;
          bubble.dataset.plain = plainText;
          try {
            bubble.innerHTML = marked.parse(plainText);
            addCodeCopyButtons(bubble);
          } catch (e) {
            console.error("Render error:", e);
            bubble.textContent = plainText;
          }
          speak(plainText);
          stopped = true;
          break;
        }
        if (!streamStarted) { bubble.textContent = ""; streamStarted = true; }
        const charDelay = parseInt(localStorage.getItem("streamDelay") ?? "8");
        if (charDelay === 0) {
          bubble.textContent += payload;
          chatEl.scrollTop = chatEl.scrollHeight;
        } else {
          for (const char of payload) {
            if (abortController.signal.aborted) { stopped = true; break; }
            bubble.textContent += char;
            chatEl.scrollTop = chatEl.scrollHeight;
            await new Promise(r => setTimeout(r, charDelay));
          }
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
