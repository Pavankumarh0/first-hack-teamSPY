/*
 * Campus Mithra - ESP32 display + speaker node
 *
 * The ESP32 is the face of the assistant; the PC is the brain.
 *
 *   earphone mic -> PC: Ctrl+Alt+4 -> Sarvam STT -> Gemma + RAG -> edge-tts
 *                                                                    |
 *                                       USB serial, 460800 baud      v
 *                                                              THIS FIRMWARE
 *                                                   TFT (Q + A) and PAM8403 speaker
 *
 * Serial rather than Wi-Fi: the board is already on a USB cable to be flashed,
 * so there are no credentials, no IP address to find, no firewall rule and no
 * router (or college client isolation) in the failure path.
 *
 * Based on the working "campus test" display node, which this extends with
 * real speech playback.
 *
 * ---------------------------------------------------------------------------
 * Protocol, PC -> ESP32: one command per line, '\n' terminated
 * ---------------------------------------------------------------------------
 *   Q:<text>      the visitor's question, shown in the top panel
 *   L:[prompt]    wake: show "Listening... speak now" (the PC mic is recording)
 *   M:<0-100>     live microphone level while listening
 *   R:<files>     knowledge-base file(s) the answer came from; send before A:
 *   A:<text>      the answer, shown in the bottom panel (paged if long)
 *   S:<text>      one-line status in the title bar
 *   AUD:<bytes>   spoken answer follows: <bytes> of raw unsigned 8-bit mono
 *                 PCM at PLAY_RATE, sent ONLY as the ESP32 grants credit
 *   VOL:<0-100>   speaker volume
 *   CLR           back to the idle screen
 *   BEEP          short chime
 *   PING          replies PONG
 *
 * ESP32 -> PC
 *   PONG                  reply to PING
 *   C:<bytes>             credit: the PC may send this many more audio bytes
 *   DONE:<played>,<gaps>  audio finished; gaps = times the buffer ran dry
 *   ERR:<message>         something went wrong
 *   [esp] <text>          log line, for humans
 *
 * Why credit flow control: the PC can send ~46 KB/s, the speaker plays 8 KB/s.
 * Without it a long answer would overflow any buffer. With it the PC only ever
 * sends what is known to fit, so no byte is lost regardless of answer length.
 *
 * ---------------------------------------------------------------------------
 * Hardware
 * ---------------------------------------------------------------------------
 * TFT: pins are build flags in platformio.ini (MOSI 23, SCLK 18, CS 5, DC 2,
 *      RST 4, MISO 19) - the wiring already working on this board.
 * Speaker: GPIO25 (DAC 1) -> attenuator -> PAM8403 input. See playAudio notes.
 *
 * Only one program can hold the COM port: close `pio device monitor` before
 * starting pc_client.py.
 */

#include <Arduino.h>
#include <TFT_eSPI.h>
#include <driver/dac.h>
#include "config.h"

TFT_eSPI tft = TFT_eSPI();

static const int16_t SCREEN_W = 320;     // landscape (rotation 1)
static const int16_t SCREEN_H = 240;

// ---------------------------------------------------------------------------
// Palette - dark, easy on a small backlit panel; saffron + teal from the
// Campus Mithra brand.
// ---------------------------------------------------------------------------
static const uint16_t COL_BG     = 0x0861;   // near-black blue
static const uint16_t COL_CARD   = 0x18E3;   // panel fill
static const uint16_t COL_SAFF   = 0xF444;   // saffron   #f08a24
static const uint16_t COL_TEAL   = 0x0CD1;   // teal      #0f9b8e
static const uint16_t COL_TEXT   = TFT_WHITE;
static const uint16_t COL_DIM    = 0x8410;   // grey secondary text

// Layout. The question is usually short and the answer long, so the answer
// panel gets most of the height.
static const int16_t BAR_H  = 26;
static const int16_t Q_TOP  = BAR_H + 5;
static const int16_t Q_H    = 62;
static const int16_t A_TOP  = Q_TOP + Q_H + 5;
static const int16_t A_H    = SCREEN_H - A_TOP - 4;
static const int16_t PAD    = 8;
static const int16_t LABEL_H = 20;           // panel label strip

static const size_t MAX_LINE = 600;          // longest text line accepted

static uint32_t messageCount = 0;


// ---------------------------------------------------------------------------
// Text sanitising
// ---------------------------------------------------------------------------

