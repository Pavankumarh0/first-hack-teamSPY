# Kiosk knowledge retrieval

## Data sources

The authenticated kiosk API uses the existing Admin SDK backend and the current Firestore schema. It searches only:

- Published buildings and locations records.
- Published clubs.
- Published future or current events (past events are omitted for ordinary questions).
- Published announcements that have not passed an optional expiresAt or validUntil.
- Published campusKnowledge records whose access is public.
- The local approved Markdown files in kb/, searched by the Gemma service after the kiosk PC submits the retrieved public records.

It never searches users, attendanceRecords, rfidCards, reports, private posts, personal notifications, or report updates. It does not give Firestore credentials or database access to the ESP32. RFID stays separate.

## Retrieval flow

1. The kiosk PC sends the visitor's question to the Next.js kiosk API with its read-only device key.
2. The API loads the published campus corpus using status-filtered Firestore queries. A process cache is refreshed every 45 seconds; directory data uses its existing 60 second cache. Questions rank this cached corpus in memory, not by sending all records to the ESP32.
3. Token ranking weights title matches above body matches, accepts partial coverage for natural-language questions, and returns up to 30 relevant records with source type, update time, and sample marker.
4. The kiosk PC signs the context with HMAC-SHA256 using the existing device key. The local Python service reads the ignored kiosk/.env file and rejects missing or invalid signatures. The secret remains on the PC; it is not placed in the ESP32.
5. The Python service also retrieves local approved KB passages, so a campus record and an approved KB passage can support one answer.
6. Gemma must cite retrieved sources. A conservative post-check rejects sentences with weak lexical support or numbers absent from the evidence. Conflicting published hours for the same named place are declined.
7. Missing or inadequate evidence returns exactly "I don't know about that." Backend, network, speech, and model errors retain separate technical responses.

The local process cache is per Next.js instance, not a managed shared vector index. On scale-out, each instance may refresh independently. The schema has no handbook/PDF collection today; admins can add verified text knowledge through the dashboard below. The browser import reads Markdown or TXT text into Firestore and does not store the original file. PDF extraction and original-file storage are not implemented.

## Admin knowledge entries

Open Dashboard > Campus knowledge. Entries use campusKnowledge/{id}:

| Field | Meaning |
|---|---|
| title, body | Verified plain-text source passage (up to 20,000 characters) |
| sourceType | handbook, policy, faq, procedure, or general |
| status | draft, published, or archived |
| access | public or restricted; only published public content enters kiosk search |
| createdBy, createdAt, updatedAt, publishedAt | Source identity and lifecycle timestamps |
| isSample | Always false for admin-authored official knowledge |

Firestore rules allow only active admins to create/update/delete entries. Students cannot write official facts. Public clients can only read published public entries. The kiosk API uses a composite status + access index, and its in-memory search index refreshes automatically within about a minute; there is no manual re-index button or per-document indexing job.

## Current limitations

- Full-text search is an in-memory token index over the existing campus-sized published collections. Firestore reads occur on cache refresh, not on every question. This is suitable for the current campus directory/content scale, but it is not a vector or managed search service; very large collections should move to a dedicated index before scaling.
- Campus records that do not exist in the current schema (for example, an uploaded exam handbook) cannot be retrieved until an administrator adds a verified knowledge entry.
- The answer grounding check is conservative lexical validation. It catches many unsupported names and numerical claims but cannot prove every semantic implication. It is paired with the strict model prompt and returns the exact unknown fallback when it cannot establish support.
- No live traffic, changing office hours, or physical route survey is inferred from static records.

## Campus IQ and peer discovery

`studentDiscovery/{uid}` is a separate, opt-in profile store. It contains only alias, short blurb, selected interest IDs, club IDs and team availability. Owner and active students may read only according to discovery visibility rules; usernames, contacts, attendance and reports are not copied into this collection. The current discovery UI supports interests, club links and upcoming events; direct messages, group discussions, blocks and interpersonal reports are not implemented.

Campus IQ questions live in `quizQuestions`; the answer key is never returned by the student endpoint and direct Firestore reads are admin-only. Admins publish questions only after linking a published public source record. `/api/quiz/answer` validates the submitted option and question status, records one immutable answer per user/question, and updates all-time and ISO-week score totals in one transaction. Students cannot write quiz scores or answer documents. Weekly ranking filters to the current ISO week. The leaderboard shows a chosen discovery alias when that student opted in; otherwise it shows “Campus student.” Points are simple fixed question points; there is no speed bonus, badge system, or rate limit beyond one answer per question.

The dashboard quiz editor is at `/admin/quiz`; the student feature is `/quiz`. Publish quiz questions only when verified campus source documents exist. For production, ensure Firestore composite index generation is deployed if the weekly `weekKey + weekly desc` query asks for one.
