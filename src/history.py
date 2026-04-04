import json
import os

HISTORY_FILE = os.path.join(os.path.dirname(__file__), "..", "chat_history.json")
MAX_MESSAGES = 20      # summarize when exceeding this
KEEP_AFTER_SUMMARY = 10  # keep last N messages after summarizing


def load() -> tuple[list, str]:
    """Returns (messages, summary)."""
    if not os.path.exists(HISTORY_FILE):
        return [], ""
    with open(HISTORY_FILE) as f:
        data = json.load(f)
    return data.get("messages", []), data.get("summary", "")


def save(messages: list, summary: str = "") -> None:
    with open(HISTORY_FILE, "w") as f:
        json.dump({"summary": summary, "messages": messages}, f, indent=2, ensure_ascii=False)


def build_initial_history(messages: list, summary: str) -> list:
    """Build history list for Gemini, prepending summary if present."""
    history = []
    if summary:
        history.append({"role": "user", "parts": [
            f"Here is a summary of our previous conversation:\n{summary}"
        ]})
        history.append({"role": "model", "parts": [
            "Understood. I'll keep that context in mind."
        ]})
    history.extend(messages)
    return history


def needs_summarization(messages: list) -> bool:
    return len(messages) > MAX_MESSAGES


def summarize(messages: list, model) -> tuple[list, str]:
    """Summarize the oldest messages and return (remaining_messages, new_summary)."""
    to_summarize = messages[:-KEEP_AFTER_SUMMARY]
    keep = messages[-KEEP_AFTER_SUMMARY:]

    conversation_text = "\n".join(
        f"{m['role'].capitalize()}: {m['parts'][0]}" for m in to_summarize
    )
    prompt = (
        "Summarize the following conversation concisely in 3-5 sentences. "
        "Focus on key topics, decisions, and context that would be useful to remember.\n\n"
        f"{conversation_text}"
    )
    response = model.generate_content(prompt)
    return keep, response.text
