#!/usr/bin/env python3
"""One-time remap: point every non-flagship scene at its own unique
scene-named background (zero bg reuse, #bg-variants). Run once."""
import re

SCENARIO = "scenario.js"
MAP = {
    "night_thoughts": "apartment_night__night_thoughts",
    "reply_email": "email_screen__reply_email",
    "ending_silence": "email_screen__ending_silence",
    "log_last": "email_screen__log_last",
    "diverge": "observatory_night__diverge",
    "finale_gate": "server_room__finale_gate",
    "call_lin": "streets_rain__call_lin",
    "climb_rain": "streets_rain__climb_rain",
    "ending_turnback": "streets_rain__ending_turnback",
    "ending_bad": "streets_rain__ending_bad",
    "obsv_daily": "observatory_night__obsv_daily",
    "converge_talk": "observatory_night__converge_talk",
    "keeper_before": "observatory_night__keeper_before",
    "gate_approach": "observatory_night__gate_approach",
    "wake_check": "observatory_night__wake_check",
    "hall_quiet": "server_room__hall_quiet",
    "server_hall": "server_room__server_hall",
    "liar_reveal": "server_room__liar_reveal",
    "lin_grief": "server_room__lin_grief",
    "qi_converse": "server_room__qi_converse",
    "cut_path": "server_room__cut_path",
    "substitute_before": "server_room__substitute_before",
    "clearance_before": "server_room__clearance_before",
    "qi_watch": "server_room__qi_watch",
    "qi_dawn": "server_room__qi_dawn",
    "ending_clearance": "server_room__ending_clearance",
    "ending_qi": "server_room__ending_qi",
    "wake_path": "memory_white__wake_path",
    "wake_talk": "memory_white__wake_talk",
    "old_fight": "memory_white__old_fight",
    "unplug_before": "memory_white__unplug_before",
    "ending_unplug": "memory_white__ending_unplug",
    "ending_substitute": "finale_star__ending_substitute",
    "extras_1": "finale_star__extras_1",
    "extras_2": "finale_star__extras_2",
    "morning_table": "dawn_ending__morning_table",
}

s = open(SCENARIO, encoding="utf-8").read()
ids = [(m.group(1), m.end()) for m in re.finditer(r"\n    ([a-z_0-9]+): \{", s)]
ids.append(("__eof__", len(s)))
changed = 0
for (sid, start), (nid, end) in zip(ids[:-1], ids[1:]):
    if sid not in MAP:
        continue
    seg = s[start:end]
    new_bg, old_bg = MAP[sid], None
    m = re.search(r"bg: \"([a-z_0-9]+)\"", seg)
    if not m:
        print("NO BG LINE:", sid)
        continue
    old_bg = m.group(1)
    if old_bg == new_bg:
        continue
    seg2 = seg[: m.start(1)] + new_bg + seg[m.end(1):]
    s = s[:start] + seg2 + s[end:]
    print(f"  {sid}: {old_bg} -> {new_bg}")
    changed += 1
open(SCENARIO, "w", encoding="utf-8").write(s)
print("scenes remapped:", changed)
