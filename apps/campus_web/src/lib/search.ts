// Ranking for the campus directory, map search and the kiosk search API.

export interface Searchable {
  id: string;
  name: string;
  code?: string | null;
  room?: string | null;
  type?: string | null;
  category?: string | null;
  buildingName?: string | null;
  keywords?: string[] | null;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** 0 = no match; higher is better. Every query word must match something. */
export function scorePlace(place: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const name = normalize(place.name);
  const fields = [
    name,
    normalize(place.code ?? ''),
    normalize(place.room ?? ''),
    normalize(place.type ?? ''),
    normalize(place.category ?? ''),
    normalize(place.buildingName ?? ''),
    ...(place.keywords ?? []).map(normalize),
  ].filter(Boolean);
  const compactQuery = q.replace(/ /g, '');

  let score = 0;
  if (name === q) score += 100;
  else if (name.startsWith(q)) score += 60;
  if (fields.some((f) => f.replace(/ /g, '') === compactQuery)) score += 40; // "a201" matches room "A-201"
  for (const word of q.split(' ')) {
    const hit = fields.find((f) => f.split(' ').some((w) => w.startsWith(word)) || f.replace(/ /g, '').includes(word));
    if (!hit) return 0;
    score += hit === name ? 10 : 5;
  }
  return score;
}

export function searchPlaces<T extends Searchable>(places: T[], query: string, limit = 20): T[] {
  return places
    .map((p) => ({ p, s: scorePlace(p, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}