/*
 * The built-in TFT_eSPI fonts hold ASCII 32..126 only. Kannada and Hindi need a
 * generated custom font, which is a separate job; until then each UTF-8
 * sequence becomes a single '?' rather than mojibake.
 */
static void sanitiseAscii(const char *in, char *out, size_t outSize, bool *dropped) {
  size_t o = 0;
  *dropped = false;
  for (size_t i = 0; in[i] != '\0' && o + 1 < outSize; i++) {
    uint8_t c = (uint8_t)in[i];
    if (c >= 0x20 && c <= 0x7E) { out[o++] = (char)c; continue; }
    if (c == '\t') { out[o++] = ' '; continue; }
    if (c < 0x80) continue;
    *dropped = true;
    out[o++] = '?';
    while (((uint8_t)in[i + 1] & 0xC0) == 0x80) i++;
  }
  out[o] = '\0';
}


// ---------------------------------------------------------------------------
// Word wrap with paging
// ---------------------------------------------------------------------------

/*
 * Lays out `text` from `start`, word-wrapped into at most maxLines lines of
 * maxW pixels, drawing them only when `draw` is set. Returns the offset of the
 * first character it could not place - the start of the next page.
 *
 * One function does both measuring and drawing, so the page breaks computed
 * up front are exactly the ones drawn later.
 */
static size_t wrapPass(const char *text, size_t start, uint8_t font,
                       int16_t maxW, int maxLines, bool draw,
                       int16_t x, int16_t y, uint16_t colour, uint16_t bg) {
  if (maxLines <= 0) return start;
  const int16_t lineH = tft.fontHeight(font) + 2;
  if (draw) { tft.setTextColor(colour, bg); tft.setTextDatum(TL_DATUM); }

  static char line[MAX_LINE + 1];
  static char cand[MAX_LINE + 1];
  size_t lineLen = 0;
  int lines = 0;
  size_t i = start;
  while (text[i] == ' ') i++;

  while (text[i] != '\0') {
    const size_t ws = i;
    while (text[i] != '\0' && text[i] != ' ') i++;
    const size_t wl = i - ws;

    size_t c = 0;
    if (lineLen) { memcpy(cand, line, lineLen); c = lineLen; cand[c++] = ' '; }
    size_t copy = wl;
    if (c + copy > MAX_LINE) copy = MAX_LINE - c;
    memcpy(cand + c, text + ws, copy);
    c += copy;
    cand[c] = '\0';

    // A word that is first on its line is placed even if too wide, so an
    // over-long token (a URL) cannot stall the layout forever.
    if (lineLen == 0 || tft.textWidth(cand, font) <= maxW) {
      memcpy(line, cand, c + 1);
      lineLen = c;
      while (text[i] == ' ') i++;
      continue;
    }

    if (draw) tft.drawString(line, x, y + lines * lineH, font);
    lines++;
    lineLen = 0;
    if (lines >= maxLines) return ws;   // page full - next page starts here
    i = ws;                             // place this word on the new line
  }

  if (lineLen) {
    if (draw) tft.drawString(line, x, y + lines * lineH, font);
  }
  return i;
}

static int linesFor(uint8_t font, int16_t h) {
  return h / (tft.fontHeight(font) + 2);
}


// ---------------------------------------------------------------------------
// Screen furniture
// ---------------------------------------------------------------------------

static void drawTitleBar(const char *status) {
  tft.fillRect(0, 0, SCREEN_W, BAR_H, COL_CARD);
  tft.fillCircle(13, BAR_H / 2, 5, COL_SAFF);
  tft.setTextDatum(ML_DATUM);
  tft.setTextColor(COL_TEXT, COL_CARD);
  tft.drawString("Campus Mithra", 25, BAR_H / 2, 2);
  tft.setTextDatum(MR_DATUM);
  tft.setTextColor(COL_DIM, COL_CARD);
  tft.drawString(status, SCREEN_W - 8, BAR_H / 2, 2);
}

static void drawPanel(int16_t top, int16_t h, const char *label, uint16_t labelColour,
                      const char *right = nullptr) {
  tft.fillRoundRect(0, top, SCREEN_W, h, 4, COL_BG);
  tft.drawRoundRect(0, top, SCREEN_W, h, 4, COL_CARD);
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(labelColour, COL_BG);
  tft.drawString(label, PAD, top + 3, 2);
  if (right) {
    tft.setTextDatum(TR_DATUM);
    tft.setTextColor(COL_DIM, COL_BG);
    tft.drawString(right, SCREEN_W - PAD, top + 3, 2);
  }
}

