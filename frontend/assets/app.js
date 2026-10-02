/**
 * Clanker Frontend — Sci-Fi HUD Edition
 * Vanilla JS, zero dependencies (marked.js for markdown)
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

// ─── Toast ───────────────────────────────────────────────────────────────────

function toast(message, type = "info", duration = 3000) {
  const icons = {success: "// OK", error: "// ERR", info: "// INFO"};
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-weight:700">${icons[type]}</span><span>${message.toUpperCase()}</span>`;
  document.getElementById("toast-container").appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

function buildWaveform() {
  const el = document.getElementById("waveform");
  if (!el) return;
  el.innerHTML = "";
  const bars = 48;
  for (let i = 0; i < bars; i++) {
    const bar = document.createElement("div");
    bar.className = "wave-bar";
    const maxH = 4 + Math.random() * 14;
    const dur  = 0.8 + Math.random() * 1.2;
    const del  = Math.random() * -1.5;
    bar.style.cssText = `--max-h:${maxH}px; --dur:${dur}s; --delay:${del}s; height:${Math.random()*maxH}px`;
    el.appendChild(bar);
  }
}

// ─── Page Navigation ─────────────────────────────────────────────────────────

const pageLabels = {
  dashboard: "SYSTEM DASHBOARD",
  chat: "COMMS INTERFACE",
  tasks: "TASK REGISTRY",
  memory: "MEMORY BANK",
  settings: "SYSTEM CONFIGURATION",
};

const pageSubs = {
  dashboard: "CLANKER v1.0 — OPERATIONAL",
  chat: "SECURE LOCAL INFERENCE CHANNEL",
  tasks: "DIRECTIVE MANAGEMENT SYSTEM",
  memory: "LONG-TERM MEMORY STORAGE",
  settings: "SYSTEM PARAMETERS & CONFIG",
};

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));

  document.getElementById(`page-${name}`).classList.add("active");
  document.getElementById(`nav-${name}`)?.classList.add("active");

  document.getElementById("topbar-title").textContent = pageLabels[name] || name.toUpperCase();
  document.getElementById("topbar-sub").textContent = pageSubs[name] || "";

  document.getElementById("chat-actions").classList.toggle("hidden", name !== "chat");

  state.currentPage = name;

  if (name === "dashboard") loadDashboard();
  if (name === "tasks")     loadTasks();
  if (name === "memory")    loadMemories();
  if (name === "settings")  loadSettings();
}

// ─── Ollama Status ─────────────────────────────────────────────────────────

async function checkOllamaStatus() {
  const pill = document.getElementById("ollama-status");
  const text = document.getElementById("ollama-status-text");
  const sidebarText = document.getElementById("sidebar-status-text");
  const sidebarPulse = document.getElementById("sidebar-pulse");

  try {
    const data = await API.get("/api/ollama/health");
    if (data.status === "ok") {
      pill.className = "status-pill connected";
      text.textContent = "ENGINE ONLINE";
      if (sidebarText) { sidebarText.textContent = "SYSTEM ACTIVE"; sidebarText.style.color = "var(--green)"; }
      if (sidebarPulse) { sidebarPulse.style.background = "var(--green)"; sidebarPulse.style.boxShadow = "0 0 6px var(--green)"; }
      await loadModels();
    } else {
      pill.className = "status-pill error";
      text.textContent = "ENGINE OFFLINE";
      if (sidebarText) { sidebarText.textContent = "CONNECTION FAILED"; sidebarText.style.color = "var(--red)"; }
    }
  } catch {
    pill.className = "status-pill error";
    text.textContent = "ENGINE OFFLINE";
    if (sidebarText) { sidebarText.textContent = "OLLAMA OFFLINE"; sidebarText.style.color = "var(--red)"; }
    if (sidebarPulse) { sidebarPulse.style.background = "var(--red)"; sidebarPulse.style.boxShadow = "0 0 6px var(--red)"; }
  }
}

async function loadModels() {
  try {
    const data = await API.get("/api/ollama/models");
    const sel = document.getElementById("model-selector");
    sel.innerHTML = "";
    if (!data.models || data.models.length === 0) {
      sel.innerHTML = '<option value="">NO MODELS</option>';
      return;
    }
    data.models.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.name;
      opt.textContent = m.name.toUpperCase();
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
    toast(`Model switch failed: ${e.message}`, "error");
  }
}

// ─── Conversations ─────────────────────────────────────────────────────────

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
  const countEl = document.getElementById("conv-count");
  if (countEl) countEl.textContent = state.conversations.length;

  if (!state.conversations.length) {
    list.innerHTML = '<div class="empty-state">NO SESSIONS FOUND</div>';
    return;
  }

  list.innerHTML = state.conversations.map(c => `
    <div class="conv-item ${c.id === state.currentConversationId ? 'active' : ''}"
         id="conv-item-${c.id}"
         onclick="openConversation(${c.id})">
      <div class="conv-dot"></div>
      <div class="conv-item-title" title="${escHtml(c.title)}">${escHtml(c.title).toUpperCase()}</div>
      <div class="conv-item-actions">
        <button class="conv-action-btn" title="Rename" onclick="event.stopPropagation();renameConversationById(${c.id}, '${escHtml(c.title)}')">✏</button>
        <button class="conv-action-btn" title="Delete" onclick="event.stopPropagation();deleteConversation(${c.id})">✕</button>
      </div>
    </div>
  `).join("");
}

async function newConversation() {
  try {
    const conv = await API.post("/api/chat/conversations", {title: "New Session"});
    state.conversations.unshift(conv);
    renderConversationList();
    await openConversation(conv.id);
    showPage("chat");
  } catch (e) {
    toast(`Failed to create session: ${e.message}`, "error");
  }
}

async function openConversation(id) {
  try {
    const conv = await API.get(`/api/chat/conversations/${id}`);
    state.currentConversationId = id;
    renderConversationList();
    renderMessages(conv.messages);
    document.getElementById("topbar-title").textContent = `SESSION // ${conv.title.toUpperCase()}`;
    showPage("chat");
  } catch (e) {
    toast(`Could not open session: ${e.message}`, "error");
  }
}

function renderMessages(messages) {
  const container = document.getElementById("messages-container");
  const welcome   = document.getElementById("welcome-screen");

  if (!messages || messages.length === 0) {
    container.innerHTML = "";
    container.appendChild(welcome);
    welcome.style.display = "flex";
    return;
  }

  welcome.style.display = "none";
  if (welcome.parentNode) welcome.parentNode.removeChild(welcome);

  container.innerHTML = messages.map(m => renderMessageHTML(m)).join("");
  scrollToBottom();
}

function renderMessageHTML(msg) {
  const isUser = msg.role === "user";
  const tag    = isUser ? "[ STARK ]" : "[ CLANKER ]";
  const time   = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false})
    : "";
  const content = isUser
    ? escHtml(msg.content).replace(/\n/g, "<br>")
    : renderMarkdown(msg.content);

  return `
    <div class="message ${msg.role}" id="msg-${msg.id || Date.now()}">
      <div class="message-header">
        <span class="msg-tag">${tag}</span>
        <span class="msg-time">${time}</span>
      </div>
      <div class="message-bubble">${content}</div>
      ${!isUser ? `
      <div class="message-actions">
        <button class="icon-btn" style="font-size:9px;padding:3px 10px;letter-spacing:1px" onclick="copyText(this, \`${escJs(msg.content)}\`)">COPY</button>
      </div>` : ""}
    </div>
  `;
}

function renderMarkdown(text) {
  try {
    const html = marked.parse(text, {breaks: true, gfm: true});
    return html.replace(
      /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
      (_, lang, code) => {
        const langLabel = (lang || "CODE").toUpperCase();
        const rawCode = code.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"');
        return `<pre>
          <div class="code-block-header">
            <span class="code-lang">// ${langLabel}</span>
            <button class="copy-code-btn" onclick="copyCode(this, \`${escJs(rawCode)}\`)">[ COPY ]</button>
          </div>
          <code class="language-${lang || ''}">${code}</code>
        </pre>`;
      }
    );
  } catch {
    return escHtml(text).replace(/\n/g, "<br>");
  }
}

async function clearConversation() {
  if (!state.currentConversationId) return;
  if (!confirm("CLEAR ALL TRANSMISSIONS IN THIS SESSION?")) return;
  try {
    await API.del(`/api/chat/conversations/${state.currentConversationId}/messages`);
    renderMessages([]);
    toast("Session cleared", "success");
  } catch (e) {
    toast(`Clear failed: ${e.message}`, "error");
  }
}

async function deleteConversation(id) {
  if (!confirm("TERMINATE THIS SESSION? DATA WILL BE LOST.")) return;
  try {
    await API.del(`/api/chat/conversations/${id}`);
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentConversationId === id) {
      state.currentConversationId = null;
      renderMessages([]);
    }
    renderConversationList();
    toast("Session terminated", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
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
  const id    = parseInt(document.getElementById("modal-rename-conv").dataset.convId);
  const title = document.getElementById("rename-conv-input").value.trim();
  if (!title) return;
  try {
    await API.patch(`/api/chat/conversations/${id}/rename`, {title});
    const c = state.conversations.find(x => x.id === id);
    if (c) c.title = title;
    renderConversationList();
    if (id === state.currentConversationId)
      document.getElementById("topbar-title").textContent = `SESSION // ${title.toUpperCase()}`;
    closeModal("modal-rename-conv");
    toast("Session relabeled", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Chat / Streaming ─────────────────────────────────────────────────────

async function sendMessage() {
  if (state.isGenerating) {
    state.isGenerating = false;
    setSendButtonState("idle");
    return;
  }

  const input = document.getElementById("chat-input");
  const text  = input.value.trim();
  if (!text) return;

  if (!state.currentConversationId) await newConversation();

  appendMessage({role: "user", content: text, created_at: new Date().toISOString()});
  input.value = "";
  input.style.height = "auto";
  scrollToBottom();

  const typingId = showTypingIndicator();
  setSendButtonState("stop");
  state.isGenerating = true;

  const assistantMsgId = `streaming-${Date.now()}`;
  const placeholder = document.createElement("div");
  placeholder.className = "message assistant";
  placeholder.id = assistantMsgId;
  placeholder.innerHTML = `
    <div class="message-header"><span class="msg-tag">[ CLANKER ]</span></div>
    <div class="message-bubble" id="${assistantMsgId}-content"></div>
  `;
  removeTypingIndicator(typingId);
  document.getElementById("messages-container").appendChild(placeholder);
  scrollToBottom();

  let fullText = "";
  const contentEl = document.getElementById(`${assistantMsgId}-content`);

  try {
    const model    = document.getElementById("model-selector").value || state.activeModel;
    const response = await fetch(`/api/chat/conversations/${state.currentConversationId}/send`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: text, model}),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({detail: "Unknown error"}));
      throw new Error(err.detail || "Stream error");
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer    = "";

    while (true) {
      if (!state.isGenerating) break;
      const {done, value} = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, {stream: true});
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6);
        if (data === "[DONE]") { state.isGenerating = false; break; }
        if (data.startsWith("[ERROR]")) {
          toast(data.slice(7).trim(), "error");
          state.isGenerating = false;
          break;
        }
        fullText += data.replace(/\\n/g, "\n");
        contentEl.innerHTML = renderMarkdown(fullText);
        scrollToBottom();
      }
    }
    reader.cancel();
  } catch (e) {
    toast(`TRANSMISSION ERROR: ${e.message}`, "error");
    fullText = `⚠ SYSTEM ERROR: ${e.message}`;
    if (contentEl) contentEl.textContent = fullText;
  }

  state.isGenerating = false;
  setSendButtonState("idle");

  const now = new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false});
  placeholder.innerHTML = `
    <div class="message-header">
      <span class="msg-tag">[ CLANKER ]</span>
      <span class="msg-time">${now}</span>
    </div>
    <div class="message-bubble">${renderMarkdown(fullText)}</div>
    <div class="message-actions">
      <button class="icon-btn" style="font-size:9px;padding:3px 10px;letter-spacing:1px" onclick="copyText(this, \`${escJs(fullText)}\`)">COPY</button>
    </div>
  `;
  scrollToBottom();

  await loadConversations();
}

function appendMessage(msg) {
  const welcome = document.getElementById("welcome-screen");
  if (welcome) welcome.style.display = "none";
  const container = document.getElementById("messages-container");
  const div = document.createElement("div");
  div.innerHTML = renderMessageHTML(msg);
  container.appendChild(div.firstElementChild);
}

function showTypingIndicator() {
  const id = `typing-${Date.now()}`;
  const container = document.getElementById("messages-container");
  const el = document.createElement("div");
  el.id = id;
  el.className = "message assistant";
  el.innerHTML = `
    <div class="message-header"><span class="msg-tag">[ CLANKER ]</span></div>
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <span style="margin-left:6px">PROCESSING...</span>
    </div>
  `;
  container.appendChild(el);
  scrollToBottom();
  return id;
}

function removeTypingIndicator(id) { document.getElementById(id)?.remove(); }

function setSendButtonState(st) {
  const btn = document.getElementById("send-btn");
  if (st === "stop") {
    btn.innerHTML = "STOP ■";
    btn.classList.add("stop");
  } else {
    btn.innerHTML = "SEND ▶";
    btn.classList.remove("stop");
  }
}

function handleInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
}

function scrollToBottom() {
  const c = document.getElementById("messages-container");
  c.scrollTop = c.scrollHeight;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

async function loadDashboard() {
  try {
    const data = await API.get("/api/dashboard");

    document.getElementById("greeting-text").textContent = data.greeting.toUpperCase();
    document.getElementById("greeting-date").textContent = data.datetime.toUpperCase();

    // Today tasks
    const todayList = document.getElementById("today-task-list");
    document.getElementById("today-count").textContent = data.stats.total_today_tasks;
    if (!data.today_tasks.length) {
      todayList.innerHTML = '<div class="empty-state">NO ACTIVE DIRECTIVES</div>';
    } else {
      todayList.innerHTML = data.today_tasks.map(t => `
        <div class="task-item" onclick="showPage('tasks')">
          <div class="task-checkbox ${t.status==='done'?'done':''}" onclick="event.stopPropagation();quickCompleteTask(${t.id})" title="Complete"></div>
          <div class="task-title">${escHtml(t.title)}</div>
          <div class="task-priority priority-${t.priority}">${t.priority.toUpperCase()}</div>
        </div>
      `).join("");
    }

    // Overdue
    const overdueList = document.getElementById("overdue-task-list");
    document.getElementById("overdue-count").textContent = data.stats.total_overdue;
    if (!data.overdue_tasks.length) {
      overdueList.innerHTML = '<div class="empty-state">SYSTEMS CLEAR — NO OVERDUE</div>';
    } else {
      overdueList.innerHTML = data.overdue_tasks.map(t => `
        <div class="task-item">
          <div class="task-checkbox" onclick="quickCompleteTask(${t.id})" title="Complete"></div>
          <div class="task-title" style="color:var(--red)">${escHtml(t.title)}</div>
          <div class="task-priority priority-high">OVERDUE</div>
        </div>
      `).join("");
    }

    // Projects
    const projEl = document.getElementById("dashboard-projects");
    document.getElementById("projects-count").textContent = data.stats.active_projects;
    if (!data.active_projects.length) {
      projEl.innerHTML = '<div class="empty-state">NO ACTIVE PROJECTS</div>';
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
    if (!data.recent_conversations.length) {
      recentEl.innerHTML = '<div class="empty-state">NO SESSIONS — INITIATE A COMMS SESSION</div>';
    } else {
      recentEl.innerHTML = data.recent_conversations.map(c => `
        <div class="task-item" onclick="openConversation(${c.id})">
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--cyan);min-width:24px">◉</div>
          <div class="task-title">${escHtml(c.title).toUpperCase()}</div>
          <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted)">
            ${new Date(c.updated_at).toLocaleDateString().toUpperCase()}
          </div>
        </div>
      `).join("");
    }

    buildWaveform();
  } catch (e) {
    console.error("Dashboard load failed:", e);
  }
}

async function quickCompleteTask(id) {
  try {
    await API.post(`/api/tasks/${id}/complete`, {});
    toast("Directive completed", "success");
    loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Tasks ─────────────────────────────────────────────────────────────────

async function loadTasks() {
  let url = "/api/tasks?";
  const f = state.taskFilter;
  if      (f === "today")   url = "/api/tasks?scope=today";
  else if (f === "overdue") url = "/api/tasks?scope=overdue";
  else if (f === "done")    url = "/api/tasks?status=done";
  else if (f === "pending") url = "/api/tasks?status=pending";
  else                      url = "/api/tasks?status=all";

  try {
    const tasks = await API.get(url);
    const container = document.getElementById("task-list-container");
    if (!tasks.length) {
      container.innerHTML = '<div class="empty-state" style="padding:40px">NO DIRECTIVES IN REGISTRY</div>';
      return;
    }
    container.innerHTML = tasks.map(t => `
      <div class="task-row ${t.status==='done'?'done':''}" id="task-row-${t.id}">
        <div class="task-checkbox ${t.status==='done'?'done':''}" onclick="completeTaskRow(${t.id})" title="Mark complete"></div>
        <div style="flex:1;min-width:0">
          <div class="task-row-title" style="${t.status==='done'?'text-decoration:line-through':''}">
            ${escHtml(t.title)}
          </div>
          ${t.description ? `<div class="task-row-desc">${escHtml(t.description)}</div>` : ""}
          ${t.due_date ? `<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);margin-top:2px;letter-spacing:1px">DEADLINE: ${new Date(t.due_date).toLocaleString().toUpperCase()}</div>` : ""}
        </div>
        <div class="task-priority priority-${t.priority}">${t.priority.toUpperCase()}</div>
        <button class="icon-btn danger" style="font-size:9px;letter-spacing:1px;padding:4px 8px" onclick="deleteTaskRow(${t.id})">DEL</button>
      </div>
    `).join("");
  } catch (e) {
    toast(`Failed to load registry: ${e.message}`, "error");
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
    toast("Directive completed", "success");
    loadTasks();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function deleteTaskRow(id) {
  if (!confirm("DELETE THIS DIRECTIVE FROM REGISTRY?")) return;
  try {
    await API.del(`/api/tasks/${id}`);
    toast("Directive deleted", "success");
    loadTasks();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

function openAddTaskModal() {
  API.get("/api/projects").then(projects => {
    const sel = document.getElementById("task-project-input");
    sel.innerHTML = '<option value="">NONE</option>';
    projects.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.name.toUpperCase();
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
  if (!title) { toast("Directive title required", "error"); return; }
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
    toast("Directive logged", "success");
    if (state.currentPage === "tasks") loadTasks();
    if (state.currentPage === "dashboard") loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Memory ────────────────────────────────────────────────────────────────

async function loadMemories() {
  try {
    const memories = await API.get("/api/memories");
    const container = document.getElementById("memory-list-container");
    if (!memories.length) {
      container.innerHTML = '<div class="empty-state" style="padding:40px">MEMORY BANK EMPTY — ENCODE DATA TO STORE</div>';
      return;
    }
    container.innerHTML = memories.map((m, i) => `
      <div class="memory-item" id="mem-${m.id}">
        <div class="memory-index">#${String(i+1).padStart(3,'0')}</div>
        <div style="flex:1">
          <div class="memory-content">${escHtml(m.content)}</div>
          ${m.tags ? `<div class="memory-tags">[ ${escHtml(m.tags).toUpperCase()} ]</div>` : ""}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
          <div class="memory-date">${new Date(m.created_at).toLocaleDateString().toUpperCase()}</div>
          <button class="icon-btn danger" style="font-size:9px;letter-spacing:1px;padding:3px 8px" onclick="deleteMemoryItem(${m.id})" title="Delete">DEL</button>
        </div>
      </div>
    `).join("");
  } catch (e) {
    toast(`Failed to load memory bank: ${e.message}`, "error");
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
  if (!content) { toast("Data required", "error"); return; }
  try {
    await API.post("/api/memories", {
      content,
      tags: document.getElementById("memory-tags-input").value,
    });
    closeModal("modal-add-memory");
    toast("Memory encoded", "success");
    loadMemories();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function deleteMemoryItem(id) {
  if (!confirm("PURGE THIS MEMORY FROM BANK?")) return;
  try {
    await API.del(`/api/memories/${id}`);
    toast("Memory purged", "success");
    loadMemories();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Projects ──────────────────────────────────────────────────────────────

function openAddProjectModal() {
  ["proj-name-input","proj-desc-input","proj-folder-input","proj-notes-input"].forEach(id => {
    document.getElementById(id).value = "";
  });
  openModal("modal-add-project");
  setTimeout(() => document.getElementById("proj-name-input").focus(), 50);
}

async function createProject() {
  const name = document.getElementById("proj-name-input").value.trim();
  if (!name) { toast("Project designation required", "error"); return; }
  try {
    await API.post("/api/projects", {
      name,
      description: document.getElementById("proj-desc-input").value,
      folder_path: document.getElementById("proj-folder-input").value,
      notes: document.getElementById("proj-notes-input").value,
    });
    closeModal("modal-add-project");
    toast("Project registered", "success");
    if (state.currentPage === "settings") loadSettings();
    if (state.currentPage === "dashboard") loadDashboard();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Settings ──────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const cfg = await API.get("/api/settings/ollama");
    document.getElementById("setting-host").value    = cfg.host;
    document.getElementById("setting-model").value   = cfg.model;
    document.getElementById("setting-timeout").value = cfg.timeout;
  } catch {}
  try {
    const sp = await API.get("/api/settings/system-prompt");
    document.getElementById("setting-system-prompt").value = sp.prompt;
  } catch {}
  loadFolders();
  loadActions();
  loadSettingsProjects();
}

async function loadFolders() {
  try {
    const folders = await API.get("/api/settings/folders");
    const el = document.getElementById("folders-list");
    if (!folders.length) {
      el.innerHTML = '<div class="empty-state">NO ZONES CONFIGURED</div>';
      return;
    }
    el.innerHTML = folders.map(f => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">📁 ${escHtml(f.path)}</div>
          ${f.label ? `<div class="list-item-sub">[ ${escHtml(f.label).toUpperCase()} ]</div>` : ""}
        </div>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:9px" onclick="removeFolder(${f.id})">REMOVE</button>
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
    toast("Zone authorized", "success");
    loadFolders();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function removeFolder(id) {
  try {
    await API.del(`/api/settings/folders/${id}`);
    toast("Zone removed", "success");
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
      el.innerHTML = '<div class="empty-state">NO PROTOCOLS CONFIGURED</div>';
      return;
    }
    el.innerHTML = actions.map(a => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(a.name).toUpperCase()}</div>
          <div class="list-item-sub">[ ${a.action_type.toUpperCase()} ] → ${escHtml(a.target)}</div>
        </div>
        <button class="btn btn-secondary" style="padding:4px 10px;font-size:9px" onclick="runAction(${a.id})">▶ EXEC</button>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:9px" onclick="removeAction(${a.id})">DEL</button>
      </div>
    `).join("");
  } catch {}
}

async function addAction() {
  const name        = document.getElementById("new-action-name").value.trim();
  const action_type = document.getElementById("new-action-type").value;
  const target      = document.getElementById("new-action-target").value.trim();
  if (!name || !target) { toast("Name and target required", "error"); return; }
  try {
    await API.post("/api/settings/actions", {name, action_type, target});
    document.getElementById("new-action-name").value = "";
    document.getElementById("new-action-target").value = "";
    toast("Protocol registered", "success");
    loadActions();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function runAction(id) {
  try {
    const result = await API.post(`/api/settings/actions/${id}/execute`, {});
    toast(result.message || "Protocol executed", "success");
  } catch (e) {
    toast(`Execution failed: ${e.message}`, "error");
  }
}

async function removeAction(id) {
  try {
    await API.del(`/api/settings/actions/${id}`);
    toast("Protocol removed", "success");
    loadActions();
  } catch {}
}

async function loadSettingsProjects() {
  try {
    const projects = await API.get("/api/projects");
    const el = document.getElementById("settings-projects-list");
    if (!projects.length) {
      el.innerHTML = '<div class="empty-state">NO PROJECTS REGISTERED</div>';
      return;
    }
    el.innerHTML = projects.map(p => `
      <div class="list-item">
        <div class="list-item-info">
          <div class="list-item-title">${escHtml(p.name).toUpperCase()}</div>
          <div class="list-item-sub">[ ${p.status.toUpperCase()} ] ${p.folder_path ? `· ${escHtml(p.folder_path)}` : ""}</div>
        </div>
        <select class="model-selector" onchange="updateProjectStatus(${p.id}, this.value)" style="font-size:9px">
          <option value="active"    ${p.status==="active"?"selected":""}>ACTIVE</option>
          <option value="paused"    ${p.status==="paused"?"selected":""}>PAUSED</option>
          <option value="completed" ${p.status==="completed"?"selected":""}>COMPLETED</option>
          <option value="archived"  ${p.status==="archived"?"selected":""}>ARCHIVED</option>
        </select>
        <button class="btn btn-danger" style="padding:4px 10px;font-size:9px" onclick="deleteProjectSettings(${p.id})">DEL</button>
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
  if (!confirm("DEREGISTER THIS PROJECT?")) return;
  try {
    await API.del(`/api/projects/${id}`);
    toast("Project deregistered", "success");
    loadSettingsProjects();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function saveOllamaSettings() {
  const host    = document.getElementById("setting-host").value.trim();
  const model   = document.getElementById("setting-model").value.trim();
  const timeout = parseInt(document.getElementById("setting-timeout").value);
  try {
    await API.patch("/api/settings/ollama", {host, model, timeout});
    toast("Config saved", "success");
    checkOllamaStatus();
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

async function testOllamaConnection() {
  const result = document.getElementById("connection-test-result");
  result.textContent = "// TESTING CONNECTION...";
  result.style.color = "var(--text-secondary)";
  try {
    const data = await API.get("/api/ollama/health");
    if (data.status === "ok") {
      result.textContent = "// STATUS: ONLINE — ENGINE RESPONDING";
      result.style.color = "var(--green)";
    } else {
      result.textContent = `// STATUS: OFFLINE — ${data.message.toUpperCase()}`;
      result.style.color = "var(--red)";
    }
  } catch (e) {
    result.textContent = `// STATUS: FAILED — ${e.message.toUpperCase()}`;
    result.style.color = "var(--red)";
  }
}

async function saveSystemPrompt() {
  const prompt = document.getElementById("setting-system-prompt").value;
  try {
    await API.patch("/api/settings/system-prompt", {prompt});
    toast("Directive encoded", "success");
  } catch (e) {
    toast(`Failed: ${e.message}`, "error");
  }
}

// ─── Modals ────────────────────────────────────────────────────────────────

function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

document.querySelectorAll(".modal-overlay").forEach(overlay => {
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.classList.remove("open");
  });
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape")
    document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
});

// ─── Utilities ─────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

function escJs(str) {
  return String(str ?? "")
    .replace(/\\/g,"\\\\").replace(/`/g,"\\`").replace(/\$/g,"\\$");
}

async function copyText(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    const orig = btn.textContent;
    btn.textContent = "COPIED";
    btn.style.color = "var(--green)";
    setTimeout(() => { btn.textContent = orig; btn.style.color = ""; }, 2000);
  } catch { toast("Copy failed", "error"); }
}

async function copyCode(btn, text) {
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "[ COPIED ]";
    setTimeout(() => btn.textContent = "[ COPY ]", 2000);
  } catch { toast("Copy failed", "error"); }
}

// ─── Boot ──────────────────────────────────────────────────────────────────

async function init() {
  marked.setOptions({ breaks: true, gfm: true });

  // Boot sequence animation
  const sidebarText = document.getElementById("sidebar-status-text");
  const bootSteps = ["BOOTING SYSTEM...", "CONNECTING TO ENGINE...", "LOADING DATABASE...", "INITIALIZING UI..."];
  let step = 0;
  const bootInterval = setInterval(() => {
    if (sidebarText && step < bootSteps.length) {
      sidebarText.textContent = bootSteps[step++];
    }
  }, 200);

  await Promise.all([checkOllamaStatus(), loadConversations()]);
  clearInterval(bootInterval);

  loadDashboard();
  setInterval(checkOllamaStatus, 30000);
}

init();
