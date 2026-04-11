# ChatBot

A web-based chatbot powered by Google Gemini (gemini-2.5-flash) with user accounts, persistent chat history, voice in/out, and document RAG.

## Requirements

- Python 3.10+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/your-username/ChatBot.git
cd ChatBot
```

**2. Create a virtual environment**

```bash
python -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

**3. Install dependencies**

```bash
pip install google-generativeai google-genai python-dotenv flask pypdf edge-tts SpeechRecognition pydub
```

**4. Create a `.env` file**

```
GEMINI_API_KEY=your_gemini_api_key_here
SECRET_KEY=your_random_secret_key_here
```

Generate a secure `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Never commit `.env` — it is already listed in `.gitignore`.

## Usage

```bash
python backend/app.py
```

Open `http://localhost:5000` in your browser.

You will be redirected to the login page. Register a new account and you're ready to chat.

## Features

- **User accounts** — register & login with username / password; each user has their own isolated chat history
- **Streaming responses** with typewriter effect
- **Persistent chat sessions** with sidebar for switching between conversations
- **Auto-summarization** — old messages are summarized automatically to keep context efficient
- **Voice input** — click the microphone button (Chrome / Edge only)
- **Voice output** — toggle via 🔇 button (powered by [edge-tts](https://github.com/rany2/edge-tts))
- **Document RAG** — upload `.txt`, `.md`, or `.pdf` files via button or drag & drop; the bot retrieves relevant passages automatically
- **Configurable system prompt** — via the ⚙️ settings button
- **Token usage indicator** — ring graph in the header
- **Light / dark theme** toggle

## Project Structure

```
ChatBot/
├── backend/
│   ├── app.py              # Flask app: setup & blueprint registration
│   ├── auth_store.py       # User storage (users.json, password hashing)
│   ├── history.py          # Per-user session persistence & summarization
│   ├── rag.py              # Document indexing & retrieval
│   ├── state.py            # Per-user in-memory chat state
│   ├── utils.py            # Shared helpers (login_required decorator)
│   └── routes/
│       ├── auth.py         # /login  /register  /logout  /me
│       ├── chat.py         # /chat (streaming)
│       ├── config.py       # /config
│       ├── docs.py         # /docs  /docs/upload  /docs/delete
│       ├── sessions.py     # /sessions  /sessions/new  /sessions/<id>
│       └── voice.py        # /tts  /stt
├── frontend/
│   ├── index.html          # Main chat UI
│   ├── login.html          # Login / register page
│   ├── assets/
│   │   └── style.css       # Styles (dark + light theme)
│   └── modules/
│       ├── main.js         # JS entry point
│       ├── chat.js         # Streaming & message rendering
│       ├── docs.js         # Document modal
│       ├── settings.js     # System prompt modal & token display
│       ├── sidebar.js      # Session list, logout
│       └── voice.js        # Microphone & TTS
├── chats/                  # Per-user chat sessions (not tracked by git)
├── docs/                   # Uploaded documents (not tracked by git)
├── users.json              # User accounts (not tracked by git)
├── system_prompt.txt       # Editable system prompt
├── .env                    # API key & secret key (not tracked by git)
└── README.md
```

## Security

- Passwords are hashed with `werkzeug.security` (PBKDF2 + salt) — never stored in plain text.
- The Flask session is signed with `SECRET_KEY`; use a long random value in production.
- `GEMINI_API_KEY` and `SECRET_KEY` live in `.env` and are excluded from version control.
- If you accidentally expose your Gemini key, regenerate it at [Google AI Studio](https://aistudio.google.com/app/apikey).
