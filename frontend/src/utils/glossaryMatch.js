const WORD_RE = /[A-Za-z0-9']+|[\u0600-\u06FF\u0750-\u077F]+/g;

export function findMatchesClient(text, glossary) {
  if (!text || !glossary || Object.keys(glossary).length === 0) return [];

  const textLower = text.toLowerCase();
  const words = new Set((text.match(WORD_RE) || []).map((w) => w.toLowerCase()));
  const matches = [];
  const seen = new Set();

  for (const [term, translation] of Object.entries(glossary)) {
    if (!term) continue;
    const termLower = term.toLowerCase();
    const isMultiword = term.trim().includes(' ');
    const found = isMultiword ? textLower.includes(termLower) : words.has(termLower);

    if (found && !seen.has(termLower)) {
      seen.add(termLower);
      matches.push({ term, translation });
    }
  }
  return matches;
}