// Campus Mithra - ESP32 kiosk: hold button -> record -> server (STT + RAG + Gemma + TTS) -> TFT text + speaker audio
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <TFT_eSPI.h>
#include "config.h"

TFT_eSPI tft;
#define C_BG     0x0884   // deep indigo
#define C_SAFF   0xFD09
#define C_TEAL   0x26F8
#define C_MUTE   0xBDF7

// Preset questions for the NEXT button: everything the kiosk must handle, ending
// with one that has to be refused. Keep them answerable from kb/.
const char* PRESETS[] = {"What are the hostel fees?", "Which bus route comes from Electronic City?",
                         "What is the highest placement package?", "Where can parents park their car?",
                         "How much does a masala dosa cost in the canteen?", "What is the tuition fee under KCET government quota?",
                         "What is the weather today?"};
const int NPRESETS = sizeof(PRESETS) / sizeof(PRESETS[0]);
int presetIdx = 0;

// ---------------- display helpers ----------------
void header() {
  tft.fillRect(0, 0, 320, 32, C_SAFF);
  tft.setTextColor(C_BG, C_SAFF);
  tft.drawString("Campus Mithra", 8, 5, 4);
  tft.fillCircle(305, 16, 6, WiFi.status() == WL_CONNECTED ? TFT_GREEN : TFT_RED);
}

void footer(const String& s, uint16_t col = C_MUTE) {
  tft.fillRect(0, 218, 320, 22, C_BG);
  tft.setTextColor(col, C_BG);
  tft.drawString(s, 8, 222, 2);
}

// word-wrapped text; returns y after last line
int wrapText(const String& s, int x, int y, int maxW, int lineH, int maxY, uint16_t col) {
  tft.setTextColor(col, C_BG);
  String line, word;
  for (unsigned i = 0; i <= s.length(); i++) {
    char c = i < s.length() ? s[i] : ' ';
    if (c != ' ') { word += c; continue; }
    String test = line.length() ? line + " " + word : word;
    if (tft.textWidth(test, 2) > maxW && line.length()) {
      tft.drawString(line, x, y, 2); y += lineH; line = word;
      if (y > maxY) return y;
    } else line = test;
    word = "";
  }
  if (line.length() && y <= maxY) { tft.drawString(line, x, y, 2); y += lineH; }
  return y;
}

void clearBody() { tft.fillRect(0, 32, 320, 186, C_BG); }

void idleScreen() {
  tft.fillScreen(C_BG); header();
  wrapText("Namaste! Ask me about admissions, fees, placements, hostels, buses, canteen and parking.", 10, 60, 300, 20, 150, TFT_WHITE);
  wrapText("HOLD the TALK button, speak, then release.", 10, 140, 300, 20, 200, C_TEAL);
  footer("Ready");
}

void showQA(const String& q, const String& a) {
  clearBody();
  int y = wrapText("Q: " + q, 8, 38, 304, 17, 72, C_TEAL) + 6;
  wrapText(a, 8, y, 304, 17, 212, TFT_WHITE);
}

void status(const String& s, uint16_t col) { footer(s, col); }

// ---------------- network ----------------
void connectWifi() {
  WiFi.mode(WIFI_STA); WiFi.begin(WIFI_SSID, WIFI_PASS);
  tft.fillScreen(C_BG); header(); wrapText(String("Connecting to Wi-Fi: ") + WIFI_SSID, 10, 60, 300, 20, 120, TFT_WHITE);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) delay(500);
  if (WiFi.status() == WL_CONNECTED) { Serial.println(WiFi.localIP()); idleScreen(); }
  else { footer("Wi-Fi failed - check config.h", TFT_RED); delay(3000); }
}

