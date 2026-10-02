/**
 * Clanker Frontend Application
 * Single-file vanilla JS — no framework required.
 */

"use strict";

// ─── API Helper ──────────────────────────────────────────────────────────────

const API = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail || r.statusText);
    return r.json();
  },
  async post(path, body) {
    const r = await fetch(path, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail || r.statusText);
    return r.json();
  },
  async patch(path, body) {
    const r = await fetch(path, {
      method: "PATCH",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail || r.statusText);
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, {method: "DELETE"});
    if (!r.ok) throw new Error((await r.json().catch(() => ({detail: r.statusText}))).detail || r.statusText);
    return r.json();
  },
};

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
  currentPage: "dashboard",
  currentConversationId: null,
  conversations: [],
  isGenerating: false,
  activeModel: "",
  taskFilter: "all",
};

// ─── Toast Notifications ──────────────────────────────────────────────────────

function toast(message, type = "info", duration = 3000) {
  const icons = {success: "✅", error: "❌", info: "ℹ️"};
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || "ℹ️"}</span><span>${message}</span>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── Page Navigation ─────────────────────────────────────────────────────────

function showPage(name) {
  // Hide all pages
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  document.getElementById(`page-${name}`).classList.add("active");
  document.getElementById(`nav-${name}`)?.classList.add("active");

  const titles = {
    dashboard: "Dashboard",
    chat: state.currentConversationId ? getConvTitle() : "Chat",
    tasks: "Tasks",
    memory: "Memory",
    settings: "Settings",
  };
  document.getElementById("topbar-title").textContent = titles[name] || name;

  // Show/hide chat-specific actions
  document.getElementById("chat-actions").classList.toggle("hidden", name !== "chat");

  state.currentPage = name;

  // Load page data
  if (name === "dashboard") loadDashboard();
  if (name === "tasks") loadTasks();
  if (name === "memory") loadMemories();
  if (name === "settings") loadSettings();
}

function getConvTitle() {
  const c = state.conversations.find(x => x.id === state.currentConversationId);
  return c ? c.title : "Chat";
}

// ─── Ollama Status ────────────────────────────────────────────────────────────

async function checkOllamaStatus() {
  const pill = document.getElementById("ollama-status");
  const text = document.getElementById("ollama-status-text");
  try {
    const data = await API.get("/api/ollama/health");
    if (data.status === "ok") {
      pill.className = "status-pill connected";
      text.textContent = "Ollama connected";
      await loadModels();
    } else {
      pill.className = "status-pill error";
      text.textContent = "Ollama offline";
    }
  } catch {
    pill.className = "status-pill error";
    text.textContent = "Ollama offline";
  }
}

async function loadModels() {
  try {
    const data = await API.get("/api/ollama/models");
    const sel = document.getElementById("model-selector");
    sel.innerHTML = "";
    if (!data.models || data.models.length === 0) {
      sel.innerHTML = '<option value="">No models found</option>';
      return;
    }
    data.models.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = m.name;
      if (m.name === data.current) opt.selected = true;
      sel.appendChild(opt);
    });
    state.activeModel = data.current || data.models[0].name;
  } catch (e) {
    console.warn("Could not load models:", e);
  }
}

async function selectModel(model) {
  try {
    await API.post("/api/ollama/model", {model});
    state.activeModel = model;
    toast(`Model switched to ${model}`, "success");
  } catch (e) {
    toast(`Failed to switch model: ${e.message}`, "error");
  }
}

// ─── Conversations ────────────────────────────────────────────────────────────

async function loadConversations() {
  try {
    state.conversations = await API.get("/api/chat/conversations");
    renderConversationList();
  } catch (e) {
    console.error("Failed to load conversations:", e);
  }
}

