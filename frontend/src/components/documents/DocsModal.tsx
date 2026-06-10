import { useState, useEffect, useRef } from "react";
import { getDocs, uploadDoc, deleteDoc } from "../../api/docs";

const ALLOWED = [".txt", ".md", ".pdf"];

interface DocsModalProps {
  onClose: () => void;
  onFileAttached?: (name: string) => void;
}

export default function DocsModal({ onClose, onFileAttached }: DocsModalProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadDocs();
  }, []);

  async function loadDocs(): Promise<void> {
    const data = await getDocs();
    setFiles(data.files || []);
  }

  async function handleUpload(file: File): Promise<void> {
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED.includes(ext)) {
      setStatus(`Unsupported type. Allowed: ${ALLOWED.join(", ")}`);
      setTimeout(() => setStatus(""), 3000);
      return;
    }
    setStatus("Indexing…");
    const data = await uploadDoc(file);
    if (data.error) {
      setStatus(`Error: ${data.error}`);
    } else {
      setStatus(`✓ ${data.chunks} chunks indexed`);
      onFileAttached?.(file.name);
      void loadDocs();
    }
    setTimeout(() => setStatus(""), 3000);
  }

  async function handleDelete(filename: string): Promise<void> {
    await deleteDoc(filename);
    void loadDocs();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const file = e.target.files?.[0];
    if (file) void handleUpload(file);
    e.target.value = "";
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-bg-surface border border-border rounded-[1rem] p-6 w-[90%] max-w-[480px] flex flex-col gap-4">
        <h2 className="text-[1rem] font-semibold">Documents</h2>

        <ul className="list-none flex flex-col gap-[0.4rem] max-h-[220px] overflow-y-auto">
          {!files.length ? (
            <li className="text-txt-dim text-[0.85rem] text-center py-2">
              No documents indexed yet.
            </li>
          ) : (
            files.map((f) => (
              <li
                key={f}
                className="flex items-center justify-between bg-bg-base border border-[#2a2a2a] rounded-lg px-3 py-[0.45rem] text-[0.875rem] text-[#ccc]"
              >
                <span>{f}</span>
                <button
                  onClick={() => {
                    void handleDelete(f);
                  }}
                  className="bg-transparent border-none text-[#555] cursor-pointer text-[1rem] leading-none px-[0.2rem] hover:text-[#c0392b] transition-colors"
                  title="Remove"
                >
                  ✕
                </button>
              </li>
            ))
          )}
        </ul>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center border border-dashed border-border rounded-lg px-3 py-[0.65rem] text-[0.875rem] text-txt-dim cursor-pointer hover:border-accent hover:text-txt-muted transition-all"
        >
          + Upload document
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {status && (
          <p className="text-[0.8rem] text-txt-dim min-h-4 text-center">
            {status}
          </p>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="bg-[#2a2a2a] hover:bg-[#333] border-none rounded-lg text-txt-primary px-4 py-2 cursor-pointer text-[0.9rem] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
