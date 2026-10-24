# Wi-Fi kiosk firmware (archived)

The campus-saathi design: the ESP32 records its own ADC microphone while a TALK
button is held, POSTs the audio to `/api/esp/ask` over Wi-Fi, and plays the
returned 8-bit audio. It needs a mic circuit on GPIO34 and buttons on GPIO27 and
GPIO14, and its TFT pins (DC=21, RST=22) do not match the wired board.

Replaced by the USB-serial display node in `firmware/`, where the PC does the
listening. The server still exposes `/api/esp/*`, so this firmware works again if
that hardware is ever built.
