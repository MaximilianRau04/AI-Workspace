A self-hosted chat interface supporting multiple LLM providers (Gemini, OpenAI, Anthropic, Ollama) with streaming responses, reasoning/thinking blocks, voice input & output, document upload, and per-user chat history.

## Requirements

- Python 3.10+
- Node.js 18+
- At least one LLM provider (see below)

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/your-username/ChatBot.git
cd ChatBot
```

**2. Create a virtual environment**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

**3. Install Python dependencies**

```bash
pip install -r requirements.txt
```

**4. Install frontend dependencies**

```bash
cd ../frontend && npm install
```

**5. Create a `.env` file** (in the project root)

```
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

API keys can also be entered directly in the in-app settings instead of the `.env` file.

## Usage

### Development (recommended)

Run the backend and the Vite dev server in two separate terminals:

```bash
# Terminal 1 – API server
cd backend && venv/bin/uvicorn app:app --host 0.0.0.0 --port 5000 --reload

# Terminal 2 – Frontend with HMR
cd frontend && npm run dev
```

Open `http://localhost:5173`. The Vite dev server proxies all API calls to the backend on port 5000 and provides hot module replacement — CSS and JS changes apply instantly without a page reload.

### Production

```bash
cd frontend && npm run build
cd ../backend && venv/bin/uvicorn app:app --host 0.0.0.0 --port 5000
```

`npm run build` bundles everything into `dist/`. The backend automatically detects the `dist/` folder and serves the optimised files instead of the raw `frontend/` sources. Open `http://localhost:5000`.

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
2. In the app: Settings → Model → Provider: *OpenAI / Compatible*
3. Click **Detect models** to auto-fill available models
4. Save - no API key or restart required

## Features

- **Multi-provider LLM** - switch between Gemini, OpenAI, Anthropic, or any local model via Ollama/LM Studio without restarting
- **User accounts** - register & login; each user has their own isolated chat history
- **Streaming responses** with typewriter effect
- **Persistent chat sessions** with sidebar for switching between conversations
- **Auto-summarization** - old messages are summarized automatically to keep context efficient
- **Syntax highlighting** - code blocks highlighted via highlight.js
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
│   ├── index.html          # Main chat UI
│   ├── login.html          # Login / register page
│   ├── vite.config.js      # Vite config (dev proxy, build output)
│   ├── package.json
│   ├── assets/
│   │   └── style.css       # Styles (dark + light theme)
│   └── modules/
│       ├── main.js         # JS entry point
│       ├── chat.js         # Streaming & message rendering
│       ├── docs.js         # Document upload & attachment
│       ├── settings.js     # Settings modal, theme, token display
│       ├── sidebar.js      # Session list & sidebar push
│       └── voice.js        # Microphone & TTS
├── dist/                   # Production build output (not tracked by git)
├── docs/                   # Uploaded documents (not tracked by git)
├── chatbot.db              # SQLite database - users & chats (not tracked by git)
├── model_config.json       # Active model/provider config (not tracked by git)
├── rag_index.json          # Document embeddings (not tracked by git)
├── system_prompt.txt       # Editable system prompt
├── .env                    # API keys & secret key (not tracked by git)
└── README.md
```

## Security

- Passwords are hashed with `werkzeug.security` (scrypt + salt) - never stored in plain text.
- The session cookie is signed with `SECRET_KEY` via Starlette's `SessionMiddleware`; use a long random value in production.
- API keys and `SECRET_KEY` live in `.env` and are excluded from version control.
- Model config (including any API key entered via the UI) is stored in `model_config.json`, which is also excluded from version control.
- `chatbot.db` contains user data and chat history - never commit it to version control.
