"""Refuse to flash the camera firmware anywhere but the camera board.

The kiosk ESP32 (COM9) runs the working push-to-talk firmware from ../firmware.
Flashing this camera sketch onto it by accident would replace that, so upload
needs an explicit upload_port, and the kiosk's port is refused outright.
"""
Import("env")  # noqa: F821 - injected by SCons

KIOSK_PORTS = {"COM9"}          # firmware/platformio.ini upload_port


def guard(source, target, env):
    port = (env.GetProjectOption("upload_port", "") or "").strip()
    if not port:
        print("\n*** camera upload refused: set upload_port in camera/platformio.ini to the")
        print("*** CAMERA board's port first (e.g. upload_port = COM12). Auto-detect is off on")
        print("*** purpose - with both boards plugged in it could pick the kiosk.\n")
        env.Exit(1)
    if port.upper() in KIOSK_PORTS:
        print(f"\n*** camera upload refused: {port} is the KIOSK board. Its firmware lives in")
        print("*** ../firmware. Plug in the camera ESP32 and use its own port.\n")
        env.Exit(1)
    print(f"camera upload -> {port}")


env.AddPreAction("upload", guard)  # noqa: F821
