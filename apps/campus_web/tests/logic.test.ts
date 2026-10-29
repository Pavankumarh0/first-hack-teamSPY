import { describe, expect, it } from 'vitest';
import sample from '@shared/seed/sample-campus.json';
import { checkMap, findRoute, turnWord, type CampusMap } from '@/lib/navigation';
import { appSchemeUrl, campusPath, campusUrl, parseCampusPath } from '@/lib/deeplinks';
import { identityFor, normalizeUsername, passwordProblem, usernameFromIdentity, usernameProblem } from '@/lib/username';
import { searchPlaces } from '@/lib/search';
import { campusQueryTerms, campusRelevance } from '@/lib/kiosk-search';
import { isOpen, nextStatuses } from '@/lib/reports';
import { haversineM, toLatLng, toPlan } from '@/lib/geo';
import { ARRIVE_M, progress, routeFromPosition, snapToPaths } from '@/lib/liveNav';
import { attendanceRecordId, cardHint, isDuplicateScan, kioskLine, normalizeCardUid, pickOpenSession } from '@/lib/attendance';

const map = sample.map as CampusMap;

describe('map check', () => {
  it('finds nothing wrong with the sample map', () => {
    const p = checkMap(map, sample.buildings.map((b) => ({ ...b, published: true })));
    expect([p.broken, p.unreachable, p.missingEntrance, p.cutOff, p.stacked].every((l) => l.length === 0)).toBe(true);
  });

  it('reports the faults that break directions', () => {
    const m: CampusMap = {
      width: 1000, height: 1000, metersPerUnit: 1,
      nodes: [
        { id: 'gate', x: 0, y: 0, label: 'Gate' },
        { id: 'eng', x: 100, y: 0, label: 'Engineering entrance' },
        { id: 'eng-dup', x: 101, y: 1, label: 'Duplicate point' },
        { id: 'hostel', x: 500, y: 500, label: 'Hostel entrance' },
      ],
      edges: [{ id: 'gate-dup', from: 'gate', to: 'eng-dup' }, { id: 'gone', from: 'gate', to: 'deleted' }],
    };
    const p = checkMap(m, [
      { id: 'b-eng', name: 'Engineering', entranceNodeId: 'eng' },
      { id: 'b-hostel', name: 'Hostel', entranceNodeId: 'hostel' },
      { id: 'b-arch', name: 'Architecture', entranceNodeId: 'n-missing' },
      { id: 'b-draft', name: 'Draft', entranceNodeId: 'n-missing', published: false },
    ]);
    expect(p.broken.map((e) => e.id)).toEqual(['gone']);
    expect(p.missingEntrance.map((b) => b.name)).toEqual(['Architecture']);
    expect(p.cutOff.map((b) => b.name)).toEqual(['Engineering', 'Hostel']);
    expect(p.stacked.map(([a, b]) => [a.id, b.id])).toEqual([['eng', 'eng-dup']]);
  });
});

