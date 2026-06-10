import { renderMessages, resetForNewSession, setHomeMode, setOnBeforeSend, showLoadingSkeleton } from './chat.js';

const sidebarToggle   = document.getElementById("sidebar-toggle");
const sidebar         = document.getElementById("sidebar");
const mainContent     = document.getElementById("main-content");
const newChatBtn      = document.getElementById("new-chat-btn");
const sessionList     = document.getElementById("session-list");
const input           = document.getElementById("user-input");
const sidebarUsername = document.getElementById("sidebar-username");

// --- Session context menu ---

const sessionMenu = document.createElement("div");
sessionMenu.id = "session-menu";
sessionMenu.hidden = true;
document.body.appendChild(sessionMenu);

function closeSessionMenu() {
  sessionMenu.hidden = true;
}

function openSessionMenu(sessionId, titleEl, anchorEl) {
  sessionMenu.innerHTML = "";

  const items = [
    { icon: "✎",  label: "Rename",  action: () => startRename(sessionId, titleEl) },
    { icon: "✕",  label: "Delete",  action: () => doDelete(sessionId), cls: "danger" },
    { icon: "⊟",  label: "Archive", action: null, cls: "muted" },
    { icon: "⊙",  label: "Pin",     action: null, cls: "muted" },
  ];

  for (const item of items) {
    const btn = document.createElement("button");
    btn.className = "session-menu-item" + (item.cls ? " " + item.cls : "");
    btn.innerHTML = `<span class="session-menu-icon">${item.icon}</span>${item.label}`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeSessionMenu();
      if (item.action) item.action();
    });
    sessionMenu.appendChild(btn);
  }

  sessionMenu.hidden = false;

  const rect = anchorEl.getBoundingClientRect();
  const menuWidth = 160;
  let left = rect.right - menuWidth;
  if (left < 4) left = 4;
  sessionMenu.style.left = left + "px";
  sessionMenu.style.top  = (rect.bottom + 4) + "px";
}

document.addEventListener("click", (e) => {
  if (!sessionMenu.contains(e.target)) closeSessionMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeSessionMenu();
});
sessionList.addEventListener("scroll", closeSessionMenu);

async function doDelete(sessionId) {
  if (!confirm("Do you want to delete this chat?")) return;
  await fetch(`/chats/${sessionId}`, { method: "DELETE" });
  currentSessionId = null;
  resetForNewSession();
  setHomeMode(true);
  history.pushState(null, "", "/");
  loadSessions();
}

function startRename(sessionId, titleEl) {
  const original = titleEl.textContent;
  const inp = document.createElement("input");
  inp.className = "session-rename-input";
  inp.value = original;
  titleEl.replaceWith(inp);
  inp.focus();
  inp.select();

  let done = false;

  async function save() {
    if (done) return;
    done = true;
    const newTitle = inp.value.trim();
    if (newTitle && newTitle !== original) {
      titleEl.textContent = newTitle;
      await fetch(`/chats/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
    }
    inp.replaceWith(titleEl);
  }

  function cancel() {
    if (done) return;
    done = true;
    inp.replaceWith(titleEl);
  }

  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); save(); }
    if (e.key === "Escape") { e.preventDefault(); cancel(); }
  });
  inp.addEventListener("blur", save);
}

let currentSessionId = null;

// --- Open / close ---

export function openSidebar() {
  sidebar.classList.add("open");
  sidebarToggle.classList.add("open");
  mainContent.classList.add("sidebar-open");
  localStorage.setItem("sidebar", "open");
  loadSessions();
}

export function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarToggle.classList.remove("open");
  mainContent.classList.remove("sidebar-open");
  localStorage.setItem("sidebar", "closed");
}

// Eagerly restore sidebar visibility on page load to avoid layout flash
if (localStorage.getItem("sidebar") === "open") {
  sidebar.classList.add("open");
  sidebarToggle.classList.add("open");
  mainContent.classList.add("sidebar-open");
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
  if (diffDays < 7)  return d.toLocaleDateString("en", { weekday: "short" });
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

async function loadAndRender(sessionId) {
  setHomeMode(false);
  resetForNewSession();
  showLoadingSkeleton();
  const res  = await fetch(`/chats/${sessionId}`);
  const data = await res.json();
  resetForNewSession();
  renderMessages(data.messages);
  history.pushState(null, '', `/c/${sessionId}`);
}

// --- Session list ---

export function renderSessionList(sessions, activeId) {
  sessionList.innerHTML = "";
  if (!sessions.length) {
    const empty = document.createElement("div");
    empty.className = "session-empty";
    empty.textContent = "No chats yet";
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

    const menuBtn = document.createElement("button");
    menuBtn.className = "session-menu-btn";
    menuBtn.textContent = "⋮";
    menuBtn.title = "Options";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openSessionMenu(s.id, titleEl, menuBtn);
    });

    item.appendChild(titleEl);
    item.appendChild(dateEl);
    item.appendChild(menuBtn);

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
  const res  = await fetch("/chats");
  const data = await res.json();
  renderSessionList(data.chats, currentSessionId);
}

export function updateSessionTitle(id, title) {
  const item = sessionList.querySelector(`[data-id="${id}"]`);
  if (!item) return;
  const titleEl = item.querySelector(".session-title");
  if (titleEl) titleEl.textContent = title;
}

// --- New chat ---

newChatBtn.addEventListener("click", () => {
  currentSessionId = null;
  resetForNewSession();
  setHomeMode(true);
  history.pushState(null, '', '/');
  input.focus();
});

// --- Logout ---

async function logout() {
  await fetch("/logout", { method: "POST" });
  window.location.href = "/login";
}

document.getElementById("header-logout-btn").addEventListener("click", logout);

// --- Before-send callback: create session lazily on first message ---

setOnBeforeSend(async () => {
  if (!currentSessionId) {
    const res  = await fetch("/chats", { method: "POST" });
    const data = await res.json();
    currentSessionId = data.id;
    setHomeMode(false);
    history.pushState(null, '', `/c/${data.id}`);
    loadSessions();
  }
  return currentSessionId;
});

// --- Init (page load) ---

export async function initSidebar() {
  const meRes  = await fetch("/me");
  const meData = await meRes.json();
  if (sidebarUsername) sidebarUsername.textContent = meData.username ?? "";

  setHomeMode(true);
  history.replaceState(null, '', '/');

  if (localStorage.getItem("sidebar") === "open") openSidebar();
}
