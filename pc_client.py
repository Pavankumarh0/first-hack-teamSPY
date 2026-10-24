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


def pick_input_device(pa, devices, default_index):
    """Choose a microphone that is actually delivering audio.

    The Windows default cannot be trusted here: it is routinely a jack with
    nothing in it, which opens happily and records perfect silence.
    """
    skip = ("droidcam", "midi", "pc speaker", "sound mapper", "primary sound", "stereo mix")
    candidates = [d for d in devices if not any(s in d["name"].lower() for s in skip)] or devices

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
        scored.append((d, rms, note))
        print(f"    [{d['index']:>2}] {d['name'][:32]:<32} peak {peak:>6}  "
              f"rms {rms:>7.1f}  clip {clipped * 100:>4.0f}%  {note}")

    usable = [(d, r) for d, r, n in scored if n == "ok"]
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


def record(pa, device, max_seconds, hotkey):
    """Record until the hotkey fires again or max_seconds elapses."""
    stream, rate = open_input_stream(pa, device["index"], device["rate"])
    if hotkey:
        hotkey.clear()          # a press while opening belongs to the start
    frames = []
    per_second = max(1, rate // CHUNK)
    print(f"\n>>> RECORDING at {rate} Hz - speak now "
          f"(press again to stop, auto-stops at {max_seconds}s)")
    try:
        for n in range(math.ceil(rate * max_seconds / CHUNK)):
            if hotkey and hotkey.pressed.is_set():
                break
            frames.append(stream.read(CHUNK, exception_on_overflow=False))
            if n % per_second == 0:
                print(f"    ... {n * CHUNK / rate:4.0f}s", end="\r", flush=True)
    except OSError as exc:
        raise RuntimeError(f"Microphone read failed mid-recording: {exc}") from exc
    finally:
        stream.stop_stream()
        stream.close()
    audio = np.frombuffer(b"".join(frames), dtype=np.int16)
    print(f">>> STOPPED - captured {audio.size / rate:.1f}s                ")
    return audio, rate


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
    ap.add_argument("--devices", action="store_true", help="list input devices and exit")
    ap.add_argument("--seconds", type=int, default=12, help="maximum recording length")
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

        if args.device is not None:
            device = next((d for d in devices if d["index"] == args.device), None)
            if device is None:
                print(f"No input device with index {args.device}. Try --devices.")
                return 1
            print(f"Using [{device['index']}] {device['name']}")
        else:
            device = pick_input_device(pa, devices, default_index)

        esp = connect_esp32(args.esp32, args.volume)

        try:
            hotkey = HotkeyListener(args.hotkey).start()
        except HotkeyError as exc:
            print(f"\n{exc}\n  Falling back to pressing Enter in this window.")
            hotkey = None

        print(f"\nReady. {'Press ' + hotkey.name if hotkey else 'Press Enter'} to start talking, "
              f"again to send.  Ctrl+C to quit.")
        try:
            while True:
                if hotkey:
                    hotkey.clear()
                    while not hotkey.pressed.is_set():
                        time.sleep(0.05)
                    hotkey.clear()
                else:
                    input()

                if esp:
                    esp.status("listening")
                audio, rate = record(pa, device, args.seconds, hotkey)
                if audio.size < rate // 2:
                    print("  Too short - hold a little longer.")
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
