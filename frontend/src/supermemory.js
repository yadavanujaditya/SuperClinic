const API_URL = import.meta.env.REACT_APP_BACKEND_URL;

export async function listBooks() {
  const res = await fetch(`${API_URL}/api/supermemory/books`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your books");
  return res.json();
}

export async function uploadBook(file, numPages) {
  const form = new FormData();
  form.append("file", file);
  form.append("num_pages", numPages || 0);
  const res = await fetch(`${API_URL}/api/supermemory/books`, { method: "POST", credentials: "include", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function downloadBook(bookId) {
  const res = await fetch(`${API_URL}/api/supermemory/books/${bookId}/download`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not fetch book");
  return res.arrayBuffer();
}

export async function deleteBook(bookId) {
  await fetch(`${API_URL}/api/supermemory/books/${bookId}`, { method: "DELETE", credentials: "include" });
}

export async function listTags() {
  const res = await fetch(`${API_URL}/api/supermemory/tags`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load your tags");
  return res.json();
}

export async function upsertTagSource(id, label, source) {
  await fetch(`${API_URL}/api/supermemory/tags`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, label, source }),
  });
}

export async function removeTagSourceRemote(tagId, docId, page) {
  await fetch(`${API_URL}/api/supermemory/tags/${tagId}/source`, {
    method: "DELETE", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doc_id: docId, page }),
  });
}

export async function deleteTagRemote(tagId) {
  await fetch(`${API_URL}/api/supermemory/tags/${tagId}`, { method: "DELETE", credentials: "include" });
}
