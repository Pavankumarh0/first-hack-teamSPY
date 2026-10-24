"""Campus Mithra - PC push-to-talk client.

Drives the whole pipeline from a laptop microphone, so the assistant can be
demonstrated and the knowledge base exercised before the ESP32 kiosk exists.
It speaks to the same endpoints the kiosk uses:

    POST /api/ask-audio        the recording  -> {question, answer, audio_id}
    GET  /api/audio/{id}.mp3   the spoken answer

    python pc_client.py                      hold Ctrl+Alt+4 to talk
    python pc_client.py --devices            list input devices and exit
    python pc_client.py --device 3           force an input device
    python pc_client.py --hotkey ctrl+alt+k  use a different hotkey
    python pc_client.py --ask "hostel fees"  one text question, no microphone

The device auto-pick and the Win32 hotkey are ported from the tested
implementations in "campus test/" (test_sarvam_stt.py, hotkey.py).
"""

from __future__ import annotations

import argparse
import ctypes
import io
import json
import math
import sys
import threading
import time
import wave
from ctypes import wintypes
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DEFAULT_SERVER = "http://127.0.0.1:8000"
TARGET_RATE = 16000          # what the server and Sarvam prefer
CHANNELS = 1
CHUNK = 1024

# Judged on RMS and clipping, never on peak alone: one stray spike pushes the
# peak to full scale without meaning anything, while a genuinely railed input
# both carries a large RMS and spends much of its time pinned at the limit.
RAILED_RMS = 8000
CLIPPED_FRACTION = 0.01
ALIVE_RMS = 2.0


# --------------------------------------------------------------------------- #
# Global hotkey (Windows, via RegisterHotKey)
# --------------------------------------------------------------------------- #

MOD_ALT, MOD_CONTROL, MOD_SHIFT, MOD_WIN = 0x0001, 0x0002, 0x0004, 0x0008
MOD_NOREPEAT = 0x4000
WM_HOTKEY, PM_REMOVE = 0x0312, 0x0001

MODIFIERS = {"ctrl": MOD_CONTROL, "control": MOD_CONTROL, "alt": MOD_ALT,
             "shift": MOD_SHIFT, "win": MOD_WIN, "super": MOD_WIN}


class HotkeyError(RuntimeError):
    pass


def parse_hotkey(combo: str):
    mods, vk, label = 0, None, []
    for part in combo.lower().replace(" ", "").split("+"):
        if part in MODIFIERS:
            mods |= MODIFIERS[part]
            label.append(part)
        elif len(part) == 1 and (part.isalnum()):
            vk = ord(part.upper())
            label.append(part.upper())
        elif part.startswith("f") and part[1:].isdigit():
            vk = 0x70 + int(part[1:]) - 1
            label.append(part.upper())
        elif part == "space":
            vk, _ = 0x20, label.append("Space")
        else:
            raise HotkeyError(f"Cannot parse hotkey part {part!r} in {combo!r}")
    if vk is None:
        raise HotkeyError(f"No key found in {combo!r} (e.g. ctrl+alt+4)")
    return mods, vk, "+".join(label)


class HotkeyListener:
    """A system-wide hotkey that sets an Event each time it is pressed.

    RegisterHotKey binds the hotkey to the *calling thread* and posts WM_HOTKEY
    to that thread's message queue, so registration and the message pump must
    both live on the one thread -- hence everything inside _run().
    """

    def __init__(self, combo="ctrl+alt+4"):
        if sys.platform != "win32":
            raise HotkeyError("global hotkeys are implemented for Windows only")
        self.mods, self.vk, self.name = parse_hotkey(combo)
        self.pressed = threading.Event()
        self._stop = threading.Event()
        self._ready = threading.Event()
        self._error = None
        self._thread = None

    def _run(self):
        user32 = ctypes.WinDLL("user32", use_last_error=True)
        if not user32.RegisterHotKey(None, 1, self.mods | MOD_NOREPEAT, self.vk):
            err = ctypes.get_last_error()
            extra = " - another application already owns it" if err == 1409 else ""
            self._error = f"Windows refused to register {self.name} (error {err}{extra})."
            self._ready.set()
            return
        self._ready.set()
        msg = wintypes.MSG()
        try:
            while not self._stop.is_set():
                if user32.PeekMessageW(ctypes.byref(msg), None, 0, 0, PM_REMOVE):
                    if msg.message == WM_HOTKEY:
                        self.pressed.set()
                else:
                    time.sleep(0.02)
        finally:
            user32.UnregisterHotKey(None, 1)

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        self._ready.wait(3.0)
        if self._error:
            raise HotkeyError(self._error)
        return self

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)

    def clear(self):
        self.pressed.clear()

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()