static void drawPlaceholder(int16_t top, int16_t h, const char *text) {
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(COL_DIM, COL_BG);
  tft.drawString(text, SCREEN_W / 2, top + LABEL_H + (h - LABEL_H) / 2, 2);
}

static void drawIdleScreen() {
  tft.fillScreen(COL_BG);
  drawTitleBar("ready");
  drawPanel(Q_TOP, Q_H, "YOU ASKED", COL_TEAL);
  drawPlaceholder(Q_TOP, Q_H, "Press Ctrl+Alt+4 on the PC and speak");
  drawPanel(A_TOP, A_H, "MITHRA", COL_SAFF);
  drawPlaceholder(A_TOP, A_H, "Ask about fees, hostel, buses, placements...");
}

// --- question ---------------------------------------------------------------

static void showQuestion(const char *text) {
  static char clean[MAX_LINE + 1];
  bool dropped = false;
  sanitiseAscii(text, clean, sizeof(clean), &dropped);

  drawPanel(Q_TOP, Q_H, "YOU ASKED", COL_TEAL);
  const int16_t bodyH = Q_H - LABEL_H - 2;
  const int16_t bodyW = SCREEN_W - 2 * PAD;
  // Big font if it fits on the space available, otherwise the small one.
  uint8_t font = 4;
  if (wrapPass(clean, 0, 4, bodyW, linesFor(4, bodyH), false, 0, 0, 0, 0) < strlen(clean)) {
    font = 2;
  }
  wrapPass(clean, 0, font, bodyW, linesFor(font, bodyH), true,
           PAD, Q_TOP + LABEL_H, COL_TEXT, COL_BG);

  // The question has changed, so the old answer is now wrong: clear it.
  drawPanel(A_TOP, A_H, "MITHRA", COL_SAFF);
  drawPlaceholder(A_TOP, A_H, "thinking...");

  if (dropped) Serial.println(F("[esp] non-ASCII characters shown as '?'"));
}

// --- answer, with paging ----------------------------------------------------

static const int MAX_PAGES = 8;
static char   answerText[MAX_LINE + 1];
static char   answerSource[80] = "";     // knowledge-base file(s) the answer came from
static uint8_t answerFont = 2;
static size_t pageStart[MAX_PAGES + 1];
static int    pageCount = 0;
static int    pageShown = -1;

/* Draws the source file name(s) beside the MITHRA label, shortened to fit
   between the label and the page counter. */
static void drawSource(int16_t counterW) {
  if (!answerSource[0]) return;
  const int16_t x = PAD + tft.textWidth("MITHRA", 2) + 10;
  const int16_t maxW = SCREEN_W - PAD - counterW - x - (counterW ? 8 : 0);
  if (maxW <= 20) return;
  char shown[sizeof(answerSource)];
  strncpy(shown, answerSource, sizeof(shown) - 1);
  shown[sizeof(shown) - 1] = '\0';
  size_t len = strlen(shown);
  while (len > 2 && tft.textWidth(shown, 2) > maxW) {     // shorten with ".."
    shown[--len] = '\0';
    shown[len - 1] = '.';
    shown[len - 2] = '.';
  }
  tft.setTextDatum(TL_DATUM);
  tft.setTextColor(COL_TEAL, COL_BG);
  tft.drawString(shown, x, A_TOP + 3, 2);
}

static void drawAnswerPage(int page) {
  if (page < 0 || page >= pageCount) return;
  char counter[12] = "";
  if (pageCount > 1) snprintf(counter, sizeof(counter), "%d/%d", page + 1, pageCount);
  drawPanel(A_TOP, A_H, "MITHRA", COL_SAFF, pageCount > 1 ? counter : nullptr);
  drawSource(pageCount > 1 ? tft.textWidth(counter, 2) : 0);

  const int16_t bodyH = A_H - LABEL_H - 2;
  const int16_t bodyW = SCREEN_W - 2 * PAD;
  wrapPass(answerText, pageStart[page], answerFont, bodyW, linesFor(answerFont, bodyH),
           true, PAD, A_TOP + LABEL_H, COL_TEXT, COL_BG);
  pageShown = page;
}

/*
 * Splits the answer into screen-sized pages. Short answers get the large font
 * on one page; longer ones use the small font and, if still too long, several
 * pages that turn automatically while the answer is spoken.
 */
