const dropOverlay     = document.getElementById("drop-overlay");
const docsModal       = document.getElementById("docs-modal");
const docsClose       = document.getElementById("docs-close");
const docsList        = document.getElementById("docs-list");
const uploadBtn       = document.getElementById("upload-btn");
const uploadInput     = document.getElementById("upload-input");
const uploadStatus    = document.getElementById("upload-status");
const attachmentBar   = document.getElementById("attachment-bar");
const attachmentName  = document.getElementById("attachment-name");
const attachmentExt   = document.getElementById("attachment-ext");
const attachmentRemove = document.getElementById("attachment-remove");

const ALLOWED = [".txt", ".md", ".pdf"];

export async function loadDocs() {
  const res  = await fetch("/docs");
  const data = await res.json();
  docsList.innerHTML = "";
  if (!data.files.length) {
    docsList.innerHTML = "<li class='empty'>No documents indexed yet.</li>";
    return;
  }
  for (const file of data.files) {
    const li  = document.createElement("li");
    li.textContent = file;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Remove";
    btn.addEventListener("click", async () => {
      await fetch("/docs/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file }),
      });
      loadDocs();
    });
    li.appendChild(btn);
    docsList.appendChild(li);
  }
}

async function uploadFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED.includes(ext)) {
    uploadStatus.textContent = `Unsupported type. Allowed: ${ALLOWED.join(", ")}`;
    setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
    return false;
  }
  attachmentName.textContent = file.name;
  attachmentExt.textContent = file.name.split('.').pop().toUpperCase();
  attachmentBar.hidden = false;
  uploadStatus.textContent = "Indexing…";
  const form = new FormData();
  form.append("file", file);
  const res  = await fetch("/docs/upload", { method: "POST", body: form });
  const data = await res.json();
  if (data.error) {
    uploadStatus.textContent = `Error: ${data.error}`;
    attachmentBar.hidden = true;
  } else {
    uploadStatus.textContent = `✓ ${data.chunks} chunks indexed`;
    loadDocs();
  }
  setTimeout(() => { uploadStatus.textContent = ""; }, 3000);
  return !data.error;
}

// Upload button
uploadBtn.addEventListener("click", () => uploadInput.click());
docsClose.addEventListener("click", () => { docsModal.hidden = true; });

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files[0];
  if (!file) return;
  await uploadFile(file);
  uploadInput.value = "";
});

// Attachment bar
attachmentRemove.addEventListener("click", async () => {
  const name = attachmentName.textContent;
  attachmentBar.hidden = true;
  await fetch("/docs/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file: name }),
  });
  loadDocs();
});

// Drag & drop
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer.types.includes("Files")) return;
  dragCounter++;
  dropOverlay.hidden = false;
});

document.addEventListener("dragleave", () => {
  dragCounter--;
  if (dragCounter <= 0) { dragCounter = 0; dropOverlay.hidden = true; }
});

document.addEventListener("dragover", (e) => e.preventDefault());

document.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropOverlay.hidden = true;
  const file = e.dataTransfer.files[0];
  if (file) await uploadFile(file);
});