# --------------------------------------------------------------------------- #
# Microphone
# --------------------------------------------------------------------------- #

def list_input_devices(pa):
    devices = []
    for i in range(pa.get_device_count()):
        try:
            info = pa.get_device_info_by_index(i)
        except OSError:
            continue
        if int(info.get("maxInputChannels", 0)) < 1:
            continue
        try:
            host = pa.get_host_api_info_by_index(info["hostApi"])["name"]
        except OSError:
            host = "?"
        devices.append({"index": i, "name": str(info["name"]), "host_api": str(host),
                        "channels": int(info["maxInputChannels"]),
                        "rate": int(info["defaultSampleRate"])})
    return devices


def default_input_index(pa):
    try:
        return int(pa.get_default_input_device_info()["index"])
    except (OSError, KeyError):
        return None


def open_input_stream(pa, device_index, device_rate):
    import pyaudio
    last = None
    for rate in dict.fromkeys((TARGET_RATE, device_rate)):
        try:
            return pa.open(format=pyaudio.paInt16, channels=CHANNELS, rate=rate,
                           input=True, input_device_index=device_index,
                           frames_per_buffer=CHUNK), rate
        except OSError as exc:
            last = exc
    raise RuntimeError(
        f"Could not open device {device_index} at {TARGET_RATE} Hz or {device_rate} Hz.\n"
        f"  PortAudio said: {last}\n"
        "  Check the mic is plugged in, not in use elsewhere, and that\n"
        "  Settings > Privacy & security > Microphone allows desktop apps.")


def probe_level(pa, device, seconds=0.6, settle=0.25):
    """Record briefly and return (peak, rms, clipped_fraction), or None.

    The first buffers after opening a stream routinely carry a DC step or a
    one-sample spike, enough to make a good microphone look pinned at full
    scale, so `settle` worth of audio is discarded first.
    """
    try:
        stream, rate = open_input_stream(pa, device["index"], device["rate"])
    except (RuntimeError, OSError):
        return None
    try:
        frames = [stream.read(CHUNK, exception_on_overflow=False)
                  for _ in range(max(1, int(rate * (seconds + settle) / CHUNK)))]
        audio = np.frombuffer(b"".join(frames), dtype=np.int16)
        drop = int(rate * settle)
        if audio.size > drop + CHUNK:
            audio = audio[drop:]
        if audio.size == 0:
            return 0, 0.0, 0.0
        mag = np.abs(audio.astype(np.int32))
        return (int(mag.max()),
                float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))),
                float(np.count_nonzero(mag >= 32000) / mag.size))
    except OSError:
        return None
    finally:
        stream.stop_stream()
        stream.close()


# Names that mean "a mic you wear" versus "a mic built into the laptop". On a
# typical Realtek laptop, "Microphone (Realtek...)" is the 3.5 mm jack the wired
# earphones plug into and "Microphone Array (Realtek...)" is the built-in pair.
EARPHONE_HINTS = ("headset", "headphone", "earphone", "earbud", "hands-free", "handsfree",
                  "airpods", "buds", "bluetooth", "bt ", "usb audio", "jack")
BUILTIN_HINTS = ("array", "internal", "built-in", "builtin", "webcam", "camera")


def mic_kind(name):
    n = name.lower()
    if any(h in n for h in EARPHONE_HINTS):
        return "earphone"
    if any(h in n for h in BUILTIN_HINTS):
        return "built-in"
    return "jack"      # unlabelled Realtek "Microphone" = the headset jack