describe('campus routing on the sample map', () => {
  it('finds the shortest walk from the kiosk to the library', () => {
    const r = findRoute(map, 'n-admin', 'n-library')!;
    expect(r.nodeIds).toEqual(['n-admin', 'n-j1', 'n-j2', 'n-library']);
    expect(r.distanceM).toBeGreaterThan(100);
    expect(r.minutes).toBeGreaterThanOrEqual(1);
    expect(r.steps[0].text).toBe('Start at Administrative Block entrance.');
    expect(r.steps.at(-1)!.text).toBe('You have arrived at Library entrance.');
    // Facing north at the central lawn, the library is to the east: a right turn.
    expect(r.steps.find((s) => s.nodeId === 'n-library')!.text).toMatch(/^Turn right/);
  });

  it('takes the stairs only when step-free routes are not required', () => {
    const fast = findRoute(map, 'n-b', 'n-d')!;
    expect(fast.edgeIds).toEqual(['e-b-d-stairs']);
    expect(fast.accessible).toBe(false);
    expect(fast.steps[1].text).toContain('includes steps');
    const stepFree = findRoute(map, 'n-b', 'n-d', { accessibleOnly: true })!;
    expect(stepFree.accessible).toBe(true);
    expect(stepFree.nodeIds).toEqual(['n-b', 'n-j3', 'n-j4', 'n-d']);
    expect(stepFree.distanceM).toBeGreaterThan(fast.distanceM);
  });

  it('every building entrance is reachable step-free from the main gate', () => {
    for (const b of sample.buildings) {
      const r = findRoute(map, 'n-gate', b.entranceNodeId, { accessibleOnly: true });
      expect(r, b.id).not.toBeNull();
    }
  });

  it('handles same-node and unknown-node requests', () => {
    expect(findRoute(map, 'n-gate', 'n-gate')!.steps[0].text).toBe('You are at Main Gate.');
    expect(findRoute(map, 'n-gate', 'nowhere')).toBeNull();
  });

  it('every sample room points at a real map node', () => {
    const ids = new Set(map.nodes.map((n) => n.id));
    for (const l of sample.locations) expect(ids.has(l.navNodeId), l.id).toBe(true);
  });

  it('names turns in screen coordinates', () => {
    expect(turnWord(0, -1, 1, 0)).toBe('Turn right');   // north, then east
    expect(turnWord(0, -1, -1, 0)).toBe('Turn left');   // north, then west
    expect(turnWord(0, -1, 0, -1)).toBe('Continue straight');
    expect(turnWord(0, -1, 0.6, -1)).toBe('Bear right');
  });
});

describe('kiosk campus-wide retrieval ranking', () => {
  it('normalizes a natural-language event query and finds club event records', () => {
    const terms = campusQueryTerms('What events are happening in the coding club?');
    expect(terms).toEqual(['coding']);
    expect(campusRelevance(terms, 'Hackathon workshop', 'Hosted by the Coding Club')).toBeGreaterThan(0);
  });

  it('finds a maintenance-related directory record from partial term coverage', () => {
    const terms = campusQueryTerms('How do I report a broken classroom projector?');
    expect(terms).toEqual(['report', 'broken', 'classroom', 'projector']);
    expect(campusRelevance(terms, 'Classroom AV Support', 'Report projector issues to the IT support office.')).toBeGreaterThan(0);
  });

  it('does not return a record that shares no meaningful question terms', () => {
    const terms = campusQueryTerms('Where can I find the examination timetable?');
    expect(campusRelevance(terms, 'Sports Club', 'Weekly football training and tournaments.')).toBe(0);
  });
});

describe('deep links', () => {
  it('round-trips every link type', () => {
    for (const link of [
      { type: 'location', id: 'library-reading-hall' },
      { type: 'building', id: 'a-block' },
      { type: 'event', id: 'campus-hackathon' },
      { type: 'club', id: 'robotics-club' },
      { type: 'notice', id: 'wifi-maintenance' },
    ] as const) {
      expect(parseCampusPath(campusPath(link))).toEqual(link);
    }
    expect(parseCampusPath('/campus/route', '?from=admission-office&to=main-canteen'))
      .toEqual({ type: 'route', from: 'admission-office', to: 'main-canteen' });
  });

  it('rejects anything that is not a campus destination', () => {
    expect(parseCampusPath('/campus/location')).toBeNull();
    expect(parseCampusPath('/campus/teleport/x')).toBeNull();
    expect(parseCampusPath('/campus/location/../../etc')).toBeNull();
    expect(parseCampusPath('/campus/location/a/b')).toBeNull();
    expect(parseCampusPath('/campus/location/%3Cscript%3E')).toBeNull();
    expect(parseCampusPath('/admin/users')).toBeNull();
    expect(parseCampusPath('/campus/route', '?from=x')).toBeNull();
  });

  it('builds absolute and app-scheme URLs', () => {
    expect(campusUrl('https://campus.example.edu/', { type: 'event', id: 'campus-hackathon' }))
      .toBe('https://campus.example.edu/campus/event/campus-hackathon');
    expect(appSchemeUrl({ type: 'location', id: 'main-canteen' })).toBe('campusmithra://campus/location/main-canteen');
    expect(() => campusPath({ type: 'event', id: 'bad id' })).toThrow();
  });
});

