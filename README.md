# ChatBot

A simple terminal-based chatbot powered by Google Gemini (gemini-2.5-flash).

## Requirements

- Python 3.8+
- A [Google Gemini API key](https://aistudio.google.com/app/apikey) 

## Setup

**1. Clone the repository**

```bash
git clone https://github.com/your-username/ChatBot.git
cd ChatBot
```

**2. Create a virtual environment (recommended)**

```bash
python -m venv venv
source venv/bin/activate   # Linux / macOS
venv\Scripts\activate      # Windows
```

**3. Install dependencies**

```bash
pip install google-generativeai google-genai python-dotenv flask pypdf edge-tts
```

**4. Create a `.env` file**

Create a file named `.env` in the project root and add your API key:

```
GEMINI_API_KEY=your_api_key_here
```

Never commit this file — it is already listed in `.gitignore`.

## Usage

### Terminal

```bash
python src/chatbot.py
```

Type your message and press Enter. To exit, type `end`, `exit`, or `quit`.

### Web Interface

```bash
python src/app.py
```

Then open your browser and go to `http://localhost:5000`.

The web interface uses Flask and serves a chat UI where you can talk to the bot directly in the browser.

**Features:**
- Streaming responses with typewriter effect
- Voice input (click microphone button — Chrome/Edge only)
- Voice output via [edge-tts](https://github.com/rany2/edge-tts) (Microsoft Neural Voices, requires internet)
- Document upload for RAG (txt, md, pdf) via button or drag & drop
- Persistent conversation history with auto-summarization
- Configurable system prompt via the ⚙️ settings button
- Token usage indicator in the header

## Project Structure

```
ChatBot/
├── src/
│   ├── app.py              # Flask web server
│   ├── chatbot.py          # Terminal chatbot
│   ├── history.py          # Conversation persistence & summarization
│   └── rag.py              # RAG: document indexing & retrieval
├── templates/
│   ├── index.html          # Chat UI
│   ├── style.css           # Styles
│   └── chat.js             # Frontend logic
├── docs/                   # Uploaded documents (not tracked by git)
├── system_prompt.txt       # Editable system prompt
├── .env                    # Your API key (not tracked by git)
├── .gitignore
└── README.md
```

## Using a Different AI Provider

This chatbot uses Google Gemini by default, but you can swap it out for another provider (e.g. OpenAI, Anthropic, Mistral). You will need to:

1. Install the corresponding SDK (e.g. `pip install openai`)
2. Replace the `google.generativeai` import and API calls in `chatbot.py` with the provider's SDK
3. Update the environment variable name in `.env` accordingly (e.g. `OPENAI_API_KEY`)

The core chat loop logic stays the same — only the model initialization and `send_message` call need to be adapted.

## Security

- The API key is stored in `.env` and never hardcoded in the source.
- `.env` is excluded from version control via `.gitignore`.
- If you accidentally expose your key, regenerate it immediately at [Google AI Studio](https://aistudio.google.com/app/apikey).
