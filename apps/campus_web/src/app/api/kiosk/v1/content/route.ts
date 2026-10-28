import { Timestamp } from 'firebase-admin/firestore';
import { adminServices } from '@/lib/server/admin';
import { handle, HttpError, json } from '@/lib/server/http';
import { kioskRequest } from '@/lib/server/kiosk';
import { ascii, campusData } from '@/lib/server/campus';
import { searchPlaces } from '@/lib/search';
import { campusUrl } from '@/lib/deeplinks';
import { publicEnv } from '@/lib/env';

type ContentHit = { kind: string; id: string; title: string; summary: string; score: number; url: string; isSample: boolean };
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'at', 'can', 'do', 'does', 'for', 'from', 'give', 'how', 'i', 'in', 'is', 'me', 'of', 'on', 'please', 'tell', 'the', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'college', 'campus']);

function scoreText(text: string, words: string[]): number {
  const value = text.toLocaleLowerCase();
  if (!words.length) return 0;
  let score = 0;
  for (const word of words) {
    if (!value.includes(word)) return 0;
    score += value === word ? 12 : value.startsWith(word) ? 8 : 4;
  }
  return score;
}

/** Cross-category lookup over published, official campus information only. */
export const GET = handle(async (req: Request) => {
  const { config } = await kioskRequest(req, 'search');
  const query = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 80);
  if (query.length < 2) throw new HttpError(400, 'Search needs at least 2 characters.');
  const words = query.toLocaleLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP_WORDS.has(w));
  const searchQuery = words.join(' ');

  const { db } = adminServices();
  const wantClubs = config.enabledActions.includes('clubs');
  const wantEvents = config.enabledActions.includes('events');
  const wantNotices = config.enabledActions.includes('announcements');
  const [campus, clubsSnap, eventsSnap, noticesSnap] = await Promise.all([
    campusData(),
    wantClubs ? db.collection('clubs').where('published', '==', true).limit(100).get() : Promise.resolve(null),
    wantEvents ? db.collection('events').where('status', '==', 'published').limit(100).get() : Promise.resolve(null),
    wantNotices ? db.collection('announcements').where('status', '==', 'published').limit(100).get() : Promise.resolve(null),
  ]);

  const hits: ContentHit[] = [];
  for (const p of searchPlaces(campus.places, searchQuery, 5)) {
    const title = ascii(p.name, 100);
    const building = p.buildingName ? `, ${ascii(p.buildingName, 80)}` : '';
    const room = p.room ? `, room ${ascii(p.room, 32)}` : '';
    const url = campusUrl(publicEnv.siteUrl, { type: p.kind, id: p.id });
    const description = p.description ? ` ${ascii(p.description, 500)}` : '';
    const hours = p.openingHours ? ` Hours: ${ascii(p.openingHours, 80)}.` : '';
    hits.push({ kind: p.kind, id: p.id, title, summary: ascii(`${title}${building}${room}.${description}${hours}`, 700), score: 20, url, isSample: p.isSample === true });
  }

  for (const d of clubsSnap?.docs ?? []) {
    const c = d.data();
    const title = ascii(c.name ?? d.id, 100);
    const description = ascii(c.description ?? '', 700);
    const score = scoreText(`${title} ${c.category ?? ''} ${description}`, words);
    if (score) hits.push({ kind: 'club', id: d.id, title, summary: description || title, score, url: campusUrl(publicEnv.siteUrl, { type: 'club', id: d.id }), isSample: c.isSample === true });
  }

  for (const d of eventsSnap?.docs ?? []) {
    const e = d.data();
    const title = ascii(e.title ?? d.id, 120);
    const description = ascii(e.description ?? '', 700);
    const score = scoreText(`${title} ${e.clubName ?? ''} ${e.venueName ?? ''} ${description}`, words);
    if (!score) continue;
    const date = e.startAt?.toDate?.()?.toISOString?.() ?? '';
    const summary = `${e.clubName ? `${ascii(e.clubName, 70)}: ` : ''}${title}${e.venueName ? ` at ${ascii(e.venueName, 90)}` : ''}${date ? ` (${date})` : ''}${description ? `. ${description}` : ''}`;
    hits.push({ kind: 'event', id: d.id, title, summary: ascii(summary, 900), score, url: campusUrl(publicEnv.siteUrl, { type: 'event', id: d.id }), isSample: e.isSample === true });
  }

  for (const d of noticesSnap?.docs ?? []) {
    const n = d.data();
    const title = ascii(n.title ?? d.id, 120);
    const body = ascii(n.body ?? '', 700);
    const score = scoreText(`${title} ${body}`, words) + (n.pinned === true ? 1 : 0);
    if (score) hits.push({ kind: 'notice', id: d.id, title, summary: body, score, url: campusUrl(publicEnv.siteUrl, { type: 'notice', id: d.id }), isSample: n.isSample === true });
  }

  const results = hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, 30).map(({ score: _score, ...hit }) => hit);
  return json({ query: ascii(query, 80), results, updatedAt: Timestamp.now().toDate().toISOString() });
});