function renderConversationList() {
  const list = document.getElementById("conversation-list");
  if (!state.conversations.length) {
    list.innerHTML = '<div class="empty-state" style="padding:12px 8px;font-size:12px">No conversations yet</div>';
    return;
  }
  list.innerHTML = state.conversations.map(c => `
    <div class="conv-item ${c.id === state.currentConversationId ? 'active' : ''}"
         id="conv-item-${c.id}"
         onclick="openConversation(${c.id})">
      <div class="conv-item-title" title="${escHtml(c.title)}">${escHtml(c.title)}</div>
      <div class="conv-item-actions">
        <button class="conv-action-btn" title="Rename" onclick="event.stopPropagation();renameConversationById(${c.id}, '${escHtml(c.title)}')">✏️</button>
        <button class="conv-action-btn" title="Delete" onclick="event.stopPropagation();deleteConversation(${c.id})">🗑</button>
      </div>
    </div>
  `).join("");
}

async function newConversation() {
  try {
    const conv = await API.post("/api/chat/conversations", {title: "New Conversation"});
    state.conversations.unshift(conv);
    renderConversationList();
    await openConversation(conv.id);
    showPage("chat");
  } catch (e) {
    toast(`Failed to create conversation: ${e.message}`, "error");
  }
}

async function openConversation(id) {
  try {
    const conv = await API.get(`/api/chat/conversations/${id}`);
    state.currentConversationId = id;
    renderConversationList();
    renderMessages(conv.messages);
    document.getElementById("topbar-title").textContent = conv.title;
    showPage("chat");
  } catch (e) {
    toast(`Could not open conversation: ${e.message}`, "error");
  }
}

function renderMessages(messages) {
  const container = document.getElementById("messages-container");
  const welcome = document.getElementById("welcome-screen");

  if (!messages || messages.length === 0) {
    container.innerHTML = "";
    container.appendChild(welcome);
    welcome.style.display = "flex";
    return;
  }

  welcome.style.display = "none";
  // Remove welcome, keep it in DOM
  if (welcome.parentNode) welcome.parentNode.removeChild(welcome);

  container.innerHTML = messages.map(m => renderMessage(m)).join("");
  scrollToBottom();
}

function renderMessage(msg) {
  const isUser = msg.role === "user";
  const avatar = isUser ? "👤" : "⚡";
  const role = isUser ? "You" : "Clanker";
  const time = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"}) : "";
  const content = isUser ? escHtml(msg.content).replace(/\n/g, "<br>") : renderMarkdown(msg.content);

  return `
    <div class="message ${msg.role}" id="msg-${msg.id || Date.now()}">
      <div class="message-header">
        <div class="message-avatar">${avatar}</div>
        <div class="message-role">${role}</div>
        <div class="message-time">${time}</div>
      </div>
      <div class="message-bubble">${content}</div>
      ${!isUser ? `
      <div class="message-actions">
        <button class="icon-btn" style="font-size:12px;padding:4px 8px" onclick="copyText(this, \`${escJs(msg.content)}\`)">📋 Copy</button>
      </div>` : ""}
    </div>
  `;
}

function renderMarkdown(text) {
  try {
    // Pre-process code blocks to add copy button headers
    let processed = text;
    const html = marked.parse(processed, {breaks: true, gfm: true});
    // Post-process: wrap pre>code with copy button
    return html.replace(
      /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => {
        const langLabel = lang || "code";
        const rawCode = code.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        return `<pre>
          <div class="code-block-header">
            <span class="code-lang">${langLabel}</span>
            <button class="copy-code-btn" onclick="copyCode(this, \`${escJs(rawCode)}\`)">Copy</button>
          </div>
          <code class="language-${langLabel}">${code}</code>
        </pre>`;
      }
    );
  } catch {
    return escHtml(text).replace(/\n/g, "<br>");
  }
}

async function clearConversation() {
  if (!state.currentConversationId) return;
  if (!confirm("Clear all messages in this conversation?")) return;
  try {
    await API.del(`/api/chat/conversations/${state.currentConversationId}/messages`);
    renderMessages([]);
    toast("Conversation cleared", "success");
  } catch (e) {
    toast(`Failed to clear: ${e.message}`, "error");
  }
}

async function deleteConversation(id) {
  if (!confirm("Delete this conversation?")) return;
  try {
    await API.del(`/api/chat/conversations/${id}`);
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentConversationId === id) {
      state.currentConversationId = null;
      renderMessages([]);
    }
    renderConversationList();
    toast("Conversation deleted", "success");
  } catch (e) {
    toast(`Failed to delete: ${e.message}`, "error");
  }
}

