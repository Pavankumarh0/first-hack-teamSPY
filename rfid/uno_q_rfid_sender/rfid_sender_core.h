#pragma once
// Campus Mithra RFID sender - board-independent logic (UID text, frames,
// "one event per tap"). No Arduino calls here, so rfid/tests/ can compile and
// test exactly this code on a PC. Protocol: docs/RFID_PROTOCOL.md.

#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace rfidsend {

// MIFARE / ISO 14443-A UIDs are 4, 7 or 10 bytes.
static const size_t MAX_UID_BYTES = 10;
// "A3:2F:91:0C" - two hex digits per byte, ':' between bytes.
static const size_t MAX_UID_TEXT = MAX_UID_BYTES * 3 - 1;          // 29
// "RFID:" + UID + "\n"
static const size_t MAX_FRAME = 5 + MAX_UID_TEXT + 1;               // 35

inline bool validUidLength(size_t n) { return n == 4 || n == 7 || n == 10; }

/* Writes the UID as uppercase hex pairs joined by ':' ("A3:2F:91:0C").
   Returns the text length, or 0 for an impossible UID length / small buffer. */
inline size_t formatUid(const uint8_t *bytes, size_t n, char *out, size_t outSize) {
  static const char HEX[] = "0123456789ABCDEF";
  if (!bytes || !validUidLength(n) || outSize < n * 3) return 0;
  size_t o = 0;
  for (size_t i = 0; i < n; i++) {
    if (i) out[o++] = ':';
    out[o++] = HEX[bytes[i] >> 4];
    out[o++] = HEX[bytes[i] & 0x0F];
  }
  out[o] = '\0';
  return o;
}

/* "RFID:<UID>\n". Returns the frame length (newline included), 0 on error. */
inline size_t buildFrame(const char *uidText, char *out, size_t outSize) {
  const size_t u = uidText ? strlen(uidText) : 0;
  if (u == 0 || u > MAX_UID_TEXT || outSize < 5 + u + 2) return 0;
  memcpy(out, "RFID:", 5);
  memcpy(out + 5, uidText, u);
  out[5 + u] = '\n';
  out[6 + u] = '\0';
  return 6 + u;
}

/*
 * Decides when a reading becomes an event. A card resting on the reader is
 * reported once; it is reported again only after it has been gone for
 * removalMs (a few missed polls do not count as a removal), and the same card
 * is never re-sent within retapMs of its last event.
 */
class TapDebouncer {
 public:
  TapDebouncer(uint32_t removalMs, uint32_t retapMs) : removalMs_(removalMs), retapMs_(retapMs) {}

  /* Call once per poll. present = a card answered; uid = its text.
     Returns true when this reading should be sent. */
  bool update(uint32_t nowMs, bool present, const char *uid) {
    if (!present) {
      if (held_ && nowMs - lastSeenMs_ >= removalMs_) held_ = false;
      return false;
    }
    const bool sameCard = strcmp(uid, current_) == 0;
    lastSeenMs_ = nowMs;
    if (held_ && sameCard) return false;                 // still resting on the reader
    if (sameCard && hasSent_ && nowMs - lastSentMs_ < retapMs_) {
      held_ = true;                                      // quick lift-and-replace
      return false;
    }
    strncpy(current_, uid, MAX_UID_TEXT);
    current_[MAX_UID_TEXT] = '\0';
    held_ = true;
    hasSent_ = true;
    lastSentMs_ = nowMs;
    return true;
  }

  bool cardHeld() const { return held_; }
  /* True once, right after the held card has been removed. */
  bool takeRemoved() {
    const bool r = wasHeld_ && !held_;
    wasHeld_ = held_;
    return r;
  }

 private:
  uint32_t removalMs_, retapMs_;
  uint32_t lastSeenMs_ = 0, lastSentMs_ = 0;
  bool held_ = false, wasHeld_ = false, hasSent_ = false;
  char current_[MAX_UID_TEXT + 1] = "";
};

}  // namespace rfidsend
