"""Refuse to flash the camera firmware anywhere but the camera board.

The kiosk ESP32 runs the working push-to-talk firmware from ../firmware.
Flashing this camera sketch onto it by accident would replace that, so upload
needs an explicit port, and the board on that port is asked what it is first:

  sends INFO -> "[cam] ..." lines               the camera node: flash it
             -> "ERR:unknown command" / "PONG"  the KIOSK: refused
             -> nothing                         blank or other firmware: flashed,
                                                except on the kiosk's usual port

Asking, rather than refusing a port number, matters because Windows can give
both boards the same COM number when they are plugged into the same USB socket
one after the other. The port is checked where PlatformIO takes it from:
upload_port in platformio.ini, or --upload-port on the command line, which is
also what the VS Code PlatformIO port picker passes and which wins over the ini.

A board that does not answer on the kiosk's usual port (a blank camera board,
say) is refused unless CAM_FLASH_UNKNOWN=1 is set for that one upload:
    $env:CAM_FLASH_UNKNOWN=1; pio run -t upload; Remove-Item Env:CAM_FLASH_UNKNOWN
"""
import os
import time

Import("env")  # noqa: F821 - injected by SCons

KIOSK_PORTS = {"COM9"}          # firmware/platformio.ini upload_port
PROBE_BAUD = 921600             # both boards' serial speed


def _norm(port):
    port = (port or "").strip()
    if port.startswith("\\\\.\\"):  # \\.\COM9, the long form of COM9
        port = port[4:]
    return port


def _refuse(env, *lines):
    print()
    for line in lines:
        print(f"*** {line}")
    print()
    env.Exit(1)


def probe(port):
    """'camera', 'kiosk', 'silent', or 'busy: <reason>'."""
    import serial
    ser = serial.Serial()
    ser.port, ser.baudrate, ser.timeout = port, PROBE_BAUD, 0.1
    ser.dtr = False             # do not reset the board by opening the port
    ser.rts = False
    try:
        ser.open()
    except serial.SerialException as exc:
        return f"busy: {exc}"
    try:
        for attempt in range(2):        # the second try covers a board that was booting
            ser.reset_input_buffer()
            ser.write(b"\nINFO\n")
            ser.flush()
            buf = b""
            end = time.monotonic() + 1.5
            while time.monotonic() < end:
                buf += ser.read(256)
                for raw in buf.split(b"\n"):
                    line = raw.strip().decode("ascii", errors="replace")
                    if line.startswith("[cam]") or line == "PONG CAM":
                        return "camera"
                    if line.startswith(("ERR:", "[esp]")) or line == "PONG":
                        return "kiosk"
            if attempt == 0:
                time.sleep(1.0)
        return "silent"
    finally:
        ser.close()


def guard(source, target, env):
    ini_port = _norm(env.GetProjectOption("upload_port", ""))
    port = _norm(env.subst("$UPLOAD_PORT")) or ini_port
    if not port:
        _refuse(env,
                "camera upload refused: set upload_port in camera/platformio.ini to the",
                "CAMERA board's port first (e.g. upload_port = COM12), or pass",
                "--upload-port COM12. Auto-detect is off on purpose - with both boards",
                "plugged in it could pick the kiosk.")

    kind = probe(port)
    print(f"camera upload: board on {port} -> {kind}")
    if kind == "camera":
        return
    if kind == "kiosk":
        _refuse(env,
                f"camera upload refused: the board on {port} is the KIOSK (it answers like",
                "../firmware). Unplug it, plug in the camera ESP32, and check its port with",
                "`pio device list`.")
    if kind.startswith("busy"):
        _refuse(env,
                f"camera upload refused: could not open {port} to check which board it is",
                f"({kind[6:]}). Close pc_client.py, start.ps1's windows and any serial monitor.")
    # silent: no camera firmware answered.
    if port.upper() in KIOSK_PORTS and os.environ.get("CAM_FLASH_UNKNOWN") != "1":
        _refuse(env,
                f"camera upload refused: nothing answered on {port}, the kiosk's usual port,",
                "so it cannot be confirmed as the camera board. If ONLY the camera ESP32 is",
                "plugged in (a blank board answers nothing), flash it once with:",
                "  $env:CAM_FLASH_UNKNOWN=1; pio run -t upload; Remove-Item Env:CAM_FLASH_UNKNOWN",
                "After that it answers as the camera and no override is needed.")
    print(f"camera upload -> {port} (no firmware answered; assuming a blank camera board)")


env.AddPreAction("upload", guard)  # noqa: F821
