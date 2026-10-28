// Host tests for the RFID link: the UNO Q sender's code
// (rfid/uno_q_rfid_sender/rfid_sender_core.h) produces frames and the ESP32's
// parser (firmware/include/rfid_frame.h) reads them, byte by byte, exactly as
// on the wire. No hardware involved.
//
//   bash rfid/tests/run.sh
#include <cassert>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

#include "../../../firmware/include/rfid_frame.h"
#include "../uno_q_rfid_sender/rfid_sender_core.h"

static int failures = 0, checks = 0;
#define CHECK(cond)                                                       \
  do {                                                                    \
    checks++;                                                             \
    if (!(cond)) { failures++; std::printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); } \
  } while (0)

struct Got { std::vector<std::string> cards, hellos; std::vector<rfidlink::Reject> rejects; };

static Got feed(rfidlink::LineParser &p, const std::string &bytes, uint32_t t = 1000, uint32_t stepMs = 0) {
  Got g;
  rfidlink::Event ev;
  for (unsigned char c : bytes) {
    if (p.feed(c, t, ev)) {
      if (ev.kind == rfidlink::KIND_CARD) g.cards.push_back(ev.uid);
      else if (ev.kind == rfidlink::KIND_HELLO) g.hellos.push_back(ev.text);
      else g.rejects.push_back(ev.reason);
    }
    t += stepMs;
  }
  return g;
}

static std::string frameFor(std::vector<uint8_t> uid) {
  char text[rfidsend::MAX_UID_TEXT + 1], frame[rfidsend::MAX_FRAME + 1];
  if (!rfidsend::formatUid(uid.data(), uid.size(), text, sizeof(text))) return "";
  const size_t n = rfidsend::buildFrame(text, frame, sizeof(frame));
  return std::string(frame, n);
}

static void senderFormatsUids() {
  CHECK(frameFor({0xA3, 0x2F, 0x91, 0x0C}) == "RFID:A3:2F:91:0C\n");
  CHECK(frameFor({0x04, 0x5A, 0x1B, 0x2C, 0x3D, 0x80, 0x01}) == "RFID:04:5A:1B:2C:3D:80:01\n");
  CHECK(frameFor({1, 2, 3, 4, 5, 6, 7, 8, 9, 0xFF}) == "RFID:01:02:03:04:05:06:07:08:09:FF\n");
  CHECK(frameFor({0xA3, 0x2F}) == "");                 // impossible UID length
  CHECK(frameFor({}) == "");
  char small[8];
  const uint8_t u[4] = {1, 2, 3, 4};
  CHECK(rfidsend::formatUid(u, 4, small, sizeof(small)) == 0);   // never overflows
  CHECK(frameFor({1, 2, 3, 4, 5, 6, 7, 8, 9, 10}).size() <= rfidsend::MAX_FRAME);
}

static void everySenderFrameParses() {
  rfidlink::LineParser p;
  const std::vector<std::vector<uint8_t>> uids = {
      {0xA3, 0x2F, 0x91, 0x0C}, {0, 0, 0, 0}, {0xFF, 0xFF, 0xFF, 0xFF},
      {0x04, 0x5A, 0x1B, 0x2C, 0x3D, 0x80, 0x01}, {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}};
  std::string wire;
  for (auto &u : uids) wire += frameFor(u);
  const Got g = feed(p, wire);
  CHECK(g.cards.size() == uids.size());
  CHECK(g.rejects.empty());
  CHECK(g.cards[0] == "A3:2F:91:0C");
  CHECK(g.cards[3] == "04:5A:1B:2C:3D:80:01");
}

static void malformedFramesAreRejected() {
  rfidlink::LineParser p;
  const Got g = feed(p,
                     "RFID:a3:2f:91:0c\n"            // lowercase (protocol says uppercase)
                     "RFID:A3:2F:91\n"               // 3 bytes
                     "RFID:A3-2F-91-0C\n"            // wrong separator
                     "RFID:A3:2F:91:0G\n"            // not hex
                     "RFID:A3:2F:91:0C:\n"           // trailing separator
                     "RFID:\n"                       // empty UID
                     "RFID: A3:2F:91:0C\n"           // space
                     "rfid:A3:2F:91:0C\n"            // wrong prefix
                     "*** Booting Zephyr OS build v4.2 ***\n"   // UNO Q console noise
                     "\n\r\n");                     // empty lines: no events
  CHECK(g.cards.empty());
  CHECK(g.rejects.size() == 9);
  CHECK(p.stats.badUids == 7);
  CHECK(p.stats.notFrames == 2);
}

