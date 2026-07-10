// ─── PDF utilities (pdf.js wrappers) — shared across DocumentVault, ComplaintEditor, LibraryScreen, PDFReader ───

export async function initPDFJS() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

export async function openPDFDoc(buf) {
  await initPDFJS();
  // slice(0) copies the ArrayBuffer so PDF.js can transfer it without detaching the original
  return window.pdfjsLib.getDocument({ data: buf.slice(0) }).promise;
}

export async function renderPDFPage(pdfDoc, pageNum, canvas, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
}

export async function extractPageText(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const content = await page.getTextContent();
  return content.items.map(it => it.str).join(" ");
}

export async function extractAllText(buf) {
  const pdf = await openPDFDoc(buf);
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) text += await extractPageText(pdf, i) + "\n\n";
  return text;
}

// Render a page to an offscreen canvas and return it as a data URL (used to snapshot pages for the Tag Library)
export async function renderPageToDataURL(pdfDoc, pageNum, scale = 1.5) {
  const page = await pdfDoc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = vp.width; canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}

// Crop a rectangle (in the same pixel space as `canvas`) out of an already-rendered canvas
export function cropCanvasToDataURL(canvas, rect) {
  const off = document.createElement("canvas");
  off.width = Math.max(1, Math.round(rect.w)); off.height = Math.max(1, Math.round(rect.h));
  off.getContext("2d").drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, off.width, off.height);
  return off.toDataURL("image/png");
}

// Extract only the text whose glyphs fall inside `rect` (in the same pixel space as a page rendered at `scale`)
export async function extractRegionText(pdfDoc, pageNum, scale, rect) {
  const page = await pdfDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const content = await page.getTextContent();
  const items = content.items.map(it => {
    const [x, yBottom] = viewport.convertToViewportPoint(it.transform[4], it.transform[5]);
    const h = Math.hypot(it.transform[2], it.transform[3]) || (it.height || 10) * scale;
    const w = (it.width || 0) * scale;
    return { str: it.str, x, y: yBottom - h, w, h };
  });
  const overlaps = items.filter(it =>
    it.x < rect.x + rect.w && it.x + it.w > rect.x && it.y < rect.y + rect.h && it.y + it.h > rect.y
  );
  overlaps.sort((a, b) => a.y - b.y || a.x - b.x);
  return overlaps.map(it => it.str).join(" ");
}

// Resolve the embedded outline/bookmarks (chapters/sections) into a flat list of { title, page, depth }
export async function getPDFChapters(pdfDoc) {
  let outline;
  try { outline = await pdfDoc.getOutline(); } catch { return []; }
  if (!outline || !outline.length) return [];
  const resolvePage = async (item) => {
    try {
      let dest = item.dest;
      if (typeof dest === "string") dest = await pdfDoc.getDestination(dest);
      if (Array.isArray(dest) && dest[0]) return (await pdfDoc.getPageIndex(dest[0])) + 1;
    } catch {}
    return null;
  };
  const flatten = async (items, depth) => {
    const out = [];
    for (const item of items) {
      out.push({ title: item.title, page: await resolvePage(item), depth });
      if (item.items?.length) out.push(...await flatten(item.items, depth + 1));
    }
    return out;
  };
  return flatten(outline, 0);
}
