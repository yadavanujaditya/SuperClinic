import { useState, useRef } from "react";
import { extractDocumentText } from "./ocr.js";
import { TEAL, PURPLE, RED } from "./SuperSummaryShared.jsx";

async function fileToDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

export function DocumentIntake({ docs, setDocs, provider, apiKey, isInvestigation }) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef();
  const processFile = async (file) => {
    const dataURL = await fileToDataURL(file);
    const id = "doc_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    setDocs(prev => [...prev, { id, name: file.name, dataURL, status: "processing", ocrText: "", engine: null }]);
    try {
      const r = await extractDocumentText({ image: dataURL, provider, apiKey });
      setDocs(prev => prev.map(d => d.id === id ? { ...d, status: r.failed ? "failed" : "done", ocrText: r.text, engine: r.engine, confidence: r.confidence } : d));
    } catch { setDocs(prev => prev.map(d => d.id === id ? { ...d, status: "failed", ocrText: "" } : d)); }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div onDrop={e => { e.preventDefault(); setDragging(false); Array.from(e.dataTransfer.files).forEach(processFile); }}
        onDragOver={e => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onClick={() => fileRef.current?.click()}
        data-testid={isInvestigation ? "investigation-upload-dropzone" : "clinical-doc-upload-dropzone"}
        style={{ border: `2px dashed ${dragging ? PURPLE.primary : "var(--color-border-secondary)"}`, borderRadius: 10, padding: "18px 16px", textAlign: "center", cursor: "pointer", background: dragging ? PURPLE.bg : "var(--color-background-secondary)" }}>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf" style={{ display: "none" }}
          data-testid={isInvestigation ? "investigation-file-input" : "clinical-doc-file-input"}
          onChange={e => { Array.from(e.target.files).forEach(processFile); e.target.value = ""; }} />
        <p style={{ fontSize: 22, margin: "0 0 4px" }}>🧾</p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)", margin: 0 }}>
          {isInvestigation ? "Drop lab reports / PDFs / clinical test results · click to browse" : "Drop clinical notes / prescriptions / history sheets · click to browse"}
        </p>
      </div>
      {docs.map(d => (
        <div key={d.id} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 10, display: "flex", gap: 10, alignItems: "center" }}>
          <img src={d.dataURL} alt="" style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0, background: "#ddd" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</p>
            {d.status === "processing" && <p style={{ fontSize: 11, color: PURPLE.primary, margin: 0 }}>⏳ Reading…</p>}
            {d.status === "done" && <p style={{ fontSize: 11, color: TEAL.primary, margin: 0 }}>✓ Read via {d.engine === "tesseract" ? `Tesseract ${d.confidence}%` : "AI vision"}</p>}
            {d.status === "failed" && <p style={{ fontSize: 11, color: RED.primary, margin: 0 }}>⚠ Could not read — enter manually</p>}
          </div>
          <button onClick={() => setDocs(prev => prev.filter(x => x.id !== d.id))} data-testid={`remove-doc-${d.id}`} style={{ fontSize: 13, color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer" }}>✕</button>
        </div>
      ))}
    </div>
  );
}