static void showAnswer(const char *text) {
  bool dropped = false;
  sanitiseAscii(text, answerText, sizeof(answerText), &dropped);
  const size_t len = strlen(answerText);
  const int16_t bodyH = A_H - LABEL_H - 2;
  const int16_t bodyW = SCREEN_W - 2 * PAD;

  answerFont = 4;
  if (wrapPass(answerText, 0, 4, bodyW, linesFor(4, bodyH), false, 0, 0, 0, 0) < len) {
    answerFont = 2;
  }

  pageCount = 0;
  size_t at = 0;
  while (pageCount < MAX_PAGES) {
    pageStart[pageCount++] = at;
    size_t next = wrapPass(answerText, at, answerFont, bodyW,
                           linesFor(answerFont, bodyH), false, 0, 0, 0, 0);
    if (next >= len || next == at) break;
    at = next;
  }
  pageStart[pageCount] = len;

  drawAnswerPage(0);
  if (dropped) Serial.println(F("[esp] non-ASCII characters shown as '?'"));
}


// ---------------------------------------------------------------------------
// Speaker
// ---------------------------------------------------------------------------

/*
 * GPIO25 is DAC channel 1. Arduino's dacWrite() re-runs dac_output_enable() on
 * every call, which is wasted work 8,000 times a second, so the DAC is enabled
 * once and samples go straight to dac_output_voltage().
 *
 * Audio is centred on 128 (about 1.65 V). Holding that level while idle would
 * feed a constant DC offset into the amplifier, so the output idles at 0 and
 * ramps up to 128 before each clip and back down after - which also removes
 * the click that a sudden jump would make.
 */
static const uint32_t PERIOD_US = 1000000UL / PLAY_RATE;
static uint8_t dacLevel = 0;
static uint8_t volumePct = PLAY_VOLUME;

static inline void dacOut(uint8_t v) {
  dac_output_voltage(DAC_CHANNEL_1, v);
  dacLevel = v;
}

static void dacRamp(uint8_t target) {      // ~20 ms, inaudible
  while (dacLevel != target) {
    dacOut(dacLevel < target ? dacLevel + 1 : dacLevel - 1);
    delayMicroseconds(150);
  }
}

static inline uint8_t scaled(uint8_t s) {
  int v = 128 + (((int)s - 128) * volumePct) / 100;
  return (uint8_t)(v < 0 ? 0 : v > 255 ? 255 : v);
}

// --- chime ------------------------------------------------------------------

static const int8_t SINE32[32] = {
    0,  25,  49,  71,  90, 106, 117, 125, 127, 125, 117, 106,  90,  71,  49,  25,
    0, -25, -49, -71, -90,-106,-117,-125,-127,-125,-117,-106, -90, -71, -49, -25};

static void playTone(uint16_t freq, uint16_t ms) {
  const uint32_t step = (uint32_t)freq * 32UL * 65536UL / PLAY_RATE;   // 16.16
  const uint32_t n = (uint32_t)PLAY_RATE * ms / 1000;
  uint32_t phase = 0, next = micros();
  for (uint32_t i = 0; i < n; i++) {
    while ((int32_t)(micros() - next) < 0) {}
    next += PERIOD_US;
    int s = SINE32[(phase >> 16) & 31];
    phase += step;
    dacOut((uint8_t)(128 + (s * volumePct) / 250));   // quieter than speech
  }
}

static void playChime() {
  dacRamp(128);
  playTone(880, 90);
  playTone(1320, 120);
  dacRamp(0);
}

// --- streamed speech ----------------------------------------------------------

static uint8_t ring[AUDIO_RING_BYTES];
static size_t ringHead = 0, ringTail = 0, ringCount = 0;

static struct {
  bool active;
  bool playing;          // prebuffer reached, samples flowing
  bool starved;          // currently in an underrun
  uint32_t total, received, granted, played, gaps;
  uint32_t nextUs, lastRxMs;
} aud;

static void grantCredit() {
  const uint32_t outstanding = aud.granted - aud.received;
  const int32_t room = (int32_t)AUDIO_RING_BYTES - (int32_t)ringCount - (int32_t)outstanding;
  const uint32_t left = aud.total - aud.granted;
  if (left == 0 || room <= 0) return;
  uint32_t g = (uint32_t)room;
  if (g > left) g = left;
  if (g < AUDIO_CREDIT_STEP && g < left) return;    // wait for a worthwhile chunk
  aud.granted += g;
  Serial.printf("C:%lu\n", (unsigned long)g);
}

