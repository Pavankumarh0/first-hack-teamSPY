const STOP = new Set([
  'a', 'about', 'all', 'an', 'and', 'any', 'are', 'at', 'be', 'can', 'college', 'coming',
  'could', 'do', 'does', 'event', 'events', 'for', 'from', 'give', 'happening', 'have', 'how',
  'i', 'in', 'is', 'it', 'latest', 'list', 'me', 'of', 'on', 'or', 'please', 'show', 'tell',
  'the', 'there', 'this', 'to', 'upcoming', 'what', 'when', 'where', 'which', 'who', 'why', 'with',
  'club', 'clubs', 'notice', 'notices', 'activity', 'activities',
]);

export function campusQueryTerms(q: string): string[] {
  return [...new Set(q.toLocaleLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w)))];
}

export function campusRelevance(terms: string[], title: string, body: string, id = ''): number {
  const t = title.toLocaleLowerCase();
  const b = body.toLocaleLowerCase();
  if (!terms.length) return 0;
  let matched = 0;
  let score = 0;
  for (const term of terms) {
    const titleMatch = t.includes(term);
    const bodyMatch = b.includes(term);
    const idMatch = id.toLocaleLowerCase().includes(term);
    if (titleMatch || bodyMatch || idMatch) matched++;
    if (titleMatch) score += 7;
    else if (idMatch) score += 5;
    else if (bodyMatch) score += 2;
  }
  const coverage = matched / terms.length;
  // Permit one meaningful hit for long natural questions while requiring better
  // coverage when several terms match only generic descriptive text.
  return matched && (terms.length <= 2 || coverage >= 0.25 || score >= 8) ? score + coverage : 0;
}

