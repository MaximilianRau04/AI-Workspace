A self-hosted AI workspace supporting multiple LLM providers (Gemini, OpenAI, Anthropic, Ollama) with streaming responses, an agentic ReAct loop for autonomous tool use, reasoning/thinking blocks, voice input & output, document upload, code interpreter, and per-user chat history.

## Running with Docker (recommended)

**Requirements:** Docker + Docker Compose

**1. Clone the repository**

```bash
git clone https://github.com/MaximilianRau04/AI-Workspace.git
cd AI-Workspace
```

**2. Create a `.env` file** in the project root

```env
SECRET_KEY=your_random_secret_key_here

# Add the key for whichever provider(s) you want to use:
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

Generate a secure `SECRET_KEY`:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

**3. Start**

```bash
docker compose up --build
```

Open `http://localhost:5000`. Data (database, config, uploads) is stored in the project root and persists across container restarts.

> **Note:** The code interpreter runs user code in isolated Docker containers with no network access. Docker must be running on the host for this feature to work.

---

## Running without Docker

**Requirements:** Python 3.10+, Node.js 18+

**1. Clone the repository**

```bash
git clone https://github.com/MaximilianRau04/AI-Workspace.git
cd AI-Workspace
```

**2. Create a virtual environment**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

**3. Install dependencies**

```bash
pip install -r requirements.txt
cd ../frontend && npm install
```

**4. Create a `.env` file** in the project root (same format as above)

API keys can also be entered directly in the in-app settings instead of the `.env` file.

### Development

Run backend and Vite dev server in two separate terminals:

```bash
# Terminal 1 – API server
cd backend && venv/bin/uvicorn app:app --host 0.0.0.0 --port 5000 --reload

# Terminal 2 – Frontend with HMR
cd frontend && npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies API calls to port 5000 and provides hot module replacement.

```bash
cd frontend && npm run format   # auto-format source files
```

### Production

```bash
cd frontend && npm run build
cd ../backend && venv/bin/uvicorn app:app --host 0.0.0.0 --port 5000
```

`npm run build` bundles everything into `dist/`. The backend detects `dist/` and serves it automatically. Open `http://localhost:5000`.

## Supported Providers

The active provider and model are configured via the ⚙️ Settings button → **Model** tab. The configuration is saved in `model_config.json` (not tracked by git).

