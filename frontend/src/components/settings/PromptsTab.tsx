import { useEffect, useState } from "react";
import {
  getPrompts,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from "../../api/prompts";
import type { Prompt } from "../../types";
import { inputCls, labelCls } from "./styles";

const textareaCls =
  "border border-border rounded-[0.6rem] text-txt-primary font-[inherit] text-[0.85rem] leading-[1.5] px-3 py-2 resize-y min-h-[100px] outline-none focus:border-accent transition-colors placeholder:text-[#444] placeholder:font-light";

export default function PromptsTab() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptBusy, setPromptBusy] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");
  const [newPromptContent, setNewPromptContent] = useState("");
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null);
  const [editPromptName, setEditPromptName] = useState("");
  const [editPromptContent, setEditPromptContent] = useState("");

  function reloadPrompts(): void {
    getPrompts().then((data) => setPrompts(data.prompts || []));
  }

  useEffect(() => {
    reloadPrompts();
  }, []);

  async function withBusy(action: () => Promise<void>): Promise<void> {
    setPromptBusy(true);
    try {
      await action();
    } finally {
      setPromptBusy(false);
    }
  }

  async function handleAddPrompt(): Promise<void> {
    const name = newPromptName.trim();
    if (!name) return;
    await withBusy(async () => {
      await createPrompt(name, newPromptContent);
      setNewPromptName("");
      setNewPromptContent("");
      reloadPrompts();
    });
  }

  function startEditPrompt(p: Prompt): void {
    setEditingPromptId(p.id);
    setEditPromptName(p.name);
    setEditPromptContent(p.content);
  }

  async function handleSaveEditPrompt(): Promise<void> {
    if (!editingPromptId || !editPromptName.trim()) return;
    await withBusy(async () => {
      await updatePrompt(
        editingPromptId,
        editPromptName.trim(),
        editPromptContent,
      );
      setEditingPromptId(null);
      reloadPrompts();
    });
  }

  async function handleDeletePrompt(id: string): Promise<void> {
    await withBusy(async () => {
      await deletePrompt(id);
      reloadPrompts();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[0.75rem] text-[#555]">
        Save reusable prompt templates and pick one per chat via the ➕ tools
        menu in the composer, instead of overwriting the single System Prompt
        above every time.
      </p>

      <div className="flex flex-col gap-2">
        {prompts.length === 0 && (
          <p className="text-[0.8rem] text-txt-dim">No saved prompts yet.</p>
        )}
        {prompts.map((p) =>
          editingPromptId === p.id ? (
            <div
              key={p.id}
              className="flex flex-col gap-2 bg-bg-base border border-accent rounded-[0.6rem] px-3 py-2"
            >
              <input
                type="text"
                value={editPromptName}
                onChange={(e) => setEditPromptName(e.target.value)}
                placeholder="Name, e.g. Code Reviewer"
                className={inputCls}
              />
              <textarea
                value={editPromptContent}
                onChange={(e) => setEditPromptContent(e.target.value)}
                placeholder="Prompt text…"
                className={`bg-bg-surface ${textareaCls}`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveEditPrompt();
                  }}
                  disabled={promptBusy || !editPromptName.trim()}
                  className="bg-accent hover:bg-accent-hover disabled:opacity-50 border-none rounded-lg text-white px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
                >
                  {promptBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingPromptId(null)}
                  disabled={promptBusy}
                  className="bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              key={p.id}
              className="flex flex-col gap-1 bg-bg-base border border-border rounded-[0.6rem] px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[0.85rem] text-txt-primary font-medium truncate">
                  {p.name}
                </span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => startEditPrompt(p)}
                    disabled={promptBusy}
                    className="text-[0.72rem] text-[#888] hover:text-txt-primary disabled:opacity-50 bg-transparent border-none cursor-pointer underline transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDeletePrompt(p.id);
                    }}
                    disabled={promptBusy}
                    className="text-[0.72rem] text-[#888] hover:text-[#e74c3c] disabled:opacity-50 bg-transparent border-none cursor-pointer underline transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
              <p className="text-[0.72rem] text-txt-dim truncate">
                {p.content || "(empty)"}
              </p>
            </div>
          ),
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <label className={labelCls}>Add prompt</label>
        <input
          type="text"
          value={newPromptName}
          onChange={(e) => setNewPromptName(e.target.value)}
          placeholder="Name, e.g. Code Reviewer"
          className={inputCls}
        />
        <textarea
          value={newPromptContent}
          onChange={(e) => setNewPromptContent(e.target.value)}
          placeholder="Prompt text…"
          className={`bg-bg-base ${textareaCls}`}
        />
        <button
          type="button"
          onClick={() => {
            void handleAddPrompt();
          }}
          disabled={promptBusy || !newPromptName.trim()}
          className="self-start bg-bg-muted hover:bg-bg-hover disabled:opacity-50 border border-border rounded-lg text-txt-primary px-3 py-[0.4rem] cursor-pointer text-[0.8rem] transition-colors"
        >
          {promptBusy ? "Adding…" : "Add prompt"}
        </button>
      </div>
    </div>
  );
}
