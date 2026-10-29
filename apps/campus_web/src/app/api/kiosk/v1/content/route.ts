import { Timestamp, type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii, campusData, type PlaceRow } from '@/lib/server/campus';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';
import { campusQueryTerms, campusRelevance } from '@/lib/kiosk-search';

type RawRecord = { id: string; data: DocumentData };
type KnowledgeChunk = RawRecord & { chunkTitle: string; chunkBody: string };
type RecordIndex = { at: number; places: PlaceRow[]; clubs: RawRecord[]; events: RawRecord[]; notices: RawRecord[]; knowledge: KnowledgeChunk[] };
type Hit = { kind: string; id: string; title: string; summary: string; score: number; updatedAt: string | null; isSample: boolean; url: string };

const INDEX_TTL_MS = 45_000;
const PAGE_SIZE = 250;
let indexCache: RecordIndex | null = null;
let indexLoad: Promise<RecordIndex> | null = null;

/** Read only published, kiosk-safe records; cache the bounded campus corpus between questions. */
async function loadIndex(): Promise<RecordIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache;
  if (indexLoad) return indexLoad;
  indexLoad = (async () => {
    const { db } = adminServices();
    const [campus, clubs, events, notices, knowledge] = await Promise.all([
      campusData(),
      readAll(db.collection('clubs').where('published', '==', true)),
      readAll(db.collection('events').where('status', '==', 'published')),
      readAll(db.collection('announcements').where('status', '==', 'published')),
      readAll(db.collection('campusKnowledge').where('status', '==', 'published').where('access', '==', 'public'))
        .then((entries) => entries.flatMap((entry) => chunkText(searchable(entry.data.title) || entry.id, String(entry.data.body ?? '')).map((chunk) => ({ ...chunk, id: entry.id, data: entry.data })))),
    ]);
    const next = { at: Date.now(), places: campus.places, clubs, events, notices, knowledge };
    indexCache = next;
    return next;
  })();
  try {
    return await indexLoad;
  } finally {
    indexLoad = null;
  }
}

async function readAll(query: Query): Promise<RawRecord[]> {
  const rows: RawRecord[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  while (true) {
    let page = query.limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);
    const snap = await page.get();
    rows.push(...snap.docs.map((doc) => ({ id: doc.id, data: doc.data() })));
    if (snap.size < PAGE_SIZE) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return rows;
}

function chunkText(title: string, body: string, maxChars = 850): KnowledgeChunk[] {
  const parts = body.split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';
  for (const part of parts) {
    const words = part.split(/\s+/);
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        chunks.push(current);
        current = word;
      } else current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunkBody, i) => ({
    id: `${title}#${i + 1}`, data: {}, chunkTitle: chunks.length > 1 ? `${title} - section ${i + 1}` : title, chunkBody,
  }));
}

function searchable(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).toLocaleLowerCase() : '';
}

function iso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return null;
}

function expired(data: DocumentData, now: number): boolean {
  const until = data.expiresAt ?? data.validUntil;
  const date = until instanceof Timestamp ? until.toMillis() : until instanceof Date ? until.getTime() : null;
  return date != null && date < now;
}

function addHit(hits: Hit[], terms: string[], item: {
  kind: string; id: string; title: string; summary: string; updatedAt?: string | null; isSample?: boolean;
}) {
  const score = campusRelevance(terms, item.title, item.summary, item.id);
  if (!score) return;
  hits.push({
    kind: item.kind, id: item.id, title: ascii(item.title, 120),
    summary: ascii(item.summary, 1000), score, updatedAt: item.updatedAt ?? null,
    isSample: item.isSample === true,
    url: item.kind === 'knowledge' ? publicEnv.siteUrl : campusUrl(publicEnv.siteUrl, { type: item.kind as 'location' | 'building' | 'club' | 'event' | 'notice', id: item.id }),
  });
}