def pick_input_device(pa, devices, default_index):
    """Choose the earphone microphone, and make sure it is actually delivering audio.

    Preference: anything named like a headset/earphone, then the plain
    "Microphone" jack, and only then the laptop's built-in mic array. Each
    candidate is probed, because the Windows default cannot be trusted: a jack
    with nothing plugged in opens happily and records perfect silence.
    """
    skip = ("droidcam", "midi", "pc speaker", "sound mapper", "primary sound", "stereo mix")
    candidates = [d for d in devices if not any(s in d["name"].lower() for s in skip)] or devices
    # Windows lists every mic once per audio API (MME, DirectSound, WASAPI,
    # WDM-KS). MME is the most forgiving about sample rates, so probe only those
    # when there are any - it is the same microphone, and startup is 4x faster.
    mme = [d for d in candidates if d["host_api"] == "MME"]
    if mme:
        candidates = mme

    print("\nFinding a working microphone ...")
    scored = []
    for d in candidates:
        level = probe_level(pa, d)
        if level is None:
            continue
        peak, rms, clipped = level
        note = ("silent" if rms < ALIVE_RMS
                else "saturated" if rms > RAILED_RMS or clipped > CLIPPED_FRACTION
                else "ok")
        d["noise_rms"] = rms
        scored.append((d, rms, note))
        print(f"    [{d['index']:>2}] {d['name'][:32]:<32} {mic_kind(d['name']):<9} "
              f"rms {rms:>7.1f}  clip {clipped * 100:>4.0f}%  {note}")

    usable = [(d, r) for d, r, n in scored if n == "ok"]
    rank = {"earphone": 0, "jack": 1, "built-in": 2}
    if usable:
        best_kind = min(rank[mic_kind(d["name"])] for d, _ in usable)
        worn = [(d, r) for d, r in usable if rank[mic_kind(d["name"])] == best_kind]
        if best_kind < 2:
            chosen = max(worn, key=lambda dr: dr[1])[0]
            print(f"  Using the earphone mic: [{chosen['index']}] {chosen['name']}")
            return chosen
        print("  No earphone mic is producing sound - is the earphone plugged in, and is it")
        print("  enabled under Settings > System > Sound > Input?  Using the built-in mic for now.")
    if not usable:
        fallback = next(((d, r) for d, r, n in scored if n == "saturated"), None)
        if fallback is None:
            idx = default_index if default_index is not None else devices[0]["index"]
            chosen = next(d for d in devices if d["index"] == idx)
            print(f"  No device produced any audio. Falling back to [{chosen['index']}] {chosen['name']}.")
            print("  Check Windows mic privacy settings and the input volume.")
            return chosen
        chosen, rms = fallback
        print(f"  Only saturated inputs found; using [{chosen['index']}] {chosen['name']} (rms {rms:.0f}).")
        print("  Expect empty transcripts - turn that input's level down or pass --device.")
        return chosen

    # Honour the Windows default when it actually works, so a deliberately
    # configured mic beats whichever other device happens to be noisier now.
    for d, rms in usable:
        if d["index"] == default_index:
            print(f"  Using the Windows default: [{d['index']}] {d['name']}")
            return d
    chosen, rms = max(usable, key=lambda dr: dr[1])
    print(f"  Using [{chosen['index']}] {chosen['name']} (rms {rms:.0f})")
    return chosen


