"""Grab frames from the Campus Mithra camera node and save them as PNG.

    python camera/tools/cam_grab.py --port COM12                  one frame
    python camera/tools/cam_grab.py --port COM12 --bars           colour-bar test pattern
    python camera/tools/cam_grab.py --port COM12 --count 50       link reliability test
    python camera/tools/cam_grab.py --port COM12 --res QVGA --fmt GRAY
    python camera/tools/cam_grab.py --port COM12 --send INFO      any command, print the reply

Talks to camera/campus_mithra_cam over USB serial (the CAMERA board, never the
kiosk). Before anything else it sends PING and insists on "PONG CAM": the kiosk
answers plain "PONG", so pointing this at the kiosk's port stops right there.
Opening the port does not reset the board (DTR/RTS are held low, as in
pc_client.py). Close `pio device monitor` first - one program per COM port.

Frames are checked against the FNV-1a hash the camera sends with them, so a
saved PNG is exactly what came off the camera bus.
"""
import argparse
import struct
import sys
import time
import zlib
from pathlib import Path

import numpy as np

BAUD = 921600    # must match CAM_SERIAL_BAUD in camera/campus_mithra_cam/cam_config.h
OUT_DIR = Path(__file__).resolve().parent.parent / "captures"


def fnv1a(data: bytes) -> int:
    h = 2166136261
    for b in data:
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h


def write_png(path: Path, img: np.ndarray):
    """8-bit greyscale (h, w) or RGB (h, w, 3) PNG, with no imaging library."""
    h, w = img.shape[:2]
    colour = 2 if img.ndim == 3 else 0
    rows = img.reshape(h, -1).astype(np.uint8)
    raw = b"".join(b"\x00" + row.tobytes() for row in rows)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, colour, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 6))
                     + chunk(b"IEND", b""))


def to_image(data: bytes, w: int, h: int, fmt: str, swap: bool, uyvy: bool) -> np.ndarray:
    buf = np.frombuffer(data, dtype=np.uint8)
    if fmt == "GRAY":
        return buf.reshape(h, w)
    if fmt == "RGB565":
        # esp32-camera stores RGB565 high byte first; --swap-bytes if colours look wrong.
        px = buf.reshape(-1, 2).astype(np.uint16)
        v = (px[:, 1] << 8 | px[:, 0]) if swap else (px[:, 0] << 8 | px[:, 1])
        r = (v >> 11) & 0x1F
        g = (v >> 5) & 0x3F
        b = v & 0x1F
        rgb = np.stack([(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2)], axis=-1)
        return rgb.reshape(h, w, 3).astype(np.uint8)
    if fmt == "YUV422":
        q = buf.reshape(-1, 4).astype(np.float32)
        if uyvy:
            u, y0, v, y1 = q.T
        else:
            y0, u, y1, v = q.T
        y = np.stack([y0, y1], axis=-1).reshape(-1)
        u = np.repeat(u, 2) - 128
        v = np.repeat(v, 2) - 128
        rgb = np.stack([y + 1.402 * v, y - 0.344 * u - 0.714 * v, y + 1.772 * u], axis=-1)
        return np.clip(rgb, 0, 255).reshape(h, w, 3).astype(np.uint8)
    raise ValueError(f"unknown format {fmt}")


