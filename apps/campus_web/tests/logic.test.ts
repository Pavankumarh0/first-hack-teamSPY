import { describe, expect, it } from 'vitest';
import sample from '@shared/seed/sample-campus.json';
import { findRoute, turnWord, type CampusMap } from '@/lib/navigation';
import { appSchemeUrl, campusPath, campusUrl, parseCampusPath } from '@/lib/deeplinks';
import { identityFor, normalizeUsername, passwordProblem, usernameFromIdentity, usernameProblem } from '@/lib/username';
import { searchPlaces } from '@/lib/search';
import { isOpen, nextStatuses } from '@/lib/reports';
import { attendanceRecordId, isDuplicateScan, normalizeCardUid } from '@/lib/attendance';

const map = sample.map as CampusMap;

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

describe('RFID attendance helpers (no hardware)', () => {
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
});