bool handleResponse(const String& payload) {
  JsonDocument doc;
  if (deserializeJson(doc, payload)) return false;
  String q = doc["q"] | "", a = doc["a"] | "", audio = doc["audio"] | "";
  showQA(q, a);
  if (audio.length()) {
    status("Speaking...", C_SAFF);
    HTTPClient http; http.begin(String(SERVER_URL) + audio); http.setTimeout(30000);
    if (http.GET() == 200) {
      WiFiClient* s = http.getStreamPtr(); int left = http.getSize();
      uint8_t buf[512]; const uint32_t period = 1000000UL / PLAY_RATE; uint32_t next = micros(); uint32_t idle = millis();
      while (http.connected() && left != 0) {
        size_t n = s->available();
        if (!n) { if (millis() - idle > 3000) break; delay(1); next = micros(); continue; }
        idle = millis();
        n = s->readBytes(buf, min(n, sizeof(buf)));
        for (size_t i = 0; i < n; i++) {
          while ((int32_t)(micros() - next) < 0) {}
          next += period;
          dacWrite(SPK_PIN, 128 + ((int)buf[i] - 128) * PLAY_VOLUME / 100);
        }
        if (left > 0) left -= n;
      }
    } else Serial.println("audio fetch failed (TTS offline?) - text only");
    http.end();
    dacWrite(SPK_PIN, 128);
  }
  return true;
}

void askText(const String& q) {
  status("Thinking...", C_SAFF);
  JsonDocument d; d["question"] = q; String body; serializeJson(d, body);
  HTTPClient http; http.begin(String(SERVER_URL) + "/api/esp/text"); http.addHeader("Content-Type", "application/json"); http.setTimeout(60000);
  int code = http.POST(body);
  if (code == 200 && handleResponse(http.getString())) status("Hold TALK to ask", C_MUTE);
  else status("Server error " + String(code), TFT_RED);
  http.end();
}

void askVoice() {
  const size_t maxN = (size_t)REC_RATE * REC_MAX_SEC;
  int16_t* buf = (int16_t*)malloc(maxN * 2);
  if (!buf) { status("Out of memory", TFT_RED); return; }
  status("Listening... release to send", TFT_RED);
  tft.fillCircle(305, 16, 6, TFT_RED);
  size_t n = 0; const uint32_t period = 1000000UL / REC_RATE; uint32_t next = micros();
  while (digitalRead(BTN_TALK) == LOW && n < maxN) {
    while ((int32_t)(micros() - next) < 0) {}
    next += period;
    buf[n++] = analogRead(MIC_PIN);
  }
  if (n < (size_t)REC_RATE / 2) { status("Too short - hold longer", TFT_RED); free(buf); return; }
  long sum = 0; int mn = 4095, mx = 0;
  for (size_t i = 0; i < n; i++) { sum += buf[i]; mn = min<int>(mn, buf[i]); mx = max<int>(mx, buf[i]); }
  int mean = sum / n;
  for (size_t i = 0; i < n; i++) buf[i] = constrain((buf[i] - mean) * MIC_GAIN * 4, -32768, 32767);   // 12-bit -> 16-bit, with gain
  Serial.printf("Recorded %u samples, ADC min=%d max=%d p-p=%d (aim for >200 while speaking)\n", (unsigned)n, mn, mx, mx - mn);
  header(); status("Thinking...  (mic p-p " + String(mx - mn) + ")", C_SAFF);
  HTTPClient http; http.begin(String(SERVER_URL) + "/api/esp/ask");
  http.addHeader("Content-Type", "application/octet-stream"); http.addHeader("X-Sample-Rate", String(REC_RATE)); http.setTimeout(90000);
  int code = http.POST((uint8_t*)buf, n * 2);
  free(buf);
  if (code == 200 && handleResponse(http.getString())) status("Hold TALK to ask again", C_MUTE);
  else status("Server error " + String(code), TFT_RED);
  http.end();
}

// ---------------- main ----------------
void setup() {
  Serial.begin(115200);
  pinMode(BTN_TALK, INPUT_PULLUP); pinMode(BTN_NEXT, INPUT_PULLUP);
  analogReadResolution(12); analogSetPinAttenuation(MIC_PIN, ADC_11db);
  dacWrite(SPK_PIN, 128);
  tft.init(); tft.setRotation(1); tft.fillScreen(C_BG);
  connectWifi();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) { connectWifi(); return; }
  if (digitalRead(BTN_TALK) == LOW) { delay(30); if (digitalRead(BTN_TALK) == LOW) { askVoice(); while (digitalRead(BTN_TALK) == LOW) delay(10); } }
  else if (digitalRead(BTN_NEXT) == LOW) {
    delay(30);
    if (digitalRead(BTN_NEXT) == LOW) { askText(PRESETS[presetIdx]); presetIdx = (presetIdx + 1) % NPRESETS; while (digitalRead(BTN_NEXT) == LOW) delay(10); }
  }
  delay(10);
}
