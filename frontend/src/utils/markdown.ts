/**
 * Render markdown to HTML using marked + hljs (loaded from CDN).
 * Returns HTML string.
 */
export function renderMarkdown(text: string): string {
  if (typeof marked === "undefined") return text;
  try {
    return marked.parse(text);
  } catch {
    return text;
  }
}

/**
 * After inserting markdown HTML into the DOM, call this on the container
 * element to add syntax highlighting and copy buttons to code blocks.
 */
export function decorateCodeBlocks(container: HTMLElement): void {
  if (!container) return;
  container.querySelectorAll("pre").forEach((pre) => {
    if (pre.parentElement?.classList.contains("code-block-wrap")) return;

    const codeEl = pre.querySelector("code");
    if (codeEl && typeof hljs !== "undefined") {
      hljs.highlightElement(codeEl);
    }

    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.replaceWith(wrap);
    wrap.appendChild(pre);

    const btn = document.createElement("button");
    btn.className = "code-copy-btn";
    btn.title = "Copy";
    btn.textContent = "⧉";
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(pre.innerText);
        const orig = btn.textContent;
        btn.textContent = "✓";
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      } catch {
        /* silent */
      }
    });
    wrap.appendChild(btn);
  });
}