function renameConversation() {
  if (!state.currentConversationId) return;
  const c = state.conversations.find(x => x.id === state.currentConversationId);
  renameConversationById(state.currentConversationId, c?.title || "");
}

function renameConversationById(id, currentTitle) {
  document.getElementById("rename-conv-input").value = currentTitle;
  document.getElementById("modal-rename-conv").dataset.convId = id;
  openModal("modal-rename-conv");
  setTimeout(() => document.getElementById("rename-conv-input").select(), 50);
}

async function confirmRenameConversation() {
  const id = parseInt(document.getElementById("modal-rename-conv").dataset.convId);
  const title = document.getElementById("rename-conv-input").value.trim();
  if (!title) return;
  try {
    await API.patch(`/api/chat/conversations/${id}/rename`, {title});
    const c = state.conversations.find(x => x.id === id);
    if (c) c.title = title;
    renderConversationList();
    if (id === state.currentConversationId) {
      document.getElementById("topbar-title").textContent = title;
    }
    closeModal("modal-rename-conv");
    toast("Renamed", "success");
  } catch (e) {
    toast(`Failed to rename: ${e.message}`, "error");
  }
}

// ─── Chat / Messaging ─────────────────────────────────────────────────────────

async function sendMessage() {
  if (state.isGenerating) {
    // Stop requested — can't actually abort SSE from client easily, just mark stopped
    state.isGenerating = false;
    setSendButtonState("idle");
    return;
  }

  const input = document.getElementById("chat-input");
  const text = input.value.trim();
  if (!text) return;

  // Ensure conversation exists
  if (!state.currentConversationId) {
    await newConversation();
  }

  // Show user message
  appendMessage({role: "user", content: text, created_at: new Date().toISOString()});
  input.value = "";
  input.style.height = "auto";
  scrollToBottom();

  // Show typing indicator
  const typingId = showTypingIndicator();
  setSendButtonState("stop");
  state.isGenerating = true;

  // Create placeholder for assistant response
  const assistantMsgId = `streaming-${Date.now()}`;
  const placeholder = document.createElement("div");
  placeholder.className = "message assistant";
  placeholder.id = assistantMsgId;
  placeholder.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">⚡</div>
      <div class="message-role">Clanker</div>
    </div>
    <div class="message-bubble" id="${assistantMsgId}-content"></div>
  `;
  removeTypingIndicator(typingId);
  document.getElementById("messages-container").appendChild(placeholder);
  scrollToBottom();

  let fullText = "";
  const contentEl = document.getElementById(`${assistantMsgId}-content`);

  try {
    const model = document.getElementById("model-selector").value || state.activeModel;
    const response = await fetch(`/api/chat/conversations/${state.currentConversationId}/send`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: text, model}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({detail: "Unknown error"}));
      throw new Error(err.detail || "Stream error");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      if (!state.isGenerating) break;
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split("\n");
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") { state.isGenerating = false; break; }
        if (data.startsWith("[ERROR]")) {
          toast(data.slice(7).trim(), "error");
          state.isGenerating = false;
          break;
        }
        // Unescape newlines that were escaped for SSE
        fullText += data.replace(/\\n/g, "\n");
        contentEl.innerHTML = renderMarkdown(fullText);
        scrollToBottom();
      }
    }
    reader.cancel();
  } catch (e) {
    toast(`Error: ${e.message}`, "error");
    fullText = `⚠️ ${e.message}`;
    if (contentEl) contentEl.innerHTML = escHtml(fullText);
  }

  state.isGenerating = false;
  setSendButtonState("idle");

  // Finalize message
  placeholder.innerHTML = renderMessage({
    role: "assistant",
    content: fullText,
    created_at: new Date().toISOString(),
  }).replace(/<div class="message assistant"[^>]*>/, "").replace(/<\/div>\s*$/, "");
  placeholder.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">⚡</div>
      <div class="message-role">Clanker</div>
      <div class="message-time">${new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</div>
    </div>
    <div class="message-bubble">${renderMarkdown(fullText)}</div>
    <div class="message-actions">
      <button class="icon-btn" style="font-size:12px;padding:4px 8px" onclick="copyText(this, \`${escJs(fullText)}\`)">📋 Copy</button>
    </div>
  `;

  scrollToBottom();

  // Refresh conversations to update title if it changed
  await loadConversations();
}

