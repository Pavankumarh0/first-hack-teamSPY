"""Refuse to flash the camera firmware anywhere but the camera board.

The kiosk ESP32 (COM9) runs the working push-to-talk firmware from ../firmware.
Flashing this camera sketch onto it by accident would replace that, so upload
needs an explicit upload_port, and the kiosk's port is refused outright.

The port is checked where PlatformIO actually takes it from: upload_port in
platformio.ini, or --upload-port on the command line, which is also what the
port picker in the VS Code PlatformIO toolbar passes and which wins over the ini.
"""
Import("env")  # noqa: F821 - injected by SCons

KIOSK_PORTS = {"COM9"}          # firmware/platformio.ini upload_port


def _norm(port):
    port = (port or "").strip()
    if port.startswith("\\\\.\\"):  # \\.\COM9, the long form of COM9
        port = port[4:]
    return port


def guard(source, target, env):
    ini_port = _norm(env.GetProjectOption("upload_port", ""))
    port = _norm(env.subst("$UPLOAD_PORT")) or ini_port
    for p in (port, ini_port):
        if p.upper() in KIOSK_PORTS:
            port = p
            break
    if not port:
        print("\n*** camera upload refused: set upload_port in camera/platformio.ini to the")
        print("*** CAMERA board's port first (e.g. upload_port = COM12), or pass")
        print("*** --upload-port COM12. Auto-detect is off on")
        print("*** purpose - with both boards plugged in it could pick the kiosk.\n")
        env.Exit(1)
    if port.upper() in KIOSK_PORTS:
        print(f"\n*** camera upload refused: {port} is the KIOSK board. Its firmware lives in")
        print("*** ../firmware. Plug in the camera ESP32 and use its own port.\n")
        env.Exit(1)
    print(f"camera upload -> {port}")


env.AddPreAction("upload", guard)  # noqa: F821
