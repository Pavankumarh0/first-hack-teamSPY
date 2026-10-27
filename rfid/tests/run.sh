#!/usr/bin/env bash
# Host tests for the RFID link (no hardware): protocol, sender logic, and the
# ESP32 receiver module compiled against small Arduino stand-ins.
set -euo pipefail
cd "$(dirname "$0")"
out="${TMPDIR:-/tmp}/campus-rfid-tests"
mkdir -p "$out"
flags=(-std=c++17 -Wall -Wextra -Werror -fsanitize=address,undefined -g)
g++ "${flags[@]}" test_protocol.cpp -o "$out/test_protocol"
"$out/test_protocol"
g++ "${flags[@]}" -I stubs -I ../../firmware/include test_receiver.cpp ../../firmware/src/rfid_receiver.cpp -o "$out/test_receiver"
"$out/test_receiver"