function appendMessage(msg) {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";
  const container = document.getElementById("messages-container");
  const div = document.createElement("div");
  div.innerHTML = renderMessage(msg);
  container.appendChild(div.firstElementChild);
}

function showTypingIndicator() {
  const id = `typing-${Date.now()}`;
  const container = document.getElementById("messages-container");
  const el = document.createElement("div");
  el.id = id;
  el.className = "message assistant";
  el.innerHTML = `
    <div class="message-header">
      <div class="message-avatar">⚡</div>
      <div class="message-role">Clanker</div>
    </div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function setSendButtonState(st) {
  const btn = document.getElementById("send-btn");
  if (st === "stop") {
    btn.textContent = "⏹";
    btn.classList.add("stop");
    btn.title = "Stop generation";
  } else {
    btn.textContent = "➤";
    btn.classList.remove("stop");
    btn.title = "Send";
  }
}

function handleInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

function scrollToBottom() {
  const c = document.getElementById("messages-container");
  c.scrollTop = c.scrollHeight;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const data = await API.get("/api/dashboard");

    document.getElementById("greeting-text").textContent = data.greeting;
    document.getElementById("greeting-date").textContent = data.datetime;

    // Today tasks
    const todayList = document.getElementById("today-task-list");
    document.getElementById("today-count").textContent = data.stats.total_today_tasks;
    if (data.today_tasks.length === 0) {
      todayList.innerHTML = '<div class="empty-state">No tasks due today</div>';
    } else {
      todayList.innerHTML = data.today_tasks.map(t => `
        <div class="task-item" onclick="showPage('tasks')">
          <div class="task-checkbox ${t.status === 'done' ? 'done' : ''}" onclick="event.stopPropagation();quickCompleteTask(${t.id})"></div>
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="task-priority priority-${t.priority}">${t.priority}</div>
        </div>
      `).join("");
    }

    // Overdue tasks
    const overdueList = document.getElementById("overdue-task-list");
    document.getElementById("overdue-count").textContent = data.stats.total_overdue;
    if (data.overdue_tasks.length === 0) {
      overdueList.innerHTML = '<div class="empty-state">No overdue tasks 🎉</div>';
    } else {
      overdueList.innerHTML = data.overdue_tasks.map(t => `
        <div class="task-item" onclick="showPage('tasks')">
          <div class="task-checkbox" onclick="event.stopPropagation();quickCompleteTask(${t.id})"></div>
          <div class="task-title" style="color:var(--red)">${escHtml(t.title)}</div>
          ${t.due_date ? `<div class="task-priority priority-high">overdue</div>` : ""}
        </div>
      `).join("");
    }

    // Projects
    const projEl = document.getElementById("dashboard-projects");
    document.getElementById("projects-count").textContent = data.stats.active_projects;
    if (data.active_projects.length === 0) {
      projEl.innerHTML = '<div class="empty-state">No active projects</div>';
    } else {
      projEl.innerHTML = data.active_projects.map(p => `
        <div class="project-item" onclick="showPage('settings')">
          <div class="project-dot"></div>
          <div>
            <div class="project-name">${escHtml(p.name)}</div>
            ${p.description ? `<div class="project-desc">${escHtml(p.description)}</div>` : ""}
          </div>
        </div>
      `).join("");
    }

    // Recent conversations
    const recentEl = document.getElementById("recent-conversations-list");
    if (data.recent_conversations.length === 0) {
      recentEl.innerHTML = '<div class="empty-state">No conversations yet — start chatting!</div>';
    } else {
      recentEl.innerHTML = data.recent_conversations.map(c => `
        <div class="conv-item" style="margin-bottom:2px" onclick="openConversation(${c.id})">
          <span style="font-size:14px">💬</span>
          <div class="conv-item-title">${escHtml(c.title)}</div>
          <div class="message-time">${new Date(c.updated_at).toLocaleDateString()}</div>
        </div>
      `).join("");
    }
  } catch (e) {
    console.error("Dashboard load failed:", e);
  }
}

async function quickCompleteTask(id) {
  try {
    await API.post(`/api/tasks/${id}/complete`, {});
    toast("Task completed ✅", "success");
    loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

async function loadTasks() {
  let url = `/api/tasks?`;
  const f = state.taskFilter;
  if (f === "today") url = "/api/tasks?scope=today";
  else if (f === "overdue") url = "/api/tasks?scope=overdue";
  else if (f === "done") url = "/api/tasks?status=done";
  else if (f === "pending") url = "/api/tasks?status=pending";
  else url = "/api/tasks?status=all";

  try {
    const tasks = await API.get(url);
    const container = document.getElementById("task-list-container");
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state" style="padding:40px">No tasks found</div>';
      return;
    }
    container.innerHTML = tasks.map(t => `
      <div class="task-item" id="task-row-${t.id}">
        <div class="task-checkbox ${t.status === 'done' ? 'done' : ''}"
             onclick="completeTaskRow(${t.id})"
             title="Mark complete"></div>
        <div style="flex:1;min-width:0">
          <div class="task-title" style="${t.status === 'done' ? 'text-decoration:line-through;opacity:0.5' : ''}">${escHtml(t.title)}</div>
          ${t.description ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${escHtml(t.description)}</div>` : ""}
          <div style="font-size:10px;color:var(--text-muted);margin-top:3px;display:flex;gap:8px">
            ${t.due_date ? `<span>📅 ${new Date(t.due_date).toLocaleDateString()}</span>` : ""}
          </div>
        </div>
        <div class="task-priority priority-${t.priority}">${t.priority}</div>
        <button class="icon-btn danger" title="Delete" onclick="deleteTaskRow(${t.id})">🗑</button>
      </div>
    `).join("");
  } catch (e) {
    toast(`Failed to load tasks: ${e.message}`, "error");
  }
}

