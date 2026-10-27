// RFID attendance helpers shared by the scan API, the dashboard and the tests.
// Flow: UNO Q reader -> kiosk ESP32 -> kiosk PC -> POST /api/attendance/v1/scan
// (docs/RFID_BACKEND.md). A card UID is an identifier, not a credential.

/** Card UIDs as readers report them ("04:a2:3b:1c", "04A23B1C") -> "04A23B1C". */
export function normalizeCardUid(raw: string): string | null {
  const hex = (raw ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return hex.length >= 8 && hex.length <= 20 && hex.length % 2 === 0 ? hex : null;
}

/** The last two UID bytes ("91:0C"): enough for an administrator to tell
    cards apart on screen, not enough to identify or clone one. */
export function cardHint(normalizedUid: string): string {
  const tail = normalizedUid.slice(-4);
  return `${tail.slice(0, 2)}:${tail.slice(2)}`;
}

/** True when the student already checked in to this session within the window. */
export function isDuplicateScan(lastCheckIn: Date | null, now: Date, windowMinutes: number): boolean {
  if (!lastCheckIn) return false;
  return now.getTime() - lastCheckIn.getTime() < windowMinutes * 60_000;
}

/** One record per student per session: a repeated scan cannot add another. */
export function attendanceRecordId(sessionId: string, studentId: string): string {
  return `${sessionId}_${studentId}`;
}

export interface SessionWindow { id: string; startsAt: Date; endsAt: Date }

/** The session a reader's scan belongs to: open now, and if several overlap,
    the one that started last (a lab that runs inside a longer block). */
export function pickOpenSession<T extends SessionWindow>(sessions: T[], now: Date): T | null {
  const open = sessions.filter((s) => s.startsAt <= now && now <= s.endsAt);
  open.sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime());
  return open[0] ?? null;
}

/** What the scan API answers; also the audit log's `result`. */
export type ScanStatus =
  | 'checked_in'
  | 'already_checked_in'
  | 'unknown_card'
  | 'student_inactive'
  | 'no_open_session'
  | 'disabled';

export const SCAN_STATUS_LABELS: Record<ScanStatus | 'duplicate' | 'card_registered' | 'card_deactivated' | 'card_activated', string> = {
  checked_in: 'Checked in',
  already_checked_in: 'Already checked in',
  duplicate: 'Repeat scan',
  unknown_card: 'Unknown card',
  student_inactive: 'Account not active',
  no_open_session: 'No open session',
  disabled: 'Attendance off',
  card_registered: 'Card registered',
  card_deactivated: 'Card deactivated',
  card_activated: 'Card activated',
};

/** One short line for the kiosk's title bar (the firmware shows 30 characters). */
export function kioskLine(status: ScanStatus, firstName?: string): string {
  const name = (firstName ?? '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, 14);
  switch (status) {
    case 'checked_in': return name ? `Checked in: ${name}` : 'Checked in';
    case 'already_checked_in': return name ? `Already in: ${name}` : 'Already checked in';
    case 'unknown_card': return 'Card not registered';
    case 'student_inactive': return 'Card blocked - see office';
    case 'no_open_session': return 'No class open now';
    case 'disabled': return 'Attendance is off';
  }
}
