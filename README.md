# Clanker — Local AI Desktop Assistant

> Like Jarvis from Iron Man, but yours. Private, local, and actually useful.

Clanker is a fully local AI desktop assistant built on [Ollama](https://ollama.com). No cloud APIs, no subscription, no data leaving your machine. It runs as a local web app — open it in your browser like any other app.

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-brightgreen.svg)

---

## Features

| Category | What it does |
|---|---|
| 💬 **Chat** | Streaming chat with any locally installed Ollama model |
| 🧠 **Memory** | Explicit long-term memory — you control what's stored |
| ✅ **Tasks** | Full task manager with priorities, due dates, and projects |
| 📦 **Projects** | Lightweight project system with optional folder links |
| 📁 **File Access** | Read-only access to pre-approved local folders |
| ⚡ **PC Actions** | Open configured folders/URLs/apps by name |
| 🏠 **Dashboard** | At-a-glance view of today's tasks, overdue items, projects |
| ⚙️ **Settings** | All configuration in the UI — no YAML editing required |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser (Vanilla JS + CSS)   localhost:7842         │
│  Dashboard │ Chat │ Tasks │ Memory │ Settings        │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + SSE
┌────────────────────▼────────────────────────────────┐
│  FastAPI Backend (Python 3.12)                       │
│  ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐  │
│  │ Ollama   │ │Context  │ │Tool    │ │ Routes   │  │
│  │ Service  │ │Manager  │ │Registry│ │ API      │  │
│  └──────────┘ └─────────┘ └────────┘ └──────────┘  │
│  ┌──────────────────────────────────────────────┐   │
│  │  SQLite (SQLAlchemy 2.x)                     │   │
│  │  conversations | messages | memories         │   │
│  │  tasks | projects | folders | actions        │   │
│  └──────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────┘
                            │ HTTP
┌───────────────────────────▼─────────────────────────┐
│  Ollama   (localhost:11434)                          │
│  qwen3:8b (or any installed model)                   │
└─────────────────────────────────────────────────────┘
```

### Project Structure

```
clanker/
├── app/
│   ├── ai/               # LLM pipeline
│   │   ├── chat_engine.py     # Streaming orchestration
│   │   ├── context_manager.py # Context assembly
│   │   └── tools.py           # Tool registry (12 tools)
│   ├── core/
│   │   ├── config.py          # Settings (pydantic-settings)
│   │   ├── database.py        # SQLAlchemy engine + session
│   │   └── logging.py         # Logging setup
│   ├── models/            # SQLAlchemy ORM models
│   ├── routes/            # FastAPI routers
│   ├── services/          # Business logic
│   └── main.py            # FastAPI app factory
├── frontend/
│   ├── index.html         # Single-page app shell
│   └── assets/
│       ├── style.css      # Complete design system
│       └── app.js         # All UI logic (~600 lines)
├── config/
│   └── system_prompt.txt  # Editable assistant personality
├── data/                  # SQLite database (auto-created)
├── logs/                  # Log files (auto-created)
├── .env                   # Local config (not committed)
├── .env.example
├── requirements.txt
├── run.py
└── start.bat              # Windows launcher
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM Backend | Ollama (local inference) |
| API Server | FastAPI + Uvicorn |
| Database | SQLite via SQLAlchemy 2.x |
| Validation | Pydantic v2 |
| Frontend | Vanilla HTML/CSS/JS |
| Markdown | marked.js (CDN) |
| Streaming | Server-Sent Events (SSE) |

---

## Installation

### Prerequisites
- **Python 3.12+** — [python.org](https://www.python.org/downloads/)
- **Ollama** — [ollama.com](https://ollama.com) (must be running)
- A model installed: `ollama pull qwen3:8b`

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/ashmit751/Clanker-My-shot-on-Jarvis-.git
cd Clanker-My-shot-on-Jarvis-

# 2. Create a virtual environment
python -m venv venv

# 3. Activate it
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Copy the example env file
copy .env.example .env   # Windows
# cp .env.example .env   # macOS/Linux

# 6. Start the app
python run.py
```

Then open **http://localhost:7842** in your browser.

### Windows Quick Start

Double-click `start.bat` — it opens the browser and starts the server automatically.

---

## Configuration

Edit `.env` to configure:

```env
OLLAMA_HOST=http://localhost:11434   # Ollama API location
OLLAMA_MODEL=qwen3:8b               # Default model
OLLAMA_TIMEOUT=120                  # Request timeout in seconds

APP_HOST=127.0.0.1                  # Bind address
APP_PORT=7842                       # Port

DATABASE_URL=sqlite:///./data/clanker.db
SYSTEM_PROMPT_FILE=config/system_prompt.txt
```

You can also change all Ollama settings and the system prompt from the **Settings** page in the UI.

---

## How Ollama is Used

- The app connects to Ollama via its HTTP API at `OLLAMA_HOST`
- On startup it checks if Ollama is running (`GET /`) and lists available models (`GET /api/tags`)
- Chat uses `POST /api/chat` with `stream: true` for real-time streaming
- The active model is configurable and switchable in the UI
- If Ollama is offline, the app shows a clear error and keeps running

---

## Tool System

The assistant has an explicit tool architecture — the LLM decides when to use tools, but the application executes them:

| Tool | Description |
|---|---|
| `get_current_time` | Current date/time |
| `create_task` | Create a task |
| `list_tasks` | List tasks (today / overdue / all) |
| `complete_task` | Mark task done |
| `delete_task` | Delete a task |
| `create_project` | Create a project |
| `list_projects` | List projects |
| `remember_information` | Store a memory |
| `search_memory` | Search memories |
| `delete_memory` | Delete a memory |
| `search_files` | Find files in approved folders |
| `read_file` | Read a file (approved folders only) |
| `open_action` | Open a configured folder/URL/app |

---

## Security Model

Clanker is designed with future powerful access in mind:

- ✅ **No arbitrary shell execution** — no `os.system()`, no `subprocess` with LLM-generated commands
- ✅ **No arbitrary file access** — filesystem reads are restricted to user-approved folders only
- ✅ **No file writes or deletes** — Phase 1 is read-only for files
- ✅ **No cloud APIs** — everything runs locally
- ✅ **No automatic data accumulation** — memory is only stored explicitly
- ✅ **Validated tool arguments** — all tool inputs are validated before execution
- ✅ **PC actions are pre-configured** — LLM can only open things you've added to the allowlist

---

## Windows Startup

To launch Clanker automatically with Windows:

1. Press `Win + R`, type `shell:startup`
2. Create a shortcut to `start.bat` in that folder

Or use Task Scheduler to run `start.bat` on login.

---

## Future Roadmap (Phase 2+)

- [ ] **Voice input** — microphone → speech-to-text → existing pipeline
- [ ] **Voice output** — response → text-to-speech
- [ ] **Wake word detection** — "Hey Clanker"
- [ ] **Vector memory** — semantic search with embeddings
- [ ] **More PC tools** — clipboard, window management
- [ ] **Browser extension** — send pages to Clanker
- [ ] **Scheduled tasks** — "remind me every Monday"
- [ ] **More LLM backends** — LM Studio, etc.

The voice layer is designed to feed text into the existing pipeline without any changes to the core assistant.

---

## Development

```bash
# Run in debug mode with auto-reload
APP_DEBUG=true python run.py

# Logs
tail -f logs/clanker.log   # macOS/Linux
Get-Content logs\clanker.log -Wait   # PowerShell
```

API documentation is available at `http://localhost:7842/docs` when `APP_DEBUG=true`.

---

## License

MIT — do whatever you want with it.