describe('usernames', () => {
  it('normalises and validates', () => {
    expect(normalizeUsername('  Asha.K ')).toBe('asha.k');
    expect(usernameProblem('asha.k')).toBeNull();
    expect(usernameProblem('ab')).not.toBeNull();
    expect(usernameProblem('1asha')).not.toBeNull();
    expect(usernameProblem('asha..k')).not.toBeNull();
    expect(usernameProblem('asha.')).not.toBeNull();
    expect(usernameProblem('admin')).toBe('That username is reserved.');
    expect(usernameProblem('asha@mail')).not.toBeNull();
  });
  it('maps to and from the internal identifier', () => {
    expect(identityFor('Asha.K')).toBe('asha.k@users.campus-mithra.invalid');
    expect(usernameFromIdentity('asha.k@users.campus-mithra.invalid')).toBe('asha.k');
    expect(usernameFromIdentity('someone@gmail.com')).toBeNull();
  });
  it('requires a reasonable password', () => {
    expect(passwordProblem('short1')).not.toBeNull();
    expect(passwordProblem('longpassword')).not.toBeNull();
    expect(passwordProblem('campus2026')).toBeNull();
  });
});

describe('search', () => {
  const places = sample.locations.map((l) => ({ ...l, buildingName: sample.buildings.find((b) => b.id === l.buildingId)!.name }));
  it('finds rooms by name, room number and keyword', () => {
    expect(searchPlaces(places, 'library')[0].id).toBe('library-reading-hall');
    expect(searchPlaces(places, 'a201')[0].id).toBe('a-201');
    expect(searchPlaces(places, 'bus pass')[0].id).toBe('transport-office');
    expect(searchPlaces(places, 'canteen food')[0].id).toBe('main-canteen');
    expect(searchPlaces(places, 'helipad')).toEqual([]);
  });
});

describe('report workflow', () => {
  it('follows the shared lifecycle', () => {
    expect(nextStatuses('submitted', null)).toEqual(['acknowledged', 'rejected']);
    expect(nextStatuses('in_progress', null)).toContain('resolved');
    expect(nextStatuses('rejected', null)).toEqual([]);
    expect(nextStatuses('submitted', { submitted: ['resolved'] })).toEqual(['resolved']);
    expect(isOpen('assigned')).toBe(true);
    expect(isOpen('resolved')).toBe(false);
  });
});

describe('RFID attendance helpers', () => {
  it('normalises card UIDs and rejects junk', () => {
    expect(normalizeCardUid('04:a2:3b:1c')).toBe('04A23B1C');
    expect(normalizeCardUid('04 A2 3B 1C 5D 6E 7F')).toBe('04A23B1C5D6E7F');
    expect(normalizeCardUid('04A23')).toBeNull();
    expect(normalizeCardUid('hello')).toBeNull();
  });
  it('treats a repeat scan inside the window as a duplicate', () => {
    const t = new Date('2026-11-03T09:00:00Z');
    expect(isDuplicateScan(null, t, 10)).toBe(false);
    expect(isDuplicateScan(new Date('2026-11-03T08:55:00Z'), t, 10)).toBe(true);
    expect(isDuplicateScan(new Date('2026-11-03T08:40:00Z'), t, 10)).toBe(false);
    expect(attendanceRecordId('dbms-1', 'stu1')).toBe('dbms-1_stu1');
  });
  it('keeps only a short card hint for display', () => {
    expect(cardHint('A32F910C')).toBe('91:0C');
    expect(cardHint(normalizeCardUid('04:5a:1b:2c:3d:80:01')!)).toBe('80:01');
  });
  it('picks the session open now on the reader, the latest-started if they overlap', () => {
    const at = (h: number) => new Date(`2026-11-03T${String(h).padStart(2, '0')}:00:00Z`);
    const sessions = [
      { id: 'block', startsAt: at(9), endsAt: at(13) },
      { id: 'lab', startsAt: at(10), endsAt: at(12) },
      { id: 'later', startsAt: at(14), endsAt: at(15) },
    ];
    expect(pickOpenSession(sessions, at(9))?.id).toBe('block');
    expect(pickOpenSession(sessions, at(11))?.id).toBe('lab');
    expect(pickOpenSession(sessions, at(13))?.id).toBe('block');
    expect(pickOpenSession(sessions, at(16))).toBeNull();
  });
  it('kiosk messages fit the 30-character title bar and are plain ASCII', () => {
    for (const status of ['checked_in', 'already_checked_in', 'unknown_card', 'student_inactive', 'no_open_session', 'disabled'] as const) {
      const line = kioskLine(status, 'Venkatalakshmiammaa');
      expect(line.length).toBeLessThanOrEqual(30);
      expect(/^[\x20-\x7E]*$/.test(line)).toBe(true);
    }
    expect(kioskLine('checked_in', 'Asha')).toBe('Checked in: Asha');
    expect(kioskLine('checked_in', 'ಆಶಾ')).toBe('Checked in');
  });
});