static void hostileBytesAreSafe() {
  rfidlink::LineParser p;
  std::string longLine = "RFID:" + std::string(500, 'A') + "\n";
  std::string binary;
  for (int i = 0; i < 256; i++) binary += (char)i;     // includes '\n' and NUL
  binary += "\n";
  const Got g = feed(p, longLine + "\x1b[0m\x1b[1;32mRFID:A3:2F:91:0C\x1b[0m\n" + binary + "RFID:A3:2F:91:0C\n");
  CHECK(p.stats.overlong == 2);                        // the long frame + the 245-byte binary tail
  CHECK(p.stats.badChars >= 1);
  CHECK(g.cards.size() == 1);                          // the clean frame after the garbage
  CHECK(g.cards.back() == "A3:2F:91:0C");
}

static void crlfAndSplitReadsWork() {
  rfidlink::LineParser p;
  Got g = feed(p, "RFID:A3:2F", 1000, 1);
  CHECK(g.cards.empty() && g.rejects.empty());          // partial: nothing yet
  g = feed(p, ":91:0C\r\n", 1012, 1);                   // the rest arrives 12 ms later
  CHECK(g.cards.size() == 1);
}

static void cutOffFramesDoNotGlue() {
  rfidlink::LineParser p;
  Got g = feed(p, "RFID:A3:2F", 1000);                  // reader unplugged mid-frame
  g = feed(p, "RFID:11:22:33:44\n", 5000);              // next frame, 4 s later
  CHECK(g.rejects.size() == 1 && g.rejects[0] == rfidlink::REJ_STALE);
  CHECK(g.cards.size() == 1 && g.cards[0] == "11:22:33:44");
}

static void helloLines() {
  rfidlink::LineParser p;
  const Got g = feed(p, "HELLO:RFID/1 reader=ok\n");
  CHECK(g.hellos.size() == 1 && g.hellos[0] == "RFID/1 reader=ok");
}

static void oneEventPerTap() {
  // 50 ms polls: card held 2 s, a missed read in the middle, removed, re-tapped.
  rfidsend::TapDebouncer d(700, 1500);
  int sent = 0;
  uint32_t t = 0;
  for (; t < 2000; t += 50) sent += d.update(t, t != 1000, "A3:2F:91:0C");   // one missed poll
  CHECK(sent == 1);
  CHECK(d.cardHeld());
  for (; t < 3000; t += 50) sent += d.update(t, false, "");                  // removed
  CHECK(!d.cardHeld());
  sent += d.update(t, true, "A3:2F:91:0C");                                   // tapped again
  CHECK(sent == 2);
  sent += d.update(t + 50, true, "11:22:33:44");                              // another card
  CHECK(sent == 3);
}

static void quickRetapIsOneEvent() {
  rfidsend::TapDebouncer d(100, 1500);
  int sent = d.update(0, true, "A3:2F:91:0C");
  sent += d.update(150, false, "");
  sent += d.update(300, false, "");                     // gone long enough to count as removed
  sent += d.update(400, true, "A3:2F:91:0C");           // back within the retap window
  CHECK(sent == 1);
  sent += d.update(3000, false, "") + d.update(3200, false, "") + d.update(3300, true, "A3:2F:91:0C");
  CHECK(sent == 2);                                     // a real second tap later
}

int main() {
  senderFormatsUids();
  everySenderFrameParses();
  malformedFramesAreRejected();
  hostileBytesAreSafe();
  crlfAndSplitReadsWork();
  cutOffFramesDoNotGlue();
  helloLines();
  oneEventPerTap();
  quickRetapIsOneEvent();
  std::printf("%d/%d checks passed\n", checks - failures, checks);
  return failures ? 1 : 0;
}
