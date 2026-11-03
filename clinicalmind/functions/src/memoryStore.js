// ─── Firestore-backed memory directory for Claude's memory tool ───────────────
// Each doctor has their own /memories directory stored at
//   users/{uid}/memories/{encodeURIComponent(path)} → { path, content, updatedAt, updatedBy }
// Implements the memory tool commands: view, create, str_replace, insert, delete, rename.
// Paths are validated (must live under /memories, no traversal). Writes are
// de-identified, size-limited, and can be disabled (read-only mode for drafting).
import { FieldValue } from "firebase-admin/firestore";
import { deidentify } from "./deidentify.js";

export const ROOT = "/memories";
export const MAX_FILE_CHARS = 24_000;
export const MAX_FILES = 80;

export class MemoryError extends Error {}

export function normalizePath(p) {
  if (typeof p !== "string" || !p.trim()) throw new MemoryError("path is required");
  let path = p.trim().replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!path.startsWith("/")) path = "/" + path;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  const parts = path.split("/").slice(1);
  if (parts.some(s => s === ".." || s === ".")) throw new MemoryError(`invalid path: ${p}`);
  if (path !== ROOT && !path.startsWith(ROOT + "/")) throw new MemoryError(`path must be inside ${ROOT}: ${p}`);
  if (path.length > 200) throw new MemoryError("path too long");
  if (!/^[\w\-./]+$/.test(path)) throw new MemoryError(`path has unsupported characters: ${p} (use letters, numbers, - _ . and no spaces)`);
  return path;
}

const docIdFor = (path) => encodeURIComponent(path);
const numbered = (text, start = 1) =>
  text.split("\n").map((l, i) => `${String(i + start).padStart(6)}\t${l}`).join("\n");

export class FirestoreMemoryStore {
  constructor(db, uid, { readOnly = false, actor = "agent" } = {}) {
    this.col = db.collection("users").doc(uid).collection("memories");
    this.readOnly = readOnly;
    this.actor = actor;
    this.readPaths = new Set(); // files viewed this run (used to verify citations)
    this.changes = [];          // audit log of writes this run
  }

  async listAll() {
    const snap = await this.col.get();
    return snap.docs.map(d => d.data()).filter(d => typeof d.path === "string").sort((a, b) => a.path.localeCompare(b.path));
  }

  async get(path) {
    const s = await this.col.doc(docIdFor(path)).get();
    return s.exists ? s.data() : null;
  }