describe('georeferencing', () => {
  const frame = { width: 1000, height: 700, metersPerUnit: 0.5, geo: { lat: 12.9, lng: 77.6, rotationDeg: 0 } };
  it('puts the plan centre on the anchor and north at the top', () => {
    expect(toLatLng(frame, { x: 500, y: 350 })).toEqual({ lat: 12.9, lng: 77.6 });
    const up = toLatLng(frame, { x: 500, y: 150 });            // 200 units = 100 m up the plan
    expect(haversineM({ lat: 12.9, lng: 77.6 }, up)).toBeCloseTo(100, 0);
    expect(up.lat).toBeGreaterThan(12.9);
    expect(up.lng).toBeCloseTo(77.6, 9);
  });
  it('rotates the plan and round-trips', () => {
    const rotated = { ...frame, geo: { ...frame.geo, rotationDeg: 90 } };   // plan "up" points east
    const up = toLatLng(rotated, { x: 500, y: 150 });
    expect(up.lng).toBeGreaterThan(77.6);
    expect(up.lat).toBeCloseTo(12.9, 6);
    for (const g of [frame, rotated, { ...frame, geo: { ...frame.geo, rotationDeg: -37.5 } }]) {
      const back = toPlan(g, toLatLng(g, { x: 123.4, y: 567.8 }));
      expect(back.x).toBeCloseTo(123.4, 6);
      expect(back.y).toBeCloseTo(567.8, 6);
    }
  });
});

describe('live navigation from the walker\'s position', () => {
  const nodes = new Map(map.nodes.map((n) => [n.id, n]));
  const gate = nodes.get('n-gate')!;
  const lib = map.nodes.find((n) => n.buildingId === 'central-library') ?? map.nodes.find((n) => /library/i.test(n.label))!;
  it('snaps to the nearest walkway and refuses positions off campus', () => {
    const near = snapToPaths(map, { x: gate.x + 6, y: gate.y - 10 });
    expect(near!.distanceM).toBeLessThan(10);
    expect(routeFromPosition(map, { x: -2000, y: -2000 }, lib.id).status).toBe('off_campus');
  });
  it('guides turn by turn, notices a detour and arrives', () => {
    const plan = routeFromPosition(map, { x: gate.x + 4, y: gate.y - 20 }, lib.id);
    expect(plan.status).toBe('ok');
    if (plan.status !== 'ok') return;
    const live = plan.live;
    expect(live.maneuvers.at(-1)!.kind).toBe('arrive');
    const start = progress(map, live, live.points[0]);
    expect(start.arrived).toBe(false);
    expect(start.offRoute).toBe(false);
    expect(start.remainingM).toBeGreaterThan(50);
    expect(start.next.text).toMatch(/^(In \d+ m, |.* now$)/);
    // halfway along the polyline the remaining distance has dropped
    const mid = live.points[Math.floor(live.points.length / 2)];
    expect(progress(map, live, mid).remainingM).toBeLessThan(start.remainingM);
    // 40 m sideways from the route = off route
    const k = 1;
    const off = { x: live.points[k].x + 80, y: live.points[k].y };
    expect(progress(map, live, off).offRoute).toBe(true);
    // at the destination
    const end = live.points.at(-1)!;
    const done = progress(map, live, { x: end.x + 2, y: end.y });
    expect(done.arrived).toBe(true);
    expect(done.next.text).toContain('arrived');
    expect(ARRIVE_M).toBeGreaterThan(5);
  });
  it('already standing at the destination', () => {
    expect(routeFromPosition(map, { x: lib.x, y: lib.y }, lib.id).status).toBe('arrived');
  });
});