class SpeechEndpointer:
    """Decides when the visitor has finished speaking, from audio level alone.

    Speech starts when the level stays clearly above the mic's idle noise floor
    for ~0.2 s, and ends after `silence_s` of quiet - long enough to ride over
    the natural pauses inside a sentence, short enough not to feel laggy. If
    nobody speaks within `no_speech_s`, it gives up rather than recording a
    silent room until the time limit.

    The noise floor comes from the startup mic probe, so there is no
    calibration delay after the wake chime, when visitors start talking at once.
    """

    def __init__(self, rate, frame, noise_rms, silence_s=1.2, no_speech_s=6.0,
                 ratio=3.0, min_rms=150.0, max_rms=3000.0, threshold=None):
        fs = frame / rate
        self.silence_frames = max(1, round(silence_s / fs))
        self.no_speech_frames = max(1, round(no_speech_s / fs))
        self.start_frames = max(1, round(0.2 / fs))
        floor = max(noise_rms or 0.0, 1.0)
        self.threshold = threshold or min(max_rms, max(min_rms, floor * ratio))
        self.floor = floor
        self.n = self.loud_run = self.quiet_run = 0
        self.started = False

    def push(self, rms):
        """Feed one frame's RMS. Returns 'waiting', 'speech', 'done' or 'no_speech'."""
        self.n += 1
        if not self.started:
            self.loud_run = self.loud_run + 1 if rms >= self.threshold else 0
            if self.loud_run >= self.start_frames:
                self.started = True
                return "speech"
            return "no_speech" if self.n >= self.no_speech_frames else "waiting"
        # Hysteresis: only clearly-quiet frames count towards the end, so a soft
        # word near the threshold doesn't cut the sentence off.
        self.quiet_run = self.quiet_run + 1 if rms < self.threshold * 0.7 else 0
        return "done" if self.quiet_run >= self.silence_frames else "speech"

    def level(self, rms):
        """0-100 for a level meter: the noise floor at 0, ~40 dB above it at 100."""
        return int(max(0, min(100, 50 * math.log10(max(rms, 1.0) / self.floor))))


