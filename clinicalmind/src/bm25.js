const STOP_WORDS = new Set(["the","a","an","is","are","was","were","be","been","have","has","had","do","does","will","would","could","should","may","might","can","to","of","in","for","on","with","at","by","from","as","into","and","or","but","if","then","when","where","which","who","that","this","these","those","it","its","they","them","we","you","i","my","he","she","her","his","not","no"]);

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length > 2 && !STOP_WORDS.has(t));
}

export function chunkText(text, source) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 80);
  const chunks = [];
  let buffer = "", bufferLen = 0;
  for (const para of paragraphs) {
    const len = tokenize(para).length;
    if (bufferLen + len > 350 && buffer) {
      chunks.push({ text: buffer.trim(), tokens: tokenize(buffer), source });
      buffer = para; bufferLen = len;
    } else {
      buffer += (buffer ? "\n\n" : "") + para;
      bufferLen += len;
    }
  }
  if (buffer.trim()) chunks.push({ text: buffer.trim(), tokens: tokenize(buffer), source });
  return chunks;
}

export class BM25 {
  constructor() { this.docs = []; this.df = {}; this.avgdl = 1; }

  add(chunks) {
    this.docs.push(...chunks);
    this.df = {};
    let total = 0;
    this.docs.forEach(d => {
      total += d.tokens.length;
      new Set(d.tokens).forEach(t => { this.df[t] = (this.df[t] || 0) + 1; });
    });
    this.avgdl = this.docs.length ? total / this.docs.length : 1;
  }

  clear() { this.docs = []; this.df = {}; this.avgdl = 1; }

  search(query, k = 5) {
    if (!this.docs.length) return [];
    const qt = tokenize(query);
    if (!qt.length) return [];
    const N = this.docs.length;
    return this.docs
      .map(doc => {
        const freq = {};
        doc.tokens.forEach(t => { freq[t] = (freq[t] || 0) + 1; });
        let score = 0;
        for (const t of qt) {
          const tf = freq[t] || 0;
          if (!tf) continue;
          const idf = Math.log((N - (this.df[t] || 0) + 0.5) / ((this.df[t] || 0) + 0.5) + 1);
          score += idf * (tf * 2.5) / (tf + 1.5 * (0.25 + 0.75 * doc.tokens.length / this.avgdl));
        }
        return { ...doc, score };
      })
      .filter(x => x.score > 0.1)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

const CLINICAL_KEYWORDS = [
  "fever","pain","cough","vomiting","nausea","diarrhea","diarrhoea","headache",
  "rash","bleeding","jaundice","breathlessness","dyspnea","chills","rigors",
  "myalgia","arthralgia","vertigo","dysuria","burning","micturition","hematuria",
  "melena","hematemesis","seizure","convulsion","syncope","pallor","edema","swelling",
  "continuous","intermittent","remittent","sudden","gradual","colicky","stabbing",
  "throbbing","nocturnal","high-grade","low-grade","severe","mild",
  "acute","chronic","purulent","discharge","frequency","urgency","stridor",
  "wheeze","croup","petechiae","purpura","lymphadenopathy","hepatomegaly","splenomegaly"
];

export function extractClinicalTerms(text) {
  const lower = text.toLowerCase();
  return CLINICAL_KEYWORDS.filter(k => lower.includes(k));
}

export function buildRetrievalQuery(complaint, historyAnswers) {
  const combined = [complaint, ...historyAnswers].join(" ");
  const terms = extractClinicalTerms(combined);
  return [complaint, ...new Set(terms)].join(" ");
}

export function highlightTerms(text, query) {
  if (!query) return text;
  const terms = tokenize(query).filter(t => t.length > 3);
  if (!terms.length) return text;
  const pattern = new RegExp(`\\b(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  return text.replace(pattern, '<mark>$1</mark>');
}
