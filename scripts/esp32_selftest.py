"""Hardware self-test for the Campus Mithra kiosk. No server, no Gemma needed.

    python scripts/esp32_selftest.py              auto-detect the board
    python scripts/esp32_selftest.py --port COM9
    python scripts/esp32_selftest.py --volume 30  start quieter

Checks, in order, so a fault points at one thing:
  1. the USB link        (PING -> PONG)
  2. the screen          (a question and a long, multi-page answer)
  3. the speaker         (a chime, then real speech streamed from the PC)

Speech is made with the same edge-tts voice and 8-bit conversion the server
uses, so if this sounds right, answers will too. Needs internet for edge-tts.
Close `pio device monitor` first - only one program can hold the COM port.
"""
import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "server"))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from pc_client import connect_esp32  # noqa: E402

QUESTION = "What is the hostel fee for an AC double sharing room?"
ANSWER = ("An AC double sharing room costs Rs. 78,000 a year for the room plus "
          "Rs. 48,000 for the mess, so Rs. 1,26,000 in all. A refundable caution "
          "deposit of Rs. 8,000 is collected when you join. Hostel fees are paid in "
          "two instalments, in July and in December, and single rooms are limited "
          "to forty across all blocks, allotted first come first served to final "
          "year and postgraduate students.")


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--port", default="", help="COM port (auto-detected if omitted)")
    ap.add_argument("--volume", type=int, default=None, help="speaker volume 0-100")
    args = ap.parse_args()

    print("1. USB link")
    esp = connect_esp32(args.port, args.volume)
    if esp is None:
        return 1

    try:
        print("\n2. Screen - a question, then an answer long enough to need pages")
        esp.status("self test")
        esp.question(QUESTION)
        time.sleep(0.8)
        esp.answer(ANSWER)
        print("   Look at the TFT: question on top, answer below with a page counter.")

        print("\n3. Speaker - chime")
        esp.beep()
        time.sleep(0.6)

        print("   Speaker - speech (edge-tts -> 8-bit 8 kHz -> USB -> DAC -> PAM8403)")
        import speech
        voice = os.getenv("TTS_VOICE", "en-IN-NeerjaNeural")
        rate = int(os.getenv("ESP_PLAY_RATE", "8000"))
        t0 = time.time()
        mp3 = asyncio.run(speech.synth_mp3(speech.for_speech(ANSWER), voice))
        pcm = speech.mp3_to_u8(mp3, rate)
        print(f"   synthesised {len(pcm) / rate:.1f}s of audio in {time.time() - t0:.1f}s, streaming ...")
        t0 = time.time()
        ok, note = esp.play(pcm)
        took = time.time() - t0
        print(f"   {'OK' if ok else 'FAILED'}: {note}  (wall time {took:.1f}s)")
        if ok and "gap" in note:
            print("   Gaps mean the buffer ran dry: check the USB cable or try a lower volume of\n"
                  "   other USB traffic. A gap or two at the start is harmless.")
        esp.status("self test done")
        print("\nIf the screen showed both panels and you heard a chime and the full answer,")
        print("the kiosk hardware is working. Next:  python pc_client.py")
        return 0 if ok else 1
    finally:
        esp.close()


if __name__ == "__main__":
    sys.exit(main())
