const chat = document.getElementById("chat");
const input = document.getElementById("user-input");
const btn = document.getElementById("send-btn");

function addBubble(text, role) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
  return div;
}

async function sendMessage() {
  const text = input.value.trim();
  if (!text) return;

  addBubble(text, "user");
  input.value = "";
  input.style.height = "44px";
  btn.disabled = true;

  const bubble = addBubble("", "bot");

  try {
    const res = await fetch("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const chunk = JSON.parse(line.slice(6));
        if (chunk === "[DONE]") {
          bubble.innerHTML = marked.parse(bubble.textContent);
          break;
        }
        if (chunk.startsWith("[ERROR]")) {
          bubble.textContent = chunk.slice(7);
          break;
        }
        for (const char of chunk) {
          bubble.textContent += char;
          chat.scrollTop = chat.scrollHeight;
          await new Promise(r => setTimeout(r, 10));
        }
      }
    }
  } catch {
    bubble.textContent = "Connection error.";
  }

  btn.disabled = false;
  input.focus();
}

btn.addEventListener("click", sendMessage);

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

input.addEventListener("input", () => {
  input.style.height = "44px";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});