/** Indexed process cache + token ranking across every published kiosk-safe collection in the current schema. */
export const GET = handle(async (req: Request) => {
  const { config } = await kioskRequest(req, 'search');
  const params = new URL(req.url).searchParams;
  const query = (params.get('q') ?? '').trim().slice(0, 120);
  if (query.length < 2) throw new HttpError(400, 'Search needs at least 2 characters.');
  const terms = campusQueryTerms(query);
  if (!terms.length) return json({ query: ascii(query, 120), results: [], updatedAt: new Date().toISOString() });

  const index = await loadIndex();
  const hits: Hit[] = [];
  const directoryEnabled = config.enabledActions.includes('search') || config.enabledActions.includes('directions');
  if (directoryEnabled) {
    for (const p of index.places) {
      const title = p.kind === 'building' ? `${p.name} ${p.code ?? ''}` : `${p.name} ${p.room ?? ''} ${p.buildingName ?? ''}`;
      const summary = [
        p.name, p.code, p.category, p.type, p.room && `room ${p.room}`,
        p.buildingName && `building ${p.buildingName}`, p.floor != null && `floor ${p.floor}`,
        ...(p.keywords ?? []), p.description, p.openingHours && `opening hours ${p.openingHours}`,
      ].filter(Boolean).join(' ');
      addHit(hits, terms, { kind: p.kind, id: p.id, title, summary, updatedAt: p.updatedAt, isSample: p.isSample });
    }
  }

  const now = Date.now();
  if (config.enabledActions.includes('clubs')) {
    for (const d of index.clubs) {
      const c = d.data;
      const title = searchable(c.name) || d.id;
      const summary = [c.category, c.description, c.contact].map(searchable).filter(Boolean).join(' ');
      addHit(hits, terms, { kind: 'club', id: d.id, title, summary, updatedAt: iso(c.updatedAt), isSample: c.isSample });
    }
  }
  if (config.enabledActions.includes('events')) {
    const historical = /\\b(past|previous|last|held|happened)\\b/i.test(query);
    for (const d of index.events) {
      const e = d.data;
      if (expired(e, now)) continue;
      const startMs = e.startAt instanceof Timestamp ? e.startAt.toMillis() : null;
      if (!historical && startMs == null) continue;
      const endMs = e.endAt instanceof Timestamp ? e.endAt.toMillis() : null;
      if (!historical && endMs != null && endMs < now) continue;
      const title = searchable(e.title) || d.id;
      const start = iso(e.startAt);
      const summary = [e.clubName, e.description, e.venueName && `venue ${e.venueName}`,
        start && `starts ${start}`, iso(e.endAt) && `ends ${iso(e.endAt)}`].map(searchable).filter(Boolean).join(' ');
      addHit(hits, terms, { kind: 'event', id: d.id, title, summary, updatedAt: iso(e.updatedAt), isSample: e.isSample });
    }
  }
  if (config.enabledActions.includes('announcements')) {
    for (const d of index.notices) {
      const n = d.data;
      if (expired(n, now)) continue;
      const title = searchable(n.title) || d.id;
      const summary = [n.category, n.body, n.pinned === true && 'pinned announcement', iso(n.publishedAt) && `published ${iso(n.publishedAt)}`]
        .map(searchable).filter(Boolean).join(' ');
      addHit(hits, terms, { kind: 'notice', id: d.id, title, summary, updatedAt: iso(n.updatedAt) ?? iso(n.publishedAt), isSample: n.isSample });
    }
  }
  for (const d of index.knowledge) {
    const k = d.data;
    if (expired(k, now)) continue;
    const title = d.chunkTitle;
    const summary = [k.sourceType, d.chunkBody, iso(k.publishedAt) && `published ${iso(k.publishedAt)}`, iso(k.updatedAt) && `updated ${iso(k.updatedAt)}`]
      .map(searchable).filter(Boolean).join(' ');
    addHit(hits, terms, { kind: 'knowledge', id: d.id, title, summary, updatedAt: iso(k.updatedAt), isSample: k.isSample });
  }

  const results = hits.sort((a, b) => b.score - a.score
    || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.title.localeCompare(b.title))
    .slice(0, 30).map(({ score: _score, ...hit }) => hit);
  return json({ query: ascii(query, 120), results, updatedAt: new Date().toISOString(), indexAgeMs: Date.now() - index.at });
});