def record(pa, device, max_seconds, hotkey, esp=None, auto_stop=True, threshold=None):
    """Record from the wake press until the visitor stops talking.

    Ends on whichever comes first: silence after speech (auto_stop), the hotkey
    pressed again, or max_seconds. Returns (samples, rate, reason) where reason
    is 'silence', 'key', 'max' or 'no_speech'.
    """
    stream, rate = open_input_stream(pa, device["index"], device["rate"])
    if hotkey:
        hotkey.clear()          # a press while opening belongs to the start
    ep = SpeechEndpointer(rate, CHUNK, device.get("noise_rms"), threshold=threshold)
    frames, reason, heard, last_meter = [], "max", False, 0.0
    how = "stops when you finish talking" if auto_stop else "press again to stop"
    print(f"\n>>> LISTENING - speak now ({how}; max {max_seconds}s)")
    try:
        for _ in range(math.ceil(rate * max_seconds / CHUNK)):
            if hotkey and hotkey.pressed.is_set():
                reason = "key"
                break
            data = stream.read(CHUNK, exception_on_overflow=False)
            frames.append(data)
            x = np.frombuffer(data, dtype=np.int16).astype(np.float32)
            rms = float(np.sqrt(np.mean(x * x))) if x.size else 0.0
            state = ep.push(rms)

            now = time.time()
            if now - last_meter > 0.15:
                pct = ep.level(rms)
                bar = "#" * (pct // 5)
                print(f"    mic [{bar:<20}] {'hearing you' if ep.started else 'waiting...'}  ",
                      end="\r", flush=True)
                if esp:
                    esp.level(pct)
                last_meter = now

            if state == "speech" and not heard:
                heard = True
                if esp:
                    esp.status("hearing you")
            if auto_stop and state == "done":
                reason = "silence"
                break
            if auto_stop and state == "no_speech":
                reason = "no_speech"
                break
    except OSError as exc:
        raise RuntimeError(f"Microphone read failed mid-recording: {exc}") from exc
    finally:
        stream.stop_stream()
        stream.close()
        if esp:
            esp.level(0)
    audio = np.frombuffer(b"".join(frames), dtype=np.int16)
    print(f">>> STOPPED ({reason}) - captured {audio.size / rate:.1f}s" + " " * 30)
    return audio, rate, reason


def resample(audio, rate):
    if rate == TARGET_RATE or audio.size == 0:
        return audio, rate
    try:
        from scipy.signal import resample_poly
    except ImportError:
        print(f"  note: sending at native {rate} Hz (scipy not installed)")
        return audio, rate
    g = math.gcd(TARGET_RATE, rate)
    out = resample_poly(audio.astype(np.float32), TARGET_RATE // g, rate // g)
    return np.clip(out, -32768, 32767).astype(np.int16), TARGET_RATE


def wav_bytes(audio, rate):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(CHANNELS)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(audio.tobytes())
    return buf.getvalue()


# --------------------------------------------------------------------------- #
# ESP32 display + speaker (USB serial)
# --------------------------------------------------------------------------- #

BAUD = 460800    # must match SERIAL_BAUD in firmware/include/config.h

# USB-serial bridges used on ESP32 DevKit boards, by (vid, pid).
KNOWN_BRIDGES = {
    (0x10C4, 0xEA60): "Silicon Labs CP2102",
    (0x1A86, 0x7523): "WCH CH340",
    (0x1A86, 0x55D4): "WCH CH9102",
    (0x0403, 0x6001): "FTDI FT232",
    (0x303A, 0x1001): "Espressif native USB",
}


def autodetect_esp32_port():
    from serial.tools import list_ports
    found = [p.device for p in list_ports.comports() if (p.vid, p.pid) in KNOWN_BRIDGES]
    return found[0] if len(found) == 1 else None


class Esp32Link:
    """Line protocol to firmware/src/main.cpp, plus credit-paced audio.

    Ported from campus test/esp32_display.py. Opening a COM port normally
    pulses DTR/RTS, which resets an ESP32; both are held low before opening so a
    running board keeps running.
    """

    def __init__(self, port, baud=BAUD, verbose=False):
        import serial
        self.port, self.verbose = port, verbose
        self.ser = serial.Serial()
        self.ser.port, self.ser.baudrate, self.ser.timeout = port, baud, 0.2
        self.ser.dtr = False
        self.ser.rts = False
        try:
            self.ser.open()
        except serial.SerialException as exc:
            hint = ""
            if "Access is denied" in str(exc) or "PermissionError" in str(exc):
                hint = ("\n  Another program has the port. Close `pio device monitor`, "
                        "the VS Code serial monitor, or any other script using it.")
            raise RuntimeError(f"Could not open {port}: {exc}{hint}") from exc

    def _send(self, line):
        payload = line.replace("\r", " ").replace("\n", " ")
        self.ser.write((payload + "\n").encode("utf-8", errors="replace"))
        self.ser.flush()

    def _readline(self):
        raw = self.ser.readline()
        return raw.decode("ascii", errors="replace").strip() if raw else ""

    def ping(self):
        for attempt in range(2):
            self.ser.reset_input_buffer()
            self._send("PING")
            deadline = time.time() + 2.5
            while time.time() < deadline:
                if self._readline() == "PONG":
                    return True
            time.sleep(2.0)         # maybe it was booting
        return False

    def question(self, text): self._send(f"Q:{text}")
    def answer(self, text): self._send(f"A:{text}")
    def source(self, files): self._send(f"R:{files}")
    def listening(self, prompt=""): self._send(f"L:{prompt}")

    def level(self, pct):
        # No flush: these go out ~7 times a second and must never stall the mic loop.
        self.ser.write(f"M:{max(0, min(100, int(pct)))}\n".encode())
    def status(self, text): self._send(f"S:{text[:30]}")
    def clear(self): self._send("CLR")
    def beep(self): self._send("BEEP")
    def volume(self, pct): self._send(f"VOL:{max(0, min(100, int(pct)))}")

    def play(self, pcm_u8: bytes):
        """Stream unsigned 8-bit 8 kHz audio to the speaker. Blocks until it has
        finished playing. Returns (ok, message).

        The ESP32 grants credit ("C:<n>") as room frees up in its buffer, and
        audio is only ever sent against credit, so nothing can overflow.
        """
        if not pcm_u8:
            return True, "no audio"
        # Drop replies to earlier commands, so a stale line can't be mistaken
        # for this transfer's DONE or ERR.
        time.sleep(0.05)
        self.ser.reset_input_buffer()
        self._send(f"AUD:{len(pcm_u8)}")
        sent, credit = 0, 0
        deadline = time.time() + len(pcm_u8) / 8000 + 20
        while time.time() < deadline:
            if credit > 0 and sent < len(pcm_u8):
                n = min(credit, len(pcm_u8) - sent, 4096)
                self.ser.write(pcm_u8[sent:sent + n])
                sent += n
                credit -= n
                continue
            line = self._readline()
            if not line:
                continue
            if line.startswith("C:"):
                credit += int(line[2:] or 0)
            elif line.startswith("DONE:"):
                played, gaps = (line[5:].split(",") + ["0"])[:2]
                note = f"{int(played) / 8000:.1f}s"
                if int(gaps):
                    note += f", {gaps} gap(s)"
                return True, note
            elif line.startswith("ERR:"):
                return False, line[4:]
            elif self.verbose:
                print(f"    {line}")
        return False, f"timed out ({sent}/{len(pcm_u8)} bytes sent)"

    def close(self):
        try:
            self.ser.close()
        except Exception:
            pass


def connect_esp32(port, volume=None):
    """Open the ESP32 link, or return None (the client keeps working without it)."""
    if port and port.lower() == "none":
        return None
    try:
        import serial  # noqa: F401
    except ImportError:
        print("  ESP32: pyserial is not installed (pip install pyserial) - continuing without it.")
        return None
    if not port:
        port = autodetect_esp32_port()
        if not port:
            print("  ESP32: none detected - continuing with PC audio. Use --esp32 COM9 to force.")
            return None
    try:
        link = Esp32Link(port)
    except RuntimeError as exc:
        print(f"  ESP32: {exc}\n  Continuing with PC audio.")
        return None
    if not link.ping():
        print(f"  ESP32: {port} opened but the board did not answer PING.\n"
              "    Is firmware/ flashed?  (cd firmware && pio run -t upload)")
        link.close()
        return None
    if volume is not None:
        link.volume(volume)
    link.clear()
    print(f"  ESP32: connected on {port}")
    return link


# --------------------------------------------------------------------------- #
# Server
# --------------------------------------------------------------------------- #

def deliver(result, server, esp=None, play=True, pc_audio=False):
    """Print the answer, put it on the TFT, and speak it.

    With an ESP32 connected the answer is spoken on the kiosk speaker; the PC
    speakers are used only when there is no ESP32, or with --pc-audio.
    """
    answer = result.get("answer", "")
    sources = result.get("sources") or []
    print(f"  mithra > {answer}")
    if sources:
        how = " (read directly from the knowledge base - Gemma was unavailable)" \
            if result.get("via") == "kb-direct" else ""
        print(f"           referred: {', '.join(sources)}{how}")
    elif not result.get("in_scope"):
        print("           referred: (nothing in the knowledge base)")
    if esp:
        esp.source(", ".join(sources))     # before the answer, so it draws once
        esp.answer(answer)
    if not (play and result.get("audio_id")):
        if esp:
            esp.status("ready")
        return
    if esp:
        pcm = fetch_audio(server, result["audio_id"], "u8")
        if pcm:
            ok, note = esp.play(pcm)
            print(f"           (spoken on the kiosk speaker: {note})" if ok
                  else f"           (kiosk speaker failed: {note})")
    if pc_audio or not esp:
        play_answer(server, result["audio_id"])


def fetch_audio(server, audio_id, ext):
    import httpx
    try:
        r = httpx.get(f"{server}/api/audio/{audio_id}.{ext}", timeout=120)
    except httpx.RequestError as exc:
        print(f"           (no audio: {exc})")
        return None
    if r.status_code != 200:
        # 503 here means text-to-speech failed; the server needs internet for edge-tts.
        print(f"           (no audio: HTTP {r.status_code} - is the server online for edge-tts?)")
        return None
    return r.content


def play_answer(server, audio_id):
    data = fetch_audio(server, audio_id, "mp3")
    if not data:
        return
    path = ROOT / "server" / "debug" / "last_answer.mp3"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    if sys.platform != "win32":
        print(f"           (saved to {path})")
        return
    # winsound only plays WAV, so play the mp3 through WPF's MediaPlayer, and
    # wait exactly as long as the clip lasts rather than a fixed delay.
    import subprocess
    script = (
        "Add-Type -AssemblyName presentationCore; "
        "$p = New-Object System.Windows.Media.MediaPlayer; "
        f"$p.Open([uri]'{path}'); "
        "$n = 0; while (-not $p.NaturalDuration.HasTimeSpan -and $n -lt 100) "
        "{ Start-Sleep -Milliseconds 50; $n++ }; "
        "$p.Play(); "
        "if ($p.NaturalDuration.HasTimeSpan) "
        "{ Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds + 300) } "
        "else { Start-Sleep -Seconds 10 }; "
        "$p.Close()"
    )
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", script],
                       timeout=90, capture_output=True)
    except Exception:
        print(f"           (could not play; saved to {path})")


def ask_text(server, question, session):
    import httpx
    r = httpx.post(f"{server}/api/ask", json={"question": question, "session": session}, timeout=180)
    r.raise_for_status()
    return r.json()


def transcribe(server, audio, rate):
    """Speech to text on the server. Returns the /api/transcribe JSON."""
    import httpx
    files = {"file": ("q.wav", wav_bytes(audio, rate), "audio/wav")}
    r = httpx.post(f"{server}/api/transcribe", files=files, timeout=120)
    r.raise_for_status()
    return r.json()


def handle_question(server, question, session, esp, play, pc_audio):
    """Question text in -> answer on screen and speaker out."""
    print(f"\n  you    > {question}")
    if esp:
        esp.question(question)          # shown now, while Gemma works
    t0 = time.time()
    result = ask_text(server, question, session)
    print(f"           ({time.time() - t0:.1f}s)")
    deliver(result, server, esp, play, pc_audio)


def check_server(server):
    import httpx
    try:
        r = httpx.get(f"{server}/api/health", timeout=15)
        r.raise_for_status()
        h = r.json()
    except Exception as exc:
        print(f"Cannot reach the Campus Mithra server at {server}\n  {exc}\n"
              "  Start it with:  cd server && python app.py")
        return None
    print(f"Server: {server}  |  {h.get('college')}  |  {h.get('chunks')} chunks  |  "
          f"backend {h.get('backend')}  |  embeddings {h.get('embeddings')}")
    return h


# --------------------------------------------------------------------------- #

def main(argv=None):
    ap = argparse.ArgumentParser(description="Campus Mithra push-to-talk client")
    ap.add_argument("--server", default=DEFAULT_SERVER)
    ap.add_argument("--hotkey", default="ctrl+alt+4")
    ap.add_argument("--device", type=int, help="input device index (see --devices)")
    ap.add_argument("--mic", help="pick the mic whose name contains this text, e.g. --mic Headset")
    ap.add_argument("--manual-stop", action="store_true",
                    help="don't stop on silence; press the hotkey again to stop")
    ap.add_argument("--vad-threshold", type=float,
                    help="mic level (RMS) that counts as speech, if auto-detection misjudges your mic")
    ap.add_argument("--no-chime", action="store_true", help="no wake chime on the kiosk speaker")
    ap.add_argument("--devices", action="store_true", help="list input devices and exit")
    ap.add_argument("--seconds", type=int, default=15, help="maximum recording length")
    ap.add_argument("--ask", help="ask one text question and exit (no microphone)")
    ap.add_argument("--no-audio", action="store_true", help="do not speak the answer")
    ap.add_argument("--esp32", default="",
                    help="ESP32 COM port, e.g. COM9 (auto-detected if omitted; 'none' to disable)")
    ap.add_argument("--volume", type=int, help="kiosk speaker volume 0-100")
    ap.add_argument("--pc-audio", action="store_true",
                    help="also play the answer on the PC speakers when an ESP32 is connected")
    ap.add_argument("--session", default="pc")
    args = ap.parse_args(argv)

    if args.ask:
        if check_server(args.server) is None:
            return 1
        esp = connect_esp32(args.esp32, args.volume)
        try:
            handle_question(args.server, args.ask, args.session, esp,
                            not args.no_audio, args.pc_audio)
        finally:
            if esp:
                esp.close()
        return 0

    try:
        import pyaudio
    except ImportError:
        print("PyAudio is not installed.\n  pip install PyAudio")
        return 1

    pa = pyaudio.PyAudio()
    try:
        devices = list_input_devices(pa)
        if not devices:
            print("No input devices found.")
            return 1
        default_index = default_input_index(pa)

        if args.devices:
            print("\nInput devices ('*' = Windows default)")
            for d in devices:
                star = "*" if d["index"] == default_index else " "
                print(f" {star} [{d['index']:>2}] {d['name'][:40]:<40} "
                      f"{d['host_api'][:12]:<12} {d['channels']}ch {d['rate']}Hz")
            return 0

        if check_server(args.server) is None:
            return 1

        if args.device is not None or args.mic:
            if args.device is not None:
                device = next((d for d in devices if d["index"] == args.device), None)
            else:
                named = [d for d in devices if args.mic.lower() in d["name"].lower()]
                device = next((d for d in named if d["host_api"] == "MME"), named[0] if named else None)
            if device is None:
                print(f"No matching input device ({args.device or args.mic}). Try --devices.")
                return 1
            level = probe_level(pa, device)          # noise floor for end-of-speech detection
            device["noise_rms"] = level[1] if level else None
            print(f"Using [{device['index']}] {device['name']}  (idle rms {device['noise_rms'] or 0:.0f})")
        else:
            device = pick_input_device(pa, devices, default_index)

        esp = connect_esp32(args.esp32, args.volume)

        try:
            hotkey = HotkeyListener(args.hotkey).start()
        except HotkeyError as exc:
            print(f"\n{exc}\n  Falling back to pressing Enter in this window.")
            hotkey = None

        key = hotkey.name if hotkey else "Enter"
        stop = (f"press {key} again" if args.manual_stop
                else f"it stops by itself when you finish (or press {key} again)")
        print(f"\nReady. Press {key} to wake Mithra and speak - {stop}.  Ctrl+C to quit.")
        if esp:
            esp.status(f"press {key.lower()}")
        try:
            while True:
                if hotkey:
                    hotkey.clear()
                    while not hotkey.pressed.is_set():
                        time.sleep(0.05)
                    hotkey.clear()
                else:
                    input()

                # Wake: chime, then the listening screen. The chime is finished
                # before recording starts, so it is never captured by the mic.
                if esp:
                    if not args.no_chime:
                        esp.beep()
                        time.sleep(0.35)
                    esp.listening()
                audio, rate, reason = record(pa, device, args.seconds, hotkey, esp,
                                             auto_stop=not args.manual_stop,
                                             threshold=args.vad_threshold)
                if reason == "no_speech":
                    print("  I didn't hear anything. Speak a little louder or closer to the mic.\n"
                          "  (If your voice never lights up the meter, try --vad-threshold 80.)")
                    if esp:
                        esp.status("didn't hear you")
                        esp.answer("I didn't hear anything. Press the talk key and try again.")
                    continue
                if audio.size < rate // 2:
                    print("  Too short - speak a little longer.")
                    if esp:
                        esp.status("too short")
                    continue
                audio, rate = resample(audio, rate)
                if esp:
                    esp.status("recognising")
                try:
                    heard = transcribe(args.server, audio, rate)
                    if not heard.get("ok"):
                        # Speech service failed - not the same as silence.
                        print(f"  Speech-to-text failed: {heard.get('error')}")
                        if esp:
                            esp.status("speech error")
                            esp.answer(heard.get("reply", ""))
                        continue
                    if not heard.get("text"):
                        print("  Heard nothing - speak closer to the mic.")
                        if esp:
                            esp.status("didn't catch that")
                        continue
                    handle_question(args.server, heard["text"], args.session, esp,
                                    not args.no_audio, args.pc_audio)
                except Exception as exc:
                    print(f"  Request failed: {exc}")
                    if esp:
                        esp.status("server error")
        except KeyboardInterrupt:
            print("\nBye.")
        finally:
            if hotkey:
                hotkey.stop()
            if esp:
                esp.clear()
                esp.close()
    finally:
        pa.terminate()
    return 0


if __name__ == "__main__":
    sys.exit(main())
