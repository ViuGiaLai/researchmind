export interface DebateSection {
  text: string;
  citations: { source: string; page?: number | null }[];
}

export interface ParsedDebate {
  aiA?: {
    main?: string;
    rebuttal?: string;
    citations: { source: string; page?: number | null }[];
  };
  aiB?: {
    main?: string;
    rebuttal?: string;
    citations: { source: string; page?: number | null }[];
  };
  conclusion?: string;
  suggestions: string[];
  raw: string;
}

const citationRegex = /\[([^\],]+?)(?:,\s*(?:page|trang)\s*(\d+))?\]/gi;

function extractCitations(text: string) {
  const citations: { source: string; page?: number | null }[] = [];
  let m;
  while ((m = citationRegex.exec(text)) !== null) {
    citations.push({ source: m[1].trim(), page: m[2] ? parseInt(m[2], 10) : null });
  }
  return citations;
}

export function parseDebate(raw: string): ParsedDebate {
  const res: ParsedDebate = { suggestions: [], raw };
  if (!raw) return res;

  // Normalize line endings and trim
  const text = raw.replace(/\r\n?/g, "\n").trim();

  // Find sections by headings
  const aiARegex = /(AI A\s*\(.*?\)\s*:)\s*/i;
  const aiBRegex = /(AI B\s*\(.*?\)\s*:)\s*/i;
  const conclusionRegex = /(^|\n)(?:Kết luận|Conclusion)\s*:\s*/i;
  const suggestionsRegex = /(^|\n)3\s*(?:Đề xuất|Suggestions)\s*:\s*/i;

  // Split into segments
  let aiAIndex = text.search(aiARegex);
  let aiBIndex = text.search(aiBRegex);
  let conclusionIndex = text.search(conclusionRegex);
  let suggestionsIndex = text.search(suggestionsRegex);

  // Fallback: try "AI A (Ủng hộ):" exact
  if (aiAIndex === -1) aiAIndex = text.search(/AI A \(Ủng hộ\)\s*:/i);
  if (aiBIndex === -1) aiBIndex = text.search(/AI B \(Phản biện\)\s*:/i);

  // Helper to get substring safely
  const sliceSafe = (start: number, end?: number) => (start >= 0 ? text.slice(start, end).trim() : "");



  // Extract AI A block
  if (aiAIndex >= 0) {
    const start = aiAIndex;
    const end = aiBIndex > aiAIndex ? aiBIndex : conclusionIndex > aiAIndex ? conclusionIndex : suggestionsIndex > aiAIndex ? suggestionsIndex : undefined;
    const block = sliceSafe(start, end);
    const lines = block.split('\n').map(l => l.trim()).filter(l=>l.length>0);
    // Find lines starting with bullet • or -
    const bullets = lines.filter(l => l.startsWith('•') || l.startsWith('-') || /^\d+\./.test(l));
    const main = bullets[0] ? bullets[0].replace(/^\s*(?:•|-)\s*/, '') : lines.slice(1,2).join(' ');
    const rebut = bullets[1] ? bullets[1].replace(/^\s*(?:•|-)\s*/, '') : lines.slice(2,3).join(' ');
    res.aiA = { main: main || undefined, rebuttal: rebut || undefined, citations: extractCitations(block) };
  }

  // Extract AI B block
  if (aiBIndex >= 0) {
    const start = aiBIndex;
    const end = conclusionIndex > aiBIndex ? conclusionIndex : suggestionsIndex > aiBIndex ? suggestionsIndex : undefined;
    const block = sliceSafe(start, end);
    const lines = block.split('\n').map(l => l.trim()).filter(l=>l.length>0);
    const bullets = lines.filter(l => l.startsWith('•') || l.startsWith('-') || /^\d+\./.test(l));
    const main = bullets[0] ? bullets[0].replace(/^\s*(?:•|-)\s*/, '') : lines.slice(1,2).join(' ');
    const rebut = bullets[1] ? bullets[1].replace(/^\s*(?:•|-)\s*/, '') : lines.slice(2,3).join(' ');
    res.aiB = { main: main || undefined, rebuttal: rebut || undefined, citations: extractCitations(block) };
  }

  // Conclusion
  if (conclusionIndex >= 0) {
    const start = text.slice(conclusionIndex).indexOf(':');
    // After 'Kết luận:' take the rest until suggestionsIndex
    let endIdx = suggestionsIndex > conclusionIndex ? suggestionsIndex : undefined;
    const conclText = sliceSafe(conclusionIndex + (start >= 0 ? start + 1 : 0), endIdx);
    res.conclusion = conclText.split('\n').map(l=>l.trim()).filter(l=>l.length>0).join(' ');
  }

  // Suggestions
  if (suggestionsIndex >= 0) {
    const start = suggestionsIndex;
    const block = sliceSafe(start);
    // Capture numbered lines 1., 2., 3. or bullets under suggestions
    const lines = block.split('\n').map(l => l.trim()).filter(l=>l.length>0);
    const suggestions: string[] = [];
    for (const l of lines) {
      const m = l.match(/^\d+\.\s*(.*)$/);
      if (m && m[1]) suggestions.push(m[1].trim());
      else if (l.startsWith('•') || l.startsWith('-')) suggestions.push(l.replace(/^\s*(?:•|-)\s*/, ''));
    }
    // Ensure only 3 suggestions
    res.suggestions = suggestions.slice(0,3);
  }

  // Fallback: if nothing parsed, keep raw as single suggestion
  if (!res.aiA && !res.aiB && !res.conclusion && res.suggestions.length === 0) {
    res.suggestions = [];
  }

  return res;
}
