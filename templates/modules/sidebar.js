import { renderMessages, resetForNewSession } from './chat.js';

const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebar       = document.getElementById("sidebar");
const newChatBtn    = document.getElementById("new-chat-btn");
const sessionList   = document.getElementById("session-list");
const input         = document.getElementById("user-input");

let currentSessionId = null;

// --- Open / close ---

export function openSidebar() {
  sidebar.classList.add("open");
  sidebarToggle.classList.add("open");
  loadSessions();
}

export function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarToggle.classList.remove("open");
}

sidebarToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  sidebar.classList.contains("open") ? closeSidebar() : openSidebar();
});

// --- Helpers ---

function formatDate(isoStr) {
  if (!isoStr) return "";
  const d        = new Date(isoStr + "Z");
  const diffDays = Math.floor((Date.now() - d) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7)  return d.toLocaleDateString("de-DE", { weekday: "short" });
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}

async function loadAndRender(sessionId) {
  const res  = await fetch(`/sessions/${sessionId}`);
  const data = await res.json();
  resetForNewSession();
  renderMessages(data.messages);
}

// --- Session list ---

export function renderSessionList(sessions, activeId) {
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
    deleteBtn.textContent = "🗑";
    deleteBtn.title = "Delete";
    deleteBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("Do you want to delete this chat?")) return;
      const res  = await fetch(`/sessions/${s.id}`, { method: "DELETE" });
      const data = await res.json();
      currentSessionId = data.current_id;
      await loadAndRender(data.current_id);
      loadSessions();
    });

    item.appendChild(titleEl);
    item.appendChild(dateEl);
    item.appendChild(deleteBtn);

    item.addEventListener("click", async () => {
      if (s.id === currentSessionId) return;
      currentSessionId = s.id;
      await loadAndRender(s.id);
      loadSessions();
    });

    sessionList.appendChild(item);
  }
}

export async function loadSessions() {
  const res  = await fetch("/sessions");
  const data = await res.json();
  currentSessionId = data.current_id;
  renderSessionList(data.sessions, data.current_id);
}

export function updateSessionTitle(id, title) {
  const item = sessionList.querySelector(`[data-id="${id}"]`);
  if (!item) return;
  const titleEl = item.querySelector(".session-title");
  if (titleEl) titleEl.textContent = title;
}

// --- New chat ---

newChatBtn.addEventListener("click", async () => {
  const res  = await fetch("/sessions/new", { method: "POST" });
  const data = await res.json();
  currentSessionId = data.id;
  resetForNewSession();
  loadSessions();
  input.focus();
});

// --- Init (page load) ---

export async function initSidebar() {
  const res  = await fetch("/sessions");
  const data = await res.json();
  currentSessionId = data.current_id;
  if (currentSessionId) {
    const sessRes  = await fetch(`/sessions/${currentSessionId}`);
    const sessData = await sessRes.json();
    renderMessages(sessData.messages);
  }
}