class CamLink:
    """Text lines and IMG frames over one byte stream, read through one buffer."""

    def __init__(self, port, baud=BAUD):
        import serial
        self.ser = serial.Serial()
        self.ser.port, self.ser.baudrate, self.ser.timeout = port, baud, 0.05
        self.ser.dtr = False
        self.ser.rts = False
        try:
            self.ser.open()
        except serial.SerialException as exc:
            sys.exit(f"Could not open {port}: {exc}\n"
                     "  Close `pio device monitor` or anything else using the port.")
        self._rx = bytearray()

    def send(self, line):
        self.ser.write((line + "\n").encode("ascii"))
        self.ser.flush()

    def _fill(self):
        chunk = self.ser.read(max(1, self.ser.in_waiting))
        self._rx += chunk
        return bool(chunk)

    def discard_input(self):
        time.sleep(0.1)
        self.ser.reset_input_buffer()
        self._rx.clear()

    def readline(self, timeout):
        end = time.monotonic() + timeout
        while True:
            i = self._rx.find(b"\n")
            if i >= 0:
                line = bytes(self._rx[:i]).rstrip(b"\r")
                del self._rx[:i + 1]
                return line.decode("utf-8", errors="replace")
            if time.monotonic() > end:
                return None
            self._fill()

    def read_exact(self, n, timeout):
        end = time.monotonic() + timeout
        while len(self._rx) < n:
            if time.monotonic() > end:
                return None
            self._fill()
        data = bytes(self._rx[:n])
        del self._rx[:n]
        return data

    def drain(self, quiet=0.6, limit=10.0):
        """Print camera log lines until it has been quiet for `quiet` seconds."""
        end = time.monotonic() + limit
        while time.monotonic() < end:
            line = self.readline(quiet)
            if line is None:
                return
            if line:
                print(f"  {line}")

    def identify(self):
        """True only if the board answers like the camera node."""
        self.discard_input()
        for _ in range(2):
            self.send("PING")
            end = time.monotonic() + 1.5
            while time.monotonic() < end:
                line = self.readline(end - time.monotonic())
                if line is None:
                    break
                if line.strip() == "PONG CAM":
                    return True
                if line.strip() == "PONG":
                    sys.exit(f"{self.ser.port} answered plain PONG: that is the KIOSK board, not the camera.\n"
                             "  Use the camera ESP32's port (or flash it with the current camera firmware).")
        return False

    def capture(self, timeout=10.0):
        """Send CAP; return (header dict, bytes) or (None, reason). Log lines are printed."""
        self.send("CAP")
        end = time.monotonic() + timeout
        while True:
            line = self.readline(max(0.0, end - time.monotonic()))
            if line is None:
                return None, "timed out waiting for IMG"
            if line.startswith("IMG "):
                break
            if line:
                print(f"  {line}")
            if line.startswith("[cam] ERROR"):
                self.drain(0.3, 2.0)
                return None, "camera reported an error"
        hdr = dict(kv.split("=", 1) for kv in line[4:].split())
        n = int(hdr["len"])
        data = self.read_exact(n, timeout=max(3.0, n / (BAUD / 10) * 2))
        if data is None:
            return None, f"frame cut short (expected {n} bytes)"
        trailer = self.read_exact(5, timeout=1.0)
        if trailer != b"\nEND\n":
            return None, f"bad trailer {trailer!r} - the stream lost sync"
        if fnv1a(data) != int(hdr["fnv"], 16):
            return None, f"hash mismatch (sent {hdr['fnv']}, got {fnv1a(data):08x})"
        return hdr, data

    def close(self):
        self.ser.close()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Campus Mithra camera node - grab frames as PNG")
    ap.add_argument("--port", required=True, help="the CAMERA board's COM port, e.g. COM12")
    ap.add_argument("--count", type=int, default=1, help="frames to capture (default 1)")
    ap.add_argument("--bars", action="store_true", help="turn on the colour-bar test pattern first")
    ap.add_argument("--no-bars", action="store_true", help="turn the colour-bar test pattern off first")
    ap.add_argument("--res", choices=["QQVGA", "QCIF", "QVGA"], help="frame size")
    ap.add_argument("--fmt", choices=["RGB565", "YUV422", "GRAY"], help="pixel format")
    ap.add_argument("--send", action="append", default=[],
                    help="send this command and print the reply instead of capturing (repeatable)")
    ap.add_argument("--out", type=Path, default=OUT_DIR, help=f"where PNGs go (default {OUT_DIR})")
    ap.add_argument("--no-save", action="store_true", help="check frames but do not write files")
    ap.add_argument("--raw", action="store_true", help="also save the raw bytes as .bin")
    ap.add_argument("--swap-bytes", action="store_true", help="RGB565 low byte first")
    ap.add_argument("--uyvy", action="store_true", help="YUV422 byte order U Y V Y instead of Y U Y V")
    args = ap.parse_args(argv)

    cam = CamLink(args.port)
    try:
        if not cam.identify():
            sys.exit(f"No PONG CAM from {args.port}. Is the camera firmware flashed and the port right?")
        print(f"camera node on {args.port}")

        if args.send:
            for cmd in args.send:
                print(f"> {cmd}")
                cam.send(cmd)
                cam.drain()
            return 0

        setup = []
        if args.res:
            setup.append(f"RES {args.res}")
        if args.fmt:
            setup.append(f"FMT {args.fmt}")
        if args.bars:
            setup.append("BARS 1")
        elif args.no_bars:
            setup.append("BARS 0")
        for cmd in setup:
            print(f"> {cmd}")
            cam.send(cmd)
            cam.drain()

        if not args.no_save:
            args.out.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d-%H%M%S")
        good, times = 0, []
        for i in range(args.count):
            t0 = time.monotonic()
            hdr, data = cam.capture()
            if hdr is None:
                print(f"frame {i + 1}/{args.count}: FAILED - {data}")
                cam.discard_input()
                continue
            dt = time.monotonic() - t0
            times.append(dt)
            good += 1
            w, h, fmt = int(hdr["w"]), int(hdr["h"]), hdr["fmt"]
            msg = f"frame {i + 1}/{args.count}: {w}x{h} {fmt} {len(data)} bytes, hash ok, " \
                  f"capture {hdr['ms']} ms, total {dt * 1000:.0f} ms"
            if not args.no_save:
                base = args.out / f"cam-{stamp}-{i + 1:03d}"
                write_png(base.with_suffix(".png"), to_image(data, w, h, fmt, args.swap_bytes, args.uyvy))
                if args.raw:
                    base.with_suffix(".bin").write_bytes(data)
                msg += f" -> {base.with_suffix('.png')}"
            print(msg)

        if args.count > 1:
            avg = f", average {sum(times) / len(times) * 1000:.0f} ms per frame" if times else ""
            print(f"{good}/{args.count} frames intact{avg}")
        return 0 if good == args.count else 1
    finally:
        cam.close()


if __name__ == "__main__":
    sys.exit(main())