function filterTasks(filter) {
  state.taskFilter = filter;
  document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
  document.getElementById(`filter-${filter}`)?.classList.add("active");
  loadTasks();
}

async function completeTaskRow(id) {
  try {
    await API.post(`/api/tasks/${id}/complete`, {});
    toast("Task completed", "success");
    loadTasks();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function deleteTaskRow(id) {
  if (!confirm("Delete this task?")) return;
  try {
    await API.del(`/api/tasks/${id}`);
    toast("Task deleted", "success");
    loadTasks();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

function openAddTaskModal() {
  // Load projects into selector
  API.get("/api/projects").then(projects => {
    const sel = document.getElementById("task-project-input");
    sel.innerHTML = '<option value="">No project</option>';
    projects.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
  });
  document.getElementById("task-title-input").value = "";
  document.getElementById("task-desc-input").value = "";
  document.getElementById("task-priority-input").value = "medium";
  document.getElementById("task-due-input").value = "";
  openModal("modal-add-task");
  setTimeout(() => document.getElementById("task-title-input").focus(), 50);
}

async function createTask() {
  const title = document.getElementById("task-title-input").value.trim();
  if (!title) { toast("Title is required", "error"); return; }

  const due = document.getElementById("task-due-input").value;
  const projectId = document.getElementById("task-project-input").value;

  try {
    await API.post("/api/tasks", {
      title,
      description: document.getElementById("task-desc-input").value,
      priority: document.getElementById("task-priority-input").value,
      project_id: projectId ? parseInt(projectId) : null,
      due_date: due ? new Date(due).toISOString() : null,
    });
    closeModal("modal-add-task");
    toast("Task created", "success");
    if (state.currentPage === "tasks") loadTasks();
    if (state.currentPage === "dashboard") loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Memory ───────────────────────────────────────────────────────────────────

async function loadMemories() {
  try {
    const memories = await API.get("/api/memories");
    const container = document.getElementById("memory-list-container");
    if (!memories.length) {
      container.innerHTML = '<div class="empty-state" style="padding:40px">No memories stored. Ask Clanker to remember something, or add one manually.</div>';
      return;
    }
    container.innerHTML = memories.map(m => `
      <div class="memory-item" id="mem-${m.id}">
        <div style="flex:1">
          <div class="memory-content">${escHtml(m.content)}</div>
          ${m.tags ? `<div class="memory-tags">🏷 ${escHtml(m.tags)}</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="memory-date">${new Date(m.created_at).toLocaleDateString()}</div>
          <button class="icon-btn danger" style="font-size:12px" onclick="deleteMemoryItem(${m.id})" title="Delete">🗑</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    toast(`Failed to load memories: ${e.message}`, "error");
  }
}

function openAddMemoryModal() {
  document.getElementById("memory-content-input").value = "";
  document.getElementById("memory-tags-input").value = "";
  openModal("modal-add-memory");
  setTimeout(() => document.getElementById("memory-content-input").focus(), 50);
}

async function createMemory() {
  const content = document.getElementById("memory-content-input").value.trim();
  if (!content) { toast("Memory content is required", "error"); return; }
  try {
    await API.post("/api/memories", {
      content,
      tags: document.getElementById("memory-tags-input").value,
    });
    closeModal("modal-add-memory");
    toast("Remembered ✅", "success");
    loadMemories();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function deleteMemoryItem(id) {
  if (!confirm("Delete this memory?")) return;
  try {
    await API.del(`/api/memories/${id}`);
    toast("Memory deleted", "success");
    loadMemories();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

function openAddProjectModal() {
  document.getElementById("proj-name-input").value = "";
  document.getElementById("proj-desc-input").value = "";
  document.getElementById("proj-folder-input").value = "";
  document.getElementById("proj-notes-input").value = "";
  openModal("modal-add-project");
  setTimeout(() => document.getElementById("proj-name-input").focus(), 50);
}

async function createProject() {
  const name = document.getElementById("proj-name-input").value.trim();
  if (!name) { toast("Project name is required", "error"); return; }
  try {
    await API.post("/api/projects", {
      name,
      description: document.getElementById("proj-desc-input").value,
      folder_path: document.getElementById("proj-folder-input").value,
      notes: document.getElementById("proj-notes-input").value,
    });
    closeModal("modal-add-project");
    toast("Project created", "success");
    if (state.currentPage === "settings") loadSettings();
    if (state.currentPage === "dashboard") loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function loadSettings() {
  // Ollama settings
  try {
    const cfg = await API.get("/api/settings/ollama");
    document.getElementById("setting-host").value = cfg.host;
    document.getElementById("setting-model").value = cfg.model;
    document.getElementById("setting-timeout").value = cfg.timeout;
  } catch {}

  // System prompt
  try {
    const sp = await API.get("/api/settings/system-prompt");
    document.getElementById("setting-system-prompt").value = sp.prompt;
  } catch {}

  // Folders
  loadFolders();
  loadActions();
  loadSettingsProjects();
}

async function loadFolders() {
  try {
    const folders = await API.get("/api/settings/folders");
    const el = document.getElementById("folders-list");
    if (!folders.length) {
      el.innerHTML = '<div class="empty-state">No approved folders configured.</div>';
      return;
    }
    el.innerHTML = folders.map(f => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">📁 ${escHtml(f.path)}</div>
          ${f.label ? `<div class="list-item-sub">${escHtml(f.label)}</div>` : ""}
        </div>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="removeFolder(${f.id})">Remove</button>
      </div>
    `).join("");
  } catch {}
}

async function addFolder() {
  const path = document.getElementById("new-folder-path").value.trim();
  if (!path) return;
  try {
    await API.post("/api/settings/folders", {path});
    document.getElementById("new-folder-path").value = "";
    toast("Folder added", "success");
    loadFolders();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function removeFolder(id) {
  try {
    await API.del(`/api/settings/folders/${id}`);
    toast("Folder removed", "success");
    loadFolders();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function loadActions() {
  try {
    const actions = await API.get("/api/settings/actions");
    const el = document.getElementById("actions-list");
    if (!actions.length) {
      el.innerHTML = '<div class="empty-state">No quick actions configured.</div>';
      return;
    }
    el.innerHTML = actions.map(a => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(a.name)}</div>
          <div class="list-item-sub">${a.action_type} → ${escHtml(a.target)}</div>
        </div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="runAction(${a.id})">▶ Open</button>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="removeAction(${a.id})">Remove</button>
      </div>
    `).join("");
  } catch {}
}

async function addAction() {
  const name = document.getElementById("new-action-name").value.trim();
  const action_type = document.getElementById("new-action-type").value;
  const target = document.getElementById("new-action-target").value.trim();
  if (!name || !target) { toast("Name and target are required", "error"); return; }
  try {
    await API.post("/api/settings/actions", {name, action_type, target});
    document.getElementById("new-action-name").value = "";
    document.getElementById("new-action-target").value = "";
    toast("Action added", "success");
    loadActions();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function runAction(id) {
  try {
    const result = await API.post(`/api/settings/actions/${id}/execute`, {});
    toast(result.message || "Opened", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function removeAction(id) {
  try {
    await API.del(`/api/settings/actions/${id}`);
    toast("Removed", "success");
    loadActions();
  } catch {}
}

async function loadSettingsProjects() {
  try {
    const projects = await API.get("/api/projects");
    const el = document.getElementById("settings-projects-list");
    if (!projects.length) {
      el.innerHTML = '<div class="empty-state">No projects yet.</div>';
      return;
    }
    el.innerHTML = projects.map(p => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(p.name)}</div>
          <div class="list-item-sub">${p.status} ${p.folder_path ? `· ${escHtml(p.folder_path)}` : ""}</div>
        </div>
        <select class="model-selector" onchange="updateProjectStatus(${p.id}, this.value)" style="font-size:11px">
          <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${p.status === 'paused' ? 'selected' : ''}>Paused</option>
          <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Completed</option>
          <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>Archived</option>
        </select>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:12px" onclick="deleteProjectSettings(${p.id})">Delete</button>
      </div>
    `).join("");
  } catch {}
}

async function updateProjectStatus(id, status) {
  try {
    await API.patch(`/api/projects/${id}`, {status});
    toast("Project updated", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function deleteProjectSettings(id) {
  if (!confirm("Delete this project? Tasks will lose their project association.")) return;
  try {
    await API.del(`/api/projects/${id}`);
    toast("Project deleted", "success");
    loadSettingsProjects();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function saveOllamaSettings() {
  const host = document.getElementById("setting-host").value.trim();
  const model = document.getElementById("setting-model").value.trim();
  const timeout = parseInt(document.getElementById("setting-timeout").value);
  try {
    await API.patch("/api/settings/ollama", {host, model, timeout});
    toast("Settings saved", "success");
    checkOllamaStatus();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function testOllamaConnection() {
  const result = document.getElementById("connection-test-result");
  result.textContent = "Testing…";
  result.style.color = "var(--text-secondary)";
  try {
    const data = await API.get("/api/ollama/health");
    if (data.status === "ok") {
      result.textContent = "✅ Connected to Ollama";
      result.style.color = "var(--green)";
    } else {
      result.textContent = `❌ ${data.message}`;
      result.style.color = "var(--red)";
    }
  } catch (e) {
    result.textContent = `❌ ${e.message}`;
    result.style.color = "var(--red)";
  }
}

async function saveSystemPrompt() {
  const prompt = document.getElementById("setting-system-prompt").value;
  try {
    await API.patch("/api/settings/system-prompt", {prompt});
    toast("System prompt saved", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────

function openModal(id) {
  document.getElementById(id).classList.add("open");
}

function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

// Close modal on overlay click
document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
});

// Close modal on Escape
document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
  }
});

// ─── Utilities ────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escJs(str) {
  return String(str ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "✅ Copied!";
    setTimeout(() => btn.textContent = orig, 2000);
  } catch {
    toast("Copy failed", "error");
  }
}

async function copyCode(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = "Copy", 2000);
  } catch {
    toast("Copy failed", "error");
  }
}

// ─── App Init ─────────────────────────────────────────────────────────────────

async function init() {
  // Configure marked
  marked.setOptions({
    breaks: true,
    gfm: true,
  });

  await Promise.all([
    checkOllamaStatus(),
    loadConversations(),
  ]);

  loadDashboard();

  // Poll Ollama status every 30s
  setInterval(checkOllamaStatus, 30000);
}

init();
