// RFID attendance - PREPARED ONLY. No reader hardware exists yet; nothing in
// the platform claims that a card can be scanned. These helpers define how a
// scan will be handled once readers are installed (docs/RFID_INTEGRATION.md).

/** Card UIDs as readers report them ("04:a2:3b:1c", "04A23B1C") -> "04A23B1C". */
export function normalizeCardUid(raw: string): string | null {
  const hex = (raw ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase();
  return hex.length >= 8 && hex.length <= 20 && hex.length % 2 === 0 ? hex : null;
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
