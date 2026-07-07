// ─── OCR pipeline: Tesseract.js (offline) with AI-vision fallback for accuracy ──
import { callVisionOCR } from "./api.js";

let tesseractReady = null;
function initTesseract() {
  if (window.Tesseract) return Promise.resolve();
  if (tesseractReady) return tesseractReady;
  tesseractReady = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js";
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  return tesseractReady;
}

// Runs Tesseract OCR on an image (dataURL, Blob, or File). Returns { text, confidence } (confidence 0-100).
async function runTesseract(image, onProgress) {
  await initTesseract();
  const result = await window.Tesseract.recognize(image, "eng", {
    logger: m => { if (m.status === "recognizing text" && onProgress) onProgress(Math.round(m.progress * 100)); },
  });
  return { text: result.data.text || "", confidence: result.data.confidence ?? 0 };
}

// Providers whose API supports reading an image directly (vision). DeepSeek's chat model does not.
const VISION_CAPABLE = ["claude", "gemini", "openai"];

// Low confidence threshold below which we treat Tesseract's result as unreliable
const TESSERACT_MIN_CONFIDENCE = 55;
const TESSERACT_MIN_CHARS = 20;

// Full pipeline: try Tesseract first; fall back to AI vision if it fails/low-confidence and a
// vision-capable provider+key is available; otherwise flag for manual entry.
export async function extractDocumentText({ image, provider, apiKey, onProgress }) {
  let tesseractResult = null;
  try {
    tesseractResult = await runTesseract(image, onProgress);
  } catch (e) {
    tesseractResult = { text: "", confidence: 0 };
  }

  const tesseractGood = tesseractResult.text.trim().length >= TESSERACT_MIN_CHARS &&
    tesseractResult.confidence >= TESSERACT_MIN_CONFIDENCE;

  if (tesseractGood) {
    return { text: tesseractResult.text, engine: "tesseract", confidence: tesseractResult.confidence, needsReview: true };
  }

  // Tesseract failed or looks unreliable — try AI vision if possible
  if (apiKey && VISION_CAPABLE.includes(provider)) {
    try {
      const text = await callVisionOCR(image, provider, apiKey);
      if (text && text.trim().length >= TESSERACT_MIN_CHARS) {
        return { text, engine: "ai-vision", confidence: null, needsReview: true };
      }
    } catch (e) { /* fall through to manual */ }
  }

  // Nothing worked reliably — surface whatever Tesseract got (may be empty) and flag for manual entry
  return { text: tesseractResult.text, engine: "failed", confidence: tesseractResult.confidence, needsReview: true, failed: true };
}

// Extract structured field values from OCR'd raw text using simple keyword-proximity heuristics.
// Works with no API key; every value returned is meant to be shown as "unverified" until confirmed.
export function extractFieldsHeuristic(rawText, fields) {
  const lower = rawText.toLowerCase();
  const out = {};
  for (const f of fields) {
    const hints = f.ocrHints || [f.label.toLowerCase()];
    for (const hint of hints) {
      const idx = lower.indexOf(hint.toLowerCase());
      if (idx === -1) continue;
      const windowText = rawText.slice(idx, idx + hint.length + 40);
      const match = windowText.match(/[:\-]?\s*([\d]+\.?\d*)/);
      if (match) { out[f.key] = match[1]; break; }
    }
  }
  return out;
}
