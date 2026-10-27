/*
 * Campus Mithra - camera node
 * Second ESP32 DevKit V1 + OV7670 (no FIFO). Milestone 1: the camera on its own.
 *
 * At boot it diagnoses the OV7670 control bus (SCCB) in detail, then starts
 * the esp32-camera driver, which captures the parallel data bus with the
 * ESP32's I2S peripheral and DMA - no FIFO chip needed. Images are sent over
 * USB serial; camera/tools/cam_grab.py on the PC saves them as PNG.
 *
 * Live view over Wi-Fi: open http://mithra-cam.local/ (or the IP printed at
 * boot, or http://192.168.4.1/ on the camera's own hotspot) in any browser.
 * Wi-Fi settings are in cam_config.h and secrets.h. The browser and the serial
 * commands share one loop, so a frame is never captured for both at once.
 *   GET  /            the live-view page (web_page.h)
 *   GET  /frame       one raw frame; size and format in X-Width, X-Height, X-Format
 *   GET  /status      JSON: running, size, format, colour bars, memory, Wi-Fi
 *   POST /cmd?c=...   BARS 0|1, RES <size>, FMT <format> - as on the serial port
 *
 * Open this folder in Arduino IDE: Tools > Board > "ESP32 Dev Module",
 * PSRAM "Disabled", and select the CAMERA board's port - never the kiosk's.
 * All pins and settings are in cam_config.h.
 *
 * Serial commands, one per line, at CAM_SERIAL_BAUD (921600):
 *   PING                    -> PONG CAM (the kiosk answers plain PONG, so a port
 *                           scan can always tell the two boards apart)
 *   INFO                    sensor ID, settings, free memory
 *   CAP                     capture and send one frame (see "Frame transfer")
 *   STATS                   capture one frame, print its statistics only
 *   Both always return a frame taken after the command arrived, never an old one.
 *   BARS 1 | BARS 0         the sensor's built-in colour-bar test pattern
 *   RES QQVGA | QCIF | QVGA frame size (restarts the camera)
 *   FMT RGB565 | YUV422 | GRAY
 *   DIAG                    re-run the SCCB diagnosis (restarts the camera)
 *   START                   start the camera even if the diagnosis failed
 *   WIFI                    Wi-Fi mode, network, address and signal
 *
 * Frame transfer:
 *   IMG w=<w> h=<h> fmt=<fmt> len=<bytes> fnv=<hex> ms=<capture ms>\n
 *   <len raw bytes, exactly as they came off the camera bus>
 *   \nEND\n
 * fnv is the FNV-1a 32-bit hash of the bytes, so the PC can prove the frame
 * arrived intact.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include "esp_camera.h"
#include "cam_config.h"
#include "sccb_diag.h"
#include "web_page.h"
#if __has_include("secrets.h")
#include "secrets.h"                   // WIFI_SSID, WIFI_PASS - copy secrets.h.example
#endif

static framesize_t curSize = CAM_DEFAULT_FRAMESIZE;
static pixformat_t curFmt = CAM_DEFAULT_PIXFORMAT;
static bool camReady = false;
static bool barsOn = false;
static SccbIds ids = {false, -1, -1, -1, -1};
static String camError;                // why the camera is not running, for the browser
static WebServer web(80);
static bool wifiUp = false;


// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

static const char *fmtName(pixformat_t f) {
  switch (f) {
    case PIXFORMAT_RGB565: return "RGB565";
    case PIXFORMAT_YUV422: return "YUV422";
    case PIXFORMAT_GRAYSCALE: return "GRAY";
    default: return "?";
  }
}

static const char *sizeName(framesize_t s) {
  switch (s) {
    case FRAMESIZE_QQVGA: return "QQVGA";
    case FRAMESIZE_QCIF:  return "QCIF";
    case FRAMESIZE_QVGA:  return "QVGA";
    default: return "?";
  }
}

static void sizeWH(framesize_t s, int &w, int &h) {
  switch (s) {
    case FRAMESIZE_QQVGA: w = 160; h = 120; break;
    case FRAMESIZE_QCIF:  w = 176; h = 144; break;
    case FRAMESIZE_QVGA:  w = 320; h = 240; break;
    default:              w = 0;   h = 0;   break;
  }
}

static uint32_t fnv1a(const uint8_t *p, size_t n) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < n; i++) { h ^= p[i]; h *= 16777619u; }
  return h;
}


// ---------------------------------------------------------------------------
// camera driver
// ---------------------------------------------------------------------------

static void cameraStop() {
  if (camReady) {
    esp_camera_deinit();
    camReady = false;
  }
}

static bool cameraStart() {
  cameraStop();
  int w, h;
  sizeWH(curSize, w, h);
  const size_t need = (size_t)w * h * (curFmt == PIXFORMAT_GRAYSCALE ? 1 : 2);
  const size_t largest = heap_caps_get_largest_free_block(MALLOC_CAP_8BIT);
  Serial.printf("[cam] starting camera: %dx%d %s, frame %u bytes, largest free block %u bytes\n",
                w, h, fmtName(curFmt), (unsigned)need, (unsigned)largest);
  if (need + 16384 > largest) {
    camError = "that frame size and format do not fit in RAM - use QQVGA, or GRAY for QVGA";
    Serial.println(F("[cam] ERROR: that frame does not fit in RAM (this board has no PSRAM)."));
    Serial.println(F("[cam]        Use RES QQVGA, or FMT GRAY for QVGA."));
    return false;
  }

  camera_config_t c = {};
  c.pin_pwdn = CAM_PIN_PWDN;
  c.pin_reset = CAM_PIN_RESET;
  c.pin_xclk = CAM_PIN_XCLK;
  c.pin_sccb_sda = CAM_PIN_SIOD;
  c.pin_sccb_scl = CAM_PIN_SIOC;
  c.pin_d7 = CAM_PIN_D7;
  c.pin_d6 = CAM_PIN_D6;
  c.pin_d5 = CAM_PIN_D5;
  c.pin_d4 = CAM_PIN_D4;
  c.pin_d3 = CAM_PIN_D3;
  c.pin_d2 = CAM_PIN_D2;
  c.pin_d1 = CAM_PIN_D1;
  c.pin_d0 = CAM_PIN_D0;
  c.pin_vsync = CAM_PIN_VSYNC;
  c.pin_href = CAM_PIN_HREF;
  c.pin_pclk = CAM_PIN_PCLK;
  c.xclk_freq_hz = CAM_XCLK_HZ;
  c.ledc_timer = LEDC_TIMER_0;
  c.ledc_channel = LEDC_CHANNEL_0;
  c.pixel_format = curFmt;
  c.frame_size = curSize;
  c.jpeg_quality = 12;                 // unused: the OV7670 has no JPEG encoder
  c.fb_count = 1;                      // one buffer: all there is room for
  c.fb_location = CAMERA_FB_IN_DRAM;
  c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;

  const uint32_t t0 = millis();
  const esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    camError = String("camera driver failed to start: ") + esp_err_to_name(err);
    Serial.printf("[cam] ERROR: esp_camera_init failed: 0x%x %s (%lu ms)\n",
                  (unsigned)err, esp_err_to_name(err), (unsigned long)(millis() - t0));
    if (err == ESP_ERR_NOT_FOUND || err == ESP_ERR_NOT_SUPPORTED)
      Serial.println(F("[cam]        The driver could not identify the sensor - see the SCCB diagnosis."));
    else if (err == ESP_ERR_NO_MEM)
      Serial.println(F("[cam]        Out of memory - use a smaller frame or GRAY."));
    return false;
  }

  sensor_t *s = esp_camera_sensor_get();
  Serial.printf("[cam] camera driver up in %lu ms: PID=0x%02X VER=0x%02X MIDH=0x%02X MIDL=0x%02X\n",
                (unsigned long)(millis() - t0), s->id.PID, s->id.VER, s->id.MIDH, s->id.MIDL);
  if (s->id.PID != OV7670_PID)
    Serial.println(F("[cam] WARNING: the driver found a sensor that is not an OV7670."));
  if (s->set_colorbar) s->set_colorbar(s, barsOn ? 1 : 0);

  // The first frames come out before auto-exposure settles; throw them away.
  for (int i = 0; i < 3; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  camReady = true;
  camError = "";
  return true;
}


// ---------------------------------------------------------------------------
// frame checks - what proves the image data is real
// ---------------------------------------------------------------------------

static void printStats(const camera_fb_t *fb, uint32_t ms) {
  uint32_t ones[8] = {0};
  uint8_t mn = 255, mx = 0;
  uint64_t total = 0;
  for (size_t i = 0; i < fb->len; i++) {
    const uint8_t b = fb->buf[i];
    if (b < mn) mn = b;
    if (b > mx) mx = b;
    total += b;
    for (int k = 0; k < 8; k++) ones[k] += (b >> k) & 1;
  }
  Serial.printf("[cam] frame %ux%u %s, %u bytes in %lu ms | byte min %u max %u mean %.1f\n",
                (unsigned)fb->width, (unsigned)fb->height, fmtName(fb->format),
                (unsigned)fb->len, (unsigned long)ms, mn, mx, (double)total / fb->len);

  // Every byte crossed the 8-wire data bus, so bit k of every byte is wire Dk.
  // A wire that is always 0 or always 1 is broken, shorted or on the wrong pin.
  static const int gpio[8] = {CAM_PIN_D0, CAM_PIN_D1, CAM_PIN_D2, CAM_PIN_D3,
                              CAM_PIN_D4, CAM_PIN_D5, CAM_PIN_D6, CAM_PIN_D7};
  Serial.print(F("[cam] data lines, share of 1s:"));
  for (int k = 0; k < 8; k++) Serial.printf(" D%d=%.2f", k, (double)ones[k] / fb->len);
  Serial.println();
  int stuck = 0;
  for (int k = 0; k < 8; k++) {
    const double duty = (double)ones[k] / fb->len;
    if (duty < 0.002 || duty > 0.998) {
      Serial.printf("[cam] %s: D%d (GPIO%d) is stuck at %d\n", barsOn ? "FAULT" : "warning",
                    k, gpio[k], duty > 0.5 ? 1 : 0);
      stuck++;
    }
  }
  if (mn == mx)
    Serial.println(F("[cam] FAULT: every byte is identical - no real image data (check PCLK, HREF, D0-D7)."));
  else if (stuck && !barsOn)
    Serial.println(F("[cam]        (a dark scene can do this to D6/D7 - confirm with BARS 1)"));
  else if (!stuck)
    Serial.println(F("[cam] data bus OK: all 8 lines toggle"));
}

static camera_fb_t *grab(uint32_t &ms) {
  if (!camReady) {
    Serial.println(F("[cam] ERROR: camera not running (see the messages above, or send START)."));
    return nullptr;
  }
  // With one buffer and CAMERA_GRAB_WHEN_EMPTY the driver refills the buffer as
  // soon as the last frame is returned, so what is waiting now was taken when
  // the previous command ran - possibly minutes ago. Throw it away.
  camera_fb_t *stale = esp_camera_fb_get();
  if (stale) esp_camera_fb_return(stale);
  const uint32_t t0 = millis();
  camera_fb_t *fb = esp_camera_fb_get();
  ms = millis() - t0;
  if (!fb) {
    Serial.printf("[cam] ERROR: no frame after %lu ms. The sensor answers on SCCB but no picture is\n",
                  (unsigned long)ms);
    Serial.println(F("[cam]        arriving: check VS=GPIO25, HS=GPIO23, PCLK=GPIO22 and XCLK=GPIO21."));
  }
  return fb;
}

static void sendFrame() {
  uint32_t ms;
  camera_fb_t *fb = grab(ms);
  if (!fb) return;
  printStats(fb, ms);
  Serial.printf("IMG w=%u h=%u fmt=%s len=%u fnv=%08lx ms=%lu\n",
                (unsigned)fb->width, (unsigned)fb->height, fmtName(fb->format),
                (unsigned)fb->len, (unsigned long)fnv1a(fb->buf, fb->len), (unsigned long)ms);
  Serial.write(fb->buf, fb->len);
  Serial.print(F("\nEND\n"));
  Serial.flush();
  esp_camera_fb_return(fb);
}


// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

static void printInfo() {
  int w, h;
  sizeWH(curSize, w, h);
  Serial.printf("[cam] camera %s | %dx%d %s | colour bars %s | XCLK %d MHz\n",
                camReady ? "running" : "STOPPED", w, h, fmtName(curFmt), barsOn ? "on" : "off",
                CAM_XCLK_HZ / 1000000);
  if (camReady) {
    sensor_t *s = esp_camera_sensor_get();
    Serial.printf("[cam] sensor PID=0x%02X VER=0x%02X MIDH=0x%02X MIDL=0x%02X\n",
                  s->id.PID, s->id.VER, s->id.MIDH, s->id.MIDL);
  }
  Serial.printf("[cam] heap free %u, largest block %u\n",
                (unsigned)ESP.getFreeHeap(), (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
}

static void printWifi();

static void handleCommand(String cmd) {
  cmd.trim();
  String up = cmd;
  up.toUpperCase();
  if (up.isEmpty()) return;

  if (up == "PING") { Serial.println(F("PONG CAM")); return; }
  if (up == "INFO") { printInfo(); printWifi(); return; }
  if (up == "WIFI") { printWifi(); return; }
  if (up == "CAP") { sendFrame(); return; }
  if (up == "STATS") {
    uint32_t ms;
    camera_fb_t *fb = grab(ms);
    if (fb) { printStats(fb, ms); esp_camera_fb_return(fb); }
    return;
  }
  if (up == "START") { cameraStart(); return; }
  if (up == "DIAG") {
    cameraStop();
    ids = runSccbDiagnostics();
    cameraStart();
    return;
  }
  if (up.startsWith("BARS")) {
    barsOn = up.endsWith("1") || up.endsWith("ON");
    if (camReady) {
      sensor_t *s = esp_camera_sensor_get();
      if (s->set_colorbar) s->set_colorbar(s, barsOn ? 1 : 0);
      for (int i = 0; i < 2; i++) {               // flush frames taken before the change
        camera_fb_t *fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
      }
    }
    Serial.printf("[cam] colour bars %s\n", barsOn ? "ON" : "off");
    return;
  }
  if (up.startsWith("RES ")) {
    const String v = up.substring(4);
    if (v == "QQVGA") curSize = FRAMESIZE_QQVGA;
    else if (v == "QCIF") curSize = FRAMESIZE_QCIF;
    else if (v == "QVGA") curSize = FRAMESIZE_QVGA;
    else { Serial.println(F("[cam] RES QQVGA | QCIF | QVGA")); return; }
    cameraStart();
    return;
  }
  if (up.startsWith("FMT ")) {
    const String v = up.substring(4);
    if (v == "RGB565") curFmt = PIXFORMAT_RGB565;
    else if (v == "YUV422") curFmt = PIXFORMAT_YUV422;
    else if (v == "GRAY") curFmt = PIXFORMAT_GRAYSCALE;
    else { Serial.println(F("[cam] FMT RGB565 | YUV422 | GRAY")); return; }
    cameraStart();
    return;
  }
  Serial.printf("[cam] unknown command: %s\n", cmd.c_str());
}


// ---------------------------------------------------------------------------
// Wi-Fi live view
// ---------------------------------------------------------------------------

static void printWifi() {
  if (!wifiUp) { Serial.println(F("[cam] wifi: off")); return; }
  if (WiFi.getMode() == WIFI_AP)
    Serial.printf("[cam] wifi: own hotspot \"%s\" (password \"%s\") -> http://%s/\n",
                  CAM_AP_SSID, CAM_AP_PASSWORD, WiFi.softAPIP().toString().c_str());
  else
    Serial.printf("[cam] wifi: on \"%s\" %s, signal %d dBm -> http://%s/ or http://%s.local/\n",
                  WiFi.SSID().c_str(), WiFi.isConnected() ? "connected" : "RECONNECTING",
                  WiFi.RSSI(), WiFi.localIP().toString().c_str(), CAM_HOSTNAME);
}

static void webFrame() {
  if (!camReady) {
    web.send(503, "text/plain", camError.length() ? camError : String("camera not running"));
    return;
  }
  // No stale-frame discard here, unlike CAP: the page asks again as soon as a
  // frame arrives, so the one waiting is only a request old - and skipping
  // the discard doubles the frame rate.
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    web.send(504, "text/plain", "no frame from the camera - check VSYNC, HREF, PCLK and XCLK");
    return;
  }
  web.sendHeader("Cache-Control", "no-store");
  web.sendHeader("X-Width", String(fb->width));
  web.sendHeader("X-Height", String(fb->height));
  web.sendHeader("X-Format", fmtName(fb->format));
  web.setContentLength(fb->len);
  web.send(200, "application/octet-stream", "");
  web.sendContent((const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

static void webStatus() {
  String err = camError;
  err.replace("\\", "/");
  err.replace("\"", "'");
  char json[384];
  snprintf(json, sizeof json,
           "{\"running\":%s,\"res\":\"%s\",\"fmt\":\"%s\",\"bars\":%s,\"error\":\"%s\","
           "\"heap\":%u,\"largest\":%u,\"rssi\":%d}",
           camReady ? "true" : "false", sizeName(curSize), fmtName(curFmt), barsOn ? "true" : "false",
           err.c_str(), (unsigned)ESP.getFreeHeap(),
           (unsigned)heap_caps_get_largest_free_block(MALLOC_CAP_8BIT),
           WiFi.getMode() == WIFI_STA ? WiFi.RSSI() : 0);
  web.sendHeader("Cache-Control", "no-store");
  web.send(200, "application/json", json);
}

static void webCommand() {
  String c = web.arg("c");
  c.toUpperCase();
  // Only what the page offers. DIAG and START stay on the serial port.
  if (!(c.startsWith("BARS ") || c.startsWith("RES ") || c.startsWith("FMT "))) {
    web.send(400, "text/plain", "allowed: BARS 0|1, RES <size>, FMT <format>");
    return;
  }
  Serial.printf("[cam] browser: %s\n", c.c_str());
  handleCommand(c);
  webStatus();
}

static void wifiStart() {
  WiFi.persistent(false);              // never write credentials to flash
  WiFi.setHostname(CAM_HOSTNAME);
  bool joined = false;
#if defined(WIFI_SSID)
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[cam] wifi: joining \"%s\"", WIFI_SSID);
  const uint32_t t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < CAM_WIFI_JOIN_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();
  joined = WiFi.status() == WL_CONNECTED;
  if (!joined) {
    Serial.printf("[cam] wifi: could not join \"%s\" (2.4 GHz only; check secrets.h)\n", WIFI_SSID);
    WiFi.disconnect(true);
  }
#else
  Serial.println(F("[cam] wifi: no secrets.h, so no home network to join"));
#endif
  if (joined) {
    WiFi.setSleep(false);              // modem sleep adds 100+ ms to every request
  } else {
    WiFi.mode(WIFI_AP);
    if (!WiFi.softAP(CAM_AP_SSID, CAM_AP_PASSWORD)) {
      Serial.println(F("[cam] ERROR: could not start the Wi-Fi hotspot - live view is off"));
      return;
    }
  }
  if (MDNS.begin(CAM_HOSTNAME)) MDNS.addService("http", "tcp", 80);

  web.on("/", HTTP_GET, [] { web.send_P(200, "text/html", WEB_PAGE); });
  web.on("/frame", HTTP_GET, webFrame);
  web.on("/status", HTTP_GET, webStatus);
  web.on("/cmd", HTTP_POST, webCommand);
  web.onNotFound([] { web.send(404, "text/plain", "not found"); });
  web.begin();
  wifiUp = true;
  printWifi();
}


// ---------------------------------------------------------------------------

void setup() {
  Serial.setRxBufferSize(1024);
  Serial.begin(CAM_SERIAL_BAUD);
  delay(300);
  Serial.println();
  Serial.println(F("[cam] Campus Mithra camera node (OV7670, no FIFO)"));
#if defined(ESP_ARDUINO_VERSION_MAJOR)
  Serial.printf("[cam] Arduino-ESP32 core %d.%d.%d, heap %u, PSRAM %s\n",
                ESP_ARDUINO_VERSION_MAJOR, ESP_ARDUINO_VERSION_MINOR, ESP_ARDUINO_VERSION_PATCH,
                (unsigned)ESP.getFreeHeap(), psramFound() ? "yes" : "none");
#endif
  Serial.printf("[cam] pins: SDA=%d SCL=%d XCLK=%d VS=%d HS=%d PCLK=%d D0-7=%d,%d,%d,%d,%d,%d,%d,%d PWDN=%d RESET=%d\n",
                CAM_PIN_SIOD, CAM_PIN_SIOC, CAM_PIN_XCLK, CAM_PIN_VSYNC, CAM_PIN_HREF, CAM_PIN_PCLK,
                CAM_PIN_D0, CAM_PIN_D1, CAM_PIN_D2, CAM_PIN_D3, CAM_PIN_D4, CAM_PIN_D5, CAM_PIN_D6, CAM_PIN_D7,
                CAM_PIN_PWDN, CAM_PIN_RESET);

  ids = runSccbDiagnostics();
  if (ids.ok) {
    cameraStart();
  } else {
    camError = "the OV7670 did not answer on SCCB - see the serial log";
    Serial.println(F("[cam] Not starting the camera driver until the SCCB problem above is fixed."));
    Serial.println(F("[cam] Send DIAG to test again, or START to try the driver anyway."));
  }
  // After the camera, so its frame buffer gets the large free block first.
  wifiStart();
  Serial.println(F("[cam] ready - commands: PING INFO CAP STATS BARS RES FMT DIAG START WIFI"));
}

void loop() {
  if (wifiUp) web.handleClient();
  static String line;
  while (Serial.available()) {
    const char ch = (char)Serial.read();
    if (ch == '\n') {
      handleCommand(line);
      line = "";
    } else if (ch != '\r' && line.length() < 64) {
      line += ch;
    }
  }
  delay(2);
}