  async #put(path, content) {
    if (this.readOnly) throw new MemoryError("memory is read-only while drafting; only `view` is allowed");
    if (content.length > MAX_FILE_CHARS) throw new MemoryError(`file too large (${content.length} chars, max ${MAX_FILE_CHARS}); split it or condense`);
    const { text, removed } = deidentify(content);
    const existing = await this.get(path);
    if (!existing) {
      const count = (await this.col.count().get()).data().count;
      if (count >= MAX_FILES) throw new MemoryError(`memory is full (${MAX_FILES} files); merge or delete files first`);
    }
    await this.col.doc(docIdFor(path)).set({ path, content: text, updatedAt: FieldValue.serverTimestamp(), updatedBy: this.actor });
    this.changes.push({ op: existing ? "update" : "create", path });
    return removed ? ` (note: ${removed} patient identifier(s) were removed — never store identifiers in memory)` : "";
  }

  // Dispatch one memory tool call. Returns a string result; throws MemoryError for tool errors.
  async execute(input) {
    const cmd = input?.command;
    switch (cmd) {
      case "view": return this.view(input.path, input.view_range);
      case "create": return this.create(input.path, input.file_text);
      case "str_replace": return this.strReplace(input.path, input.old_str, input.new_str);
      case "insert": return this.insert(input.path, input.insert_line, input.insert_text);
      case "delete": return this.delete(input.path);
      case "rename": return this.rename(input.old_path, input.new_path);
      default: throw new MemoryError(`unknown memory command: ${cmd}`);
    }
  }

  async view(p, viewRange) {
    const path = normalizePath(p);
    const file = path === ROOT ? null : await this.get(path);
    if (file) {
      this.readPaths.add(path);
      const lines = file.content.split("\n");
      if (Array.isArray(viewRange) && viewRange.length === 2) {
        const [a, b] = viewRange;
        const end = b === -1 ? lines.length : Math.min(b, lines.length);
        if (a < 1 || a > lines.length || end < a) throw new MemoryError(`invalid view_range ${JSON.stringify(viewRange)} for file with ${lines.length} lines`);
        return numbered(lines.slice(a - 1, end).join("\n"), a);
      }
      return numbered(file.content);
    }
    // Directory listing
    const prefix = path === ROOT ? ROOT + "/" : path + "/";
    const files = (await this.listAll()).filter(f => f.path.startsWith(prefix));
    if (!files.length && path !== ROOT) throw new MemoryError(`The path ${path} does not exist.`);
    if (!files.length) return `Directory ${ROOT} is empty.`;
    return `Files in ${path}:\n` + files.map(f => `${f.content.length}\t${f.path}`).join("\n");
  }

  async create(p, fileText) {
    const path = normalizePath(p);
    if (path === ROOT) throw new MemoryError("cannot create a file at the root path");
    if (typeof fileText !== "string") throw new MemoryError("file_text is required");
    const note = await this.#put(path, fileText);
    return `File created successfully at: ${path}${note}`;
  }

  async strReplace(p, oldStr, newStr) {
    const path = normalizePath(p);
    const file = await this.get(path);
    if (!file) throw new MemoryError(`The path ${path} does not exist.`);
    if (typeof oldStr !== "string" || !oldStr) throw new MemoryError("old_str is required");
    const count = file.content.split(oldStr).length - 1;
    if (count === 0) throw new MemoryError(`No replacement was performed, old_str did not appear verbatim in ${path}.`);
    if (count > 1) throw new MemoryError(`No replacement was performed. Multiple occurrences of old_str in ${path}; make it unique.`);
    const note = await this.#put(path, file.content.replace(oldStr, newStr ?? ""));
    return `The memory file ${path} has been edited.${note}`;
  }

  async insert(p, line, text) {
    const path = normalizePath(p);
    const file = await this.get(path);
    if (!file) throw new MemoryError(`The path ${path} does not exist.`);
    const lines = file.content.split("\n");
    if (!Number.isInteger(line) || line < 0 || line > lines.length) throw new MemoryError(`invalid insert_line ${line}; must be between 0 and ${lines.length}`);
    lines.splice(line, 0, ...String(text ?? "").split("\n"));
    const note = await this.#put(path, lines.join("\n"));
    return `The memory file ${path} has been edited.${note}`;
  }

  async delete(p) {
    if (this.readOnly) throw new MemoryError("memory is read-only while drafting");
    const path = normalizePath(p);
    if (path === ROOT) throw new MemoryError("cannot delete the memory root");
    const file = await this.get(path);
    if (file) {
      await this.col.doc(docIdFor(path)).delete();
      this.changes.push({ op: "delete", path });
      return `Successfully deleted ${path}`;
    }
    const inDir = (await this.listAll()).filter(f => f.path.startsWith(path + "/"));
    if (!inDir.length) throw new MemoryError(`The path ${path} does not exist.`);
    const batch = this.col.firestore.batch();
    inDir.forEach(f => batch.delete(this.col.doc(docIdFor(f.path))));
    await batch.commit();
    inDir.forEach(f => this.changes.push({ op: "delete", path: f.path }));
    return `Successfully deleted ${path}`;
  }

  async rename(oldP, newP) {
    if (this.readOnly) throw new MemoryError("memory is read-only while drafting");
    const from = normalizePath(oldP), to = normalizePath(newP);
    const file = await this.get(from);
    if (!file) throw new MemoryError(`The path ${from} does not exist.`);
    if (await this.get(to)) throw new MemoryError(`The destination ${to} already exists.`);
    await this.col.doc(docIdFor(to)).set({ ...file, path: to, updatedAt: FieldValue.serverTimestamp(), updatedBy: this.actor });
    await this.col.doc(docIdFor(from)).delete();
    this.changes.push({ op: "rename", path: `${from} → ${to}` });
    return `Successfully renamed ${from} to ${to}`;
  }
}
