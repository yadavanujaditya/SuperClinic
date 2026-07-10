import { useState } from "react";
import { TEAL, AMBER, RED } from "./theme.js";

// ─── Workflow Node Editor ─────────────────────────────────────────────────────
export function WorkflowEditor({ nodes, entryNode, onChange }) {
  const [selectedId, setSelectedId] = useState(entryNode || nodes[0]?.id || "");
  const iS = { width: "100%", padding: "7px 10px", border: "1.5px solid var(--color-border-primary)", borderRadius: 7, fontSize: 13, outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box" };
  const allIds = nodes.map(n => n.id);
  const selected = nodes.find(n => n.id === selectedId);

  const updateNode = (id, patch) => onChange({ nodes: nodes.map(n => n.id === id ? { ...n, ...patch } : n), entryNode });
  const updateOption = (nodeId, optIdx, patch) => {
    const node = nodes.find(n => n.id === nodeId);
    const opts = node.options.map((o, i) => i === optIdx ? { ...o, ...patch } : o);
    updateNode(nodeId, { options: opts });
  };
  const addOption = (nodeId) => {
    const node = nodes.find(n => n.id === nodeId);
    updateNode(nodeId, { options: [...node.options, { label: "New option", next: "END", tags: [] }] });
  };
  const removeOption = (nodeId, optIdx) => {
    const node = nodes.find(n => n.id === nodeId);
    updateNode(nodeId, { options: node.options.filter((_, i) => i !== optIdx) });
  };
  const addNode = () => {
    const id = "node_" + Date.now();
    const newNode = { id, question: "New question?", options: [{ label: "Yes", next: "END", tags: [] }, { label: "No", next: "END", tags: [] }] };
    onChange({ nodes: [...nodes, newNode], entryNode: entryNode || id });
    setSelectedId(id);
  };
  const removeNode = (id) => {
    const remaining = nodes.filter(n => n.id !== id);
    const newEntry = entryNode === id ? (remaining[0]?.id || "") : entryNode;
    onChange({ nodes: remaining, entryNode: newEntry });
    setSelectedId(remaining[0]?.id || "");
  };

  return (
    <div style={{ display: "flex", gap: 12, height: 440 }}>
      {/* Node list */}
      <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)" }}>NODES</span>
          <button data-testid="workflow-add-node-btn" onClick={addNode} style={{ fontSize: 12, fontWeight: 700, color: TEAL.primary, background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>+ Add</button>
        </div>
        {nodes.map(n => (
          <div key={n.id} data-testid={`workflow-node-${n.id}-item`} onClick={() => setSelectedId(n.id)}
            style={{ padding: "8px 10px", borderRadius: 8, cursor: "pointer", border: `1.5px solid ${selectedId === n.id ? TEAL.primary : "var(--color-border-primary)"}`,
              background: selectedId === n.id ? TEAL.bg : "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: selectedId === n.id ? TEAL.primary : "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{n.id}</span>
              {entryNode === n.id && <span style={{ fontSize: 9, background: TEAL.primary, color: "#fff", padding: "1px 5px", borderRadius: 4 }}>ENTRY</span>}
            </div>
            <p style={{ fontSize: 12, color: "var(--color-text-primary)", margin: "3px 0 0", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{n.question}</p>
          </div>
        ))}
      </div>

      {/* Node detail editor */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {!selected ? (
          <p style={{ fontSize: 13, color: "var(--color-text-secondary)", padding: 20 }}>Select a node to edit, or add a new one.</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>NODE ID</label>
                <input data-testid="workflow-node-id-input" style={{ ...iS, fontFamily: "var(--font-mono)", width: 140 }} value={selected.id}
                  onChange={e => {
                    const newId = e.target.value.replace(/\s/g, "_");
                    // Update all references to this id in other nodes' options
                    const updated = nodes.map(n => ({
                      ...n,
                      id: n.id === selected.id ? newId : n.id,
                      options: n.options.map(o => ({ ...o, next: o.next === selected.id ? newId : o.next }))
                    }));
                    onChange({ nodes: updated, entryNode: entryNode === selected.id ? newId : entryNode });
                    setSelectedId(newId);
                  }} />
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "flex-end", paddingBottom: 1 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>
                  <input data-testid="workflow-entry-node-checkbox" type="checkbox" checked={entryNode === selected.id}
                    onChange={() => onChange({ nodes, entryNode: selected.id })}
                    style={{ marginRight: 4 }} />
                  Entry node
                </label>
                <button data-testid="workflow-delete-node-btn" onClick={() => removeNode(selected.id)}
                  style={{ fontSize: 12, color: RED.primary, background: RED.bg, border: `1px solid ${RED.border}`, borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  Delete node
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>QUESTION</label>
              <textarea data-testid="workflow-question-textarea" style={{ ...iS, minHeight: 60, resize: "vertical" }} value={selected.question}
                onChange={e => updateNode(selected.id, { question: e.target.value })} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-secondary)" }}>OPTIONS ({selected.options.length})</label>
                <button data-testid="workflow-add-option-btn" onClick={() => addOption(selected.id)}
                  style={{ fontSize: 12, color: TEAL.primary, background: TEAL.bg, border: `1px solid ${TEAL.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                  + Option
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selected.options.map((opt, i) => (
                  <div key={i} style={{ background: "var(--color-background-secondary)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input data-testid={`workflow-option-${i}-label-input`} style={{ ...iS, flex: 1 }} value={opt.label} placeholder="Option label"
                        onChange={e => updateOption(selected.id, i, { label: e.target.value })} />
                      <button data-testid={`workflow-option-${i}-remove-btn`} onClick={() => removeOption(selected.id, i)}
                        style={{ fontSize: 14, color: RED.primary, background: "none", border: "none", cursor: "pointer", padding: "0 4px", flexShrink: 0 }}>✕</button>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>NEXT NODE</label>
                        <select data-testid={`workflow-option-${i}-next-select`} style={{ ...iS, borderColor: opt.next === "END" && nodes.length > 1 ? AMBER.border : undefined }} value={opt.next}
                          onChange={e => updateOption(selected.id, i, { next: e.target.value })}>
                          <option value="END">END (finish consultation)</option>
                          <option value="AI">AI (call AI for next Q)</option>
                          {allIds.filter(id => id !== selected.id).map(id => <option key={id} value={id}>{id}</option>)}
                        </select>
                        {opt.next === "END" && nodes.length > 1 && (
                          <p style={{ fontSize: 10, color: AMBER.text, margin: "3px 0 0", fontWeight: 600 }}>⚠ Unlinked — leads to END. Link to a node to continue the flow.</p>
                        )}
                      </div>
                      <div>
                        <label style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", display: "block", marginBottom: 3 }}>TAGS (comma-sep)</label>
                        <input data-testid={`workflow-option-${i}-tags-input`} style={iS} value={(opt.tags || []).join(", ")} placeholder="e.g. rigors, chills"
                          onChange={e => updateOption(selected.id, i, { tags: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })} />
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: RED.text, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input data-testid={`workflow-option-${i}-redflag-checkbox`} type="checkbox" checked={!!opt.redFlag}
                          onChange={e => updateOption(selected.id, i, { redFlag: e.target.checked })} />
                        🚨 Red flag
                      </label>
                    </div>
                    {opt.redFlag && (
                      <input data-testid={`workflow-option-${i}-redflag-message-input`} style={{ ...iS, fontSize: 12, borderColor: RED.border }} value={opt.redFlagMessage || ""}
                        placeholder="Red flag message shown to doctor…"
                        onChange={e => updateOption(selected.id, i, { redFlagMessage: e.target.value })} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