static void startAudio(uint32_t bytes) {
  if (bytes == 0) { Serial.println(F("DONE:0,0")); return; }
  ringHead = ringTail = ringCount = 0;
  memset(&aud, 0, sizeof(aud));
  aud.total = bytes;
  aud.active = true;
  drawTitleBar("speaking");            // all drawing happens before audio starts
  dacRamp(128);
  aud.lastRxMs = millis();
  grantCredit();
}

static void finishAudio(bool ok) {
  dacRamp(0);
  aud.active = false;
  if (ok) {
    Serial.printf("DONE:%lu,%lu\n", (unsigned long)aud.played, (unsigned long)aud.gaps);
  } else {
    Serial.printf("ERR:audio timed out after %lu of %lu bytes\n",
                  (unsigned long)aud.received, (unsigned long)aud.total);
    delay(50);
    while (Serial.available()) Serial.read();   // drop any late stragglers
  }
  drawTitleBar("ready");
}

/* Called continuously while a clip is active. Never blocks. */
static void serviceAudio() {
  // 1. Move whatever has arrived into the ring, in contiguous runs.
  while (aud.received < aud.total && ringCount < AUDIO_RING_BYTES) {
    size_t avail = Serial.available();
    if (avail == 0) break;
    size_t run = AUDIO_RING_BYTES - ringHead;              // to the wrap point
    size_t space = AUDIO_RING_BYTES - ringCount;
    size_t want = aud.total - aud.received;
    size_t n = avail;
    if (n > run) n = run;
    if (n > space) n = space;
    if (n > want) n = want;
    n = Serial.read(ring + ringHead, n);
    if (n == 0) break;
    ringHead = (ringHead + n) % AUDIO_RING_BYTES;
    ringCount += n;
    aud.received += n;
    aud.lastRxMs = millis();
  }

  // 2. Start once a little is buffered, so a USB hiccup at the start doesn't stutter.
  if (!aud.playing && (ringCount >= AUDIO_PREBUFFER || aud.received == aud.total)) {
    aud.playing = true;
    aud.nextUs = micros();
  }

  // 3. Output every sample that is due.
  if (aud.playing) {
    const uint32_t now = micros();
    // After a stall (a page being drawn), resume rather than rush to catch up.
    if ((int32_t)(now - aud.nextUs) > 20000) aud.nextUs = now;
    while ((int32_t)(now - aud.nextUs) >= 0) {
      if (ringCount > 0) {
        dacOut(scaled(ring[ringTail]));
        ringTail = (ringTail + 1) % AUDIO_RING_BYTES;
        ringCount--;
        aud.played++;
        aud.starved = false;
      } else if (aud.received < aud.total && !aud.starved) {
        aud.starved = true;            // count each dry spell once, not per sample
        aud.gaps++;
      }
      aud.nextUs += PERIOD_US;
    }
  }

  // 4. Turn the answer's pages in step with the speech.
  if (pageCount > 1) {
    int page = (int)((uint64_t)aud.played * pageCount / aud.total);
    if (page >= pageCount) page = pageCount - 1;
    if (page != pageShown) drawAnswerPage(page);
  }

  // 5. Let the PC send more.
  grantCredit();

  // 6. Done, or abandoned.
  if (aud.received == aud.total && ringCount == 0) {
    finishAudio(true);
  } else if (aud.received < aud.total && millis() - aud.lastRxMs > AUDIO_TIMEOUT_MS) {
    finishAudio(false);
  }
}


// ---------------------------------------------------------------------------
// Protocol
// ---------------------------------------------------------------------------