| Provider | Example models | Notes |
|---|---|---|
| **Google Gemini** | `gemini-2.5-flash`, `gemini-2.5-pro` | Default. API key from [Google AI Studio](https://aistudio.google.com/app/apikey). Also used for document RAG embeddings. |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | Requires `OPENAI_API_KEY`. |
| **Ollama (local)** | `qwen3:8b`, `llama3.2:3b`, `mistral:7b` | No API key needed. Set provider to *OpenAI / Compatible* and base URL to `http://localhost:11434/v1`. Use "Detect models" to list installed models. |
| **LM Studio / other** | any OpenAI-compatible model | Same as Ollama - set the base URL to the local server's `/v1` endpoint. |
| **Anthropic Claude** | `claude-opus-4-8`, `claude-sonnet-4-6` | Requires `ANTHROPIC_API_KEY`. |

### Using Ollama

1. [Install Ollama](https://ollama.com) and pull a model, e.g. `ollama pull qwen3:8b`
2. Make sure the Ollama service is running before starting a chat:
   ```bash
   ollama serve
   ```
3. In the app: Settings → Model → Provider: *OpenAI / Compatible*
4. Set the base URL to `http://localhost:11434/v1` and click **Detect models** to auto-fill available models
5. Save - no API key or restart required

> **Note:** Every time you start the app with Ollama as the provider, `ollama serve` must be running in the background, otherwise you will get a *Connection error* when sending messages.

## Features

- **Multi-provider LLM** - switch between Gemini, OpenAI, Anthropic, or any local model via Ollama/LM Studio without restarting
- **User accounts** - register & login; each user has their own isolated chat history
- **Streaming responses** with typewriter effect
- **Persistent chat sessions** with sidebar for switching between conversations
- **Auto-summarization** - old messages are summarized automatically to keep context efficient
- **Syntax highlighting** - code blocks highlighted via highlight.js
- **Agentic ReAct loop** - the model autonomously decides when and how often to call tools; it can chain multiple tool calls in a single turn (e.g. search → read page → run code → answer) up to a configurable step limit (`MAX_AGENT_STEPS`)
- **Web search** - enable via the 🔍 button; the agent searches via DuckDuckGo and fetches URLs as needed - you control access, the model decides usage
- **Code interpreter** - enable via the `</>` button; the agent can write and execute code in isolated Docker containers (no network, memory/CPU limits); supported languages: Python, JavaScript, TypeScript (Deno), Bash, Ruby, PHP, Perl, Elixir, Lua, C, C++, Java, Go - Java class must be named `Main`
- **Voice input** - microphone button (Chrome / Edge only)
- **Voice output** - toggle via 🔇 button (powered by [edge-tts](https://github.com/rany2/edge-tts))
- **Document RAG** - upload `.txt`, `.md`, or `.pdf` files; the bot retrieves relevant passages automatically (requires Gemini API key for embeddings)
- **Configurable system prompt** - via the ⚙️ settings button
- **Token usage indicator** - ring graph next to the input bar (Gemini only)
- **Light / dark theme** toggle

## Project Structure

```
ChatBot/
├── backend/
│   ├── app.py              # FastAPI app: setup & router registration
│   ├── auth_store.py       # User storage (SQLite, password hashing)
│   ├── db.py               # SQLite connection & schema initialization
│   ├── history.py          # Per-user session persistence & summarization
│   ├── llm.py              # Provider abstraction (Gemini / OpenAI / Anthropic)
│   ├── rag.py              # Document indexing & retrieval (Gemini embeddings)
│   ├── state.py            # Per-user in-memory chat state
│   ├── utils.py            # Shared helpers (login_required dependency)
│   ├── requirements.txt    # Python dependencies
│   ├── venv/               # Virtual environment (not tracked by git)
│   └── routes/
│       ├── auth.py         # /login  /register  /logout  /me
│       ├── chat.py         # /chat (streaming SSE)
│       ├── config.py       # /config  /config/model  /config/ollama-models
│       ├── docs.py         # /docs  /docs/upload  /docs/delete
│       ├── sessions.py     # /sessions  /sessions/new  /sessions/<id>
│       └── voice.py        # /tts  /stt
├── frontend/
│   ├── index.html          # HTML entry point (React root)
│   ├── vite.config.js      # Vite config (React plugin, dev proxy, build output)
│   ├── tailwind.config.js  # Tailwind theme tokens (colors, dark mode)
│   ├── tsconfig.json       # TypeScript config
│   ├── postcss.config.js
│   ├── package.json
│   └── src/
│       ├── main.tsx        # React entry point
│       ├── App.tsx         # Router setup
│       ├── index.css       # Global styles & Tailwind directives
│       ├── types.ts        # Shared TypeScript interfaces
│       ├── globals.d.ts    # Type declarations for CDN globals (marked, hljs)
│       ├── api/            # Typed fetch wrappers (auth, chats, config, docs, voice)
│       ├── context/        # AppContext - auth, sessions, config, theme
│       ├── hooks/          # useStream (SSE), useVoice (mic + TTS)
│       ├── pages/          # ChatPage, LoginPage
│       ├── components/
│       │   ├── chat/       # ChatArea, MessagePair, InputArea, HomeHero
│       │   ├── layout/     # Header (model switcher), Sidebar
│       │   ├── settings/   # SettingsModal
│       │   └── documents/  # DocsModal
│       └── utils/
│           └── markdown.ts # marked + highlight.js rendering helpers
├── dist/                   # Production build output (not tracked by git)
├── docs/                   # Uploaded documents (not tracked by git)
├── chatbot.db              # SQLite database - users & chats (not tracked by git)
├── model_config.json       # Active model/provider config (not tracked by git)
├── rag_index.json          # Document embeddings (not tracked by git)
├── system_prompt.txt       # Editable system prompt
├── .env                    # API keys & secret key (not tracked by git)
└── README.md
```

## Agent Loop

When web search or code interpreter is enabled, the model runs in a **ReAct loop** (Reasoning + Acting):

```
User message
  └─ LLM thinks → calls tool (web_search / fetch_url / execute_code)
       └─ result returned to LLM
            └─ LLM thinks again → calls another tool (optional)
                 └─ ... repeat up to MAX_AGENT_STEPS (default: 10)
                      └─ LLM produces final answer
```

The toggle buttons in the input bar control **which tools the model has access to** - not whether a tool will be called. The model decides autonomously if and when a tool is needed. Example multi-step flows:

- *"What's the current EUR/USD rate and how much is 1500 EUR in USD?"* → web_search → execute_code → answer
- *"Summarize the article at this URL and translate it to German"* → fetch_url → answer
- *"Write a Python script that sorts a list and show me the output"* → execute_code → answer

The intermediate steps (searches, code executions) are streamed to the frontend in real time so you can follow what the agent is doing.

## Security

- Passwords are hashed with `werkzeug.security` (scrypt + salt) - never stored in plain text.
- The session cookie is signed with `SECRET_KEY` via Starlette's `SessionMiddleware`; use a long random value in production.
- API keys and `SECRET_KEY` live in `.env` and are excluded from version control.
- Model config (including any API key entered via the UI) is stored in `model_config.json`, which is also excluded from version control.
- `chatbot.db` contains user data and chat history - never commit it to version control.
