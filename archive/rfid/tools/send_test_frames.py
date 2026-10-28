"""Pretends to be the UNO Q card reader, through a USB-to-UART adapter.

Tests the ESP32 receiver (firmware/src/rfid_receiver.cpp) without the UNO Q:
wire the adapter's TX to ESP32 GPIO16 and GND to GND (3.3 V adapter only - set
its jumper to 3.3 V; a 5 V TX line can damage the ESP32). Then watch the
ESP32's own USB port (`pio device monitor`, 921600 baud) for "[esp] rfid:" lines.

    python rfid/tools/send_test_frames.py --port COM12                  # the standard sequence
    python rfid/tools/send_test_frames.py --port COM12 --uid A3:2F:91:0C  # one tap
    python rfid/tools/send_test_frames.py --port /dev/ttyUSB0 --uid A3:2F:91:0C --repeat 5 --gap 3

Needs pyserial (already used by pc_client.py).
"""
import argparse
import re
import sys
import time

UID = re.compile(r"^[0-9A-F]{2}(:[0-9A-F]{2}){3}$|^[0-9A-F]{2}(:[0-9A-F]{2}){6}$|^[0-9A-F]{2}(:[0-9A-F]{2}){9}$")

# (bytes on the wire, what the ESP32 should log)
SEQUENCE = [
    (b"*** Booting Zephyr OS (simulated noise) ***\r\n", "ignored ... not a frame (within a second)"),
    (b"HELLO:RFID/1 reader=ok\n", "sender says RFID/1 reader=ok"),
    (b"RFID:A3:2F:91:0C\n", "card A3:2F:91:0C"),
    (b"RFID:A3:2F:91:0C\n", "repeat of A3:2F:91:0C ignored"),
    (b"RFID:a3:2f:91:0c\n", "ignored ... bad UID"),
    (b"RFID:" + b"F" * 120 + b"\n", "ignored ... too long"),
    (b"RFID:04:5A:1B:2C:3D:80:01\n", "card 04:5A:1B:2C:3D:80:01"),
]


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", required=True, help="the USB-UART adapter (not the ESP32's own port)")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--uid", help="send only this UID, e.g. A3:2F:91:0C")
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--gap", type=float, default=2.5, help="seconds between taps (>2 s = separate taps)")
    args = ap.parse_args(argv)

    import serial  # noqa: E402 - only needed when actually sending

    if args.uid and not UID.match(args.uid):
        sys.exit("--uid must be 4, 7 or 10 uppercase hex bytes joined by ':' (A3:2F:91:0C)")
    with serial.Serial(args.port, args.baud, timeout=1) as link:
        if args.uid:
            for i in range(args.repeat):
                link.write(f"RFID:{args.uid}\n".encode())
                link.flush()
                print(f"sent RFID:{args.uid}  -> expect '[esp] rfid: card {args.uid}'")
                if i + 1 < args.repeat:
                    time.sleep(args.gap)
            return 0
        for data, expect in SEQUENCE:
            link.write(data)
            link.flush()
            shown = data.decode(errors="replace").strip()
            print(f"sent {shown[:48]!r:52} -> expect '[esp] rfid: {expect}'")
            time.sleep(0.3)
        time.sleep(1.2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