static void handleLine(char *line) {
  size_t len = strlen(line);
  while (len > 0 && (line[len - 1] == '\r' || line[len - 1] == ' ' || line[len - 1] == '\t')) {
    line[--len] = '\0';
  }
  if (len == 0) return;

  if (strcmp(line, "PING") == 0) { Serial.println(F("PONG")); return; }
  if (strcmp(line, "CLR") == 0) { drawIdleScreen(); Serial.println(F("[esp] cleared")); return; }
  if (strcmp(line, "BEEP") == 0) { playChime(); Serial.println(F("[esp] beep")); return; }

  if (strncmp(line, "AUD:", 4) == 0) {
    startAudio((uint32_t)strtoul(line + 4, nullptr, 10));
    return;
  }
  if (strncmp(line, "VOL:", 4) == 0) {
    long v = strtol(line + 4, nullptr, 10);
    volumePct = (uint8_t)(v < 0 ? 0 : v > 100 ? 100 : v);
    Serial.printf("[esp] volume %u\n", volumePct);
    return;
  }

  if (len >= 2 && line[1] == ':') {
    const char *body = line + 2;
    switch (line[0]) {
      case 'L': {
        // Wake: the PC has started listening on the earphone mic.
        answerSource[0] = '\0';
        const char *prompt = body[0] ? body : "Listening... speak now";
        drawPanel(Q_TOP, Q_H, "YOU ASKED", COL_TEAL);
        const uint8_t f = tft.textWidth(prompt, 4) <= SCREEN_W - 2 * PAD ? 4 : 2;
        tft.setTextDatum(MC_DATUM);
        tft.setTextColor(COL_TEAL, COL_BG);
        tft.drawString(prompt, SCREEN_W / 2, Q_TOP + LABEL_H + (Q_H - LABEL_H) / 2 - 3, f);
        drawPanel(A_TOP, A_H, "MITHRA", COL_SAFF);
        drawPlaceholder(A_TOP, A_H, "I'll answer as soon as you finish");
        drawTitleBar("listening");
        return;
      }
      case 'M': {
        // Live microphone level 0-100 while listening: a bar along the bottom
        // of the question panel, so the visitor can see they are being heard.
        long lvl = strtol(body, nullptr, 10);
        lvl = lvl < 0 ? 0 : lvl > 100 ? 100 : lvl;
        const int16_t x = PAD, y = Q_TOP + Q_H - 7, w = SCREEN_W - 2 * PAD;
        const int16_t fill = (int16_t)(w * lvl / 100);
        tft.fillRect(x, y, fill, 3, lvl > 15 ? COL_SAFF : COL_TEAL);
        tft.fillRect(x + fill, y, w - fill, 3, COL_CARD);
        return;
      }
      case 'R': {
        // Source file(s) for the next answer. Sent before A: so the answer
        // panel is drawn complete, once.
        bool dropped = false;
        sanitiseAscii(body, answerSource, sizeof(answerSource), &dropped);
        Serial.printf("[esp] source: %s\n", answerSource);
        return;
      }
      case 'Q':
        messageCount++;
        answerSource[0] = '\0';        // a new question has no source yet
        showQuestion(body);
        drawTitleBar("thinking");
        Serial.printf("[esp] Q #%lu (%u chars)\n", (unsigned long)messageCount, (unsigned)strlen(body));
        return;
      case 'A':
        showAnswer(body);
        drawTitleBar("answer");
        Serial.printf("[esp] A (%u chars, %d page%s)\n", (unsigned)strlen(body),
                      pageCount, pageCount == 1 ? "" : "s");
        return;
      case 'S':
        drawTitleBar(body);
        return;
      default:
        break;
    }
  }
  Serial.printf("ERR:unknown command: %.40s\n", line);
}

/* Non-blocking line reader. Over-long lines are truncated, never overflowed. */
static void pollSerial() {
  static char buf[MAX_LINE + 1];
  static size_t n = 0;
  static bool overflowed = false;

  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      buf[n] = '\0';
      if (overflowed) Serial.println(F("[esp] warning: line was truncated"));
      handleLine(buf);
      n = 0;
      overflowed = false;
      // AUD: switches the link to binary audio - stop parsing lines at once,
      // or the first audio bytes would be read as text.
      if (aud.active) return;
      continue;
    }
    if (n < MAX_LINE) buf[n++] = c;
    else overflowed = true;
  }
}


// ---------------------------------------------------------------------------

void setup() {
  // Bigger than the 256-byte default, so a burst of audio waits in the driver
  // rather than being dropped while the loop is busy drawing.
  Serial.setRxBufferSize(4096);
  Serial.begin(SERIAL_BAUD);
  delay(200);

  dac_output_enable(DAC_CHANNEL_1);
  dacOut(0);

  tft.init();
  tft.setRotation(1);
  drawIdleScreen();

  setup_t cfg;
  tft.getSetup(cfg);
  Serial.println();
  Serial.println(F("[esp] Campus Mithra display + speaker node"));
  Serial.printf("[esp] TFT driver 0x%04X %dx%d  CS=%d DC=%d RST=%d  |  speaker GPIO%d @ %d Hz, volume %u\n",
                cfg.tft_driver, cfg.tft_width, cfg.tft_height,
                cfg.pin_tft_cs, cfg.pin_tft_dc, cfg.pin_tft_rst,
                SPK_PIN, PLAY_RATE, volumePct);
  Serial.println(F("[esp] ready"));
}

void loop() {
  if (aud.active) {          // tight loop while speaking: samples are due every 125 us
    serviceAudio();
    return;
  }
  pollSerial();
  delay(1);
}
