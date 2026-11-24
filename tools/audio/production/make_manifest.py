#!/usr/bin/env python3
"""Writes manifest.json (music-manifest schema v2 + candidate extras) and slots.json from report.json. usage: make_manifest.py DIR"""
import json, os, sys
d = sys.argv[1]
rep = json.load(open(os.path.join(d, "report.json")))
SHA = "e4b6314d4c27cc2719e51f7cc9f97f4df03dec8920696e744211afc29be3bebc"
LIC = ("CANDIDATE, NOT approved. Derived from the founder-selected Gemini-generated song 'Lagos No Dey Sleep' "
       f"(SHA-256 {SHA[:16]}...). Commercial-use rights of the source and of derivatives are unverified; do not ship "
       "before founder listening approval and a rights decision (docs/AUDIO_PRODUCTION.md).")
gain = {"lnds_menu": 1.1, "lnds_rumble": 1.12, "lnds_suddendeath": 1.12, "lnds_boss_1": 1.0, "lnds_boss_2": 1.1, "lnds_boss_3": 1.12,
        "lnds_camp_calm": 1.0, "lnds_camp_tension": 1.0, "lnds_camp_alert": 1.0}
tracks = []
for cid, c in rep["cues"].items():
    if c["kind"] != "music": continue
    t = dict(id=cid, title=c["description"], artist=None, source="Lagos No Dey Sleep (founder-approved Gemini recording), arranged from its stems",
             licence=LIC, file=cid + ".mp3", approved=False, gain=gain.get(cid, 1.0), loudnessLufs=c["lufs"], bpm=rep["bpm"],
             seconds=c["seconds"], bytes=c["bytes"], gameEvent=c["gameEvent"])
    if c["liteBytes"]: t["lite"] = f"lite/{cid}.mp3"; t["liteBytes"] = c["liteBytes"]
    tracks.append(t)
manifest = {
    "_comment": "UNAPPROVED audition candidates (decision AU1/AU2). Loaded only with ?audiodraft from the git-ignored public/audio/candidates/. 'syncGroups': tracks of one group have identical length and bar grid (110 BPM, 16 bars) so Sudden Death and boss levels take over at the same playback position. 'variants' tells the player which track the game state selects.",
    "version": 2, "approvalStatus": "candidate-awaiting-founder-listening", "sourceSha256": SHA,
    "tracks": tracks,
    "playlists": {"default": ["lnds_rumble"], "arenas": {}},
    "menu": ["lnds_menu"],
    "syncGroups": {k: "grid16" for k in ("lnds_rumble", "lnds_suddendeath", "lnds_boss_1", "lnds_boss_2", "lnds_boss_3")},
    "variants": {"suddenDeath": "lnds_suddendeath", "boss": ["lnds_boss_1", "lnds_boss_2", "lnds_boss_3"]},
}
json.dump(manifest, open(os.path.join(d, "manifest.json"), "w"), indent=2)
slots = {"_comment": "Candidate result stingers (unapproved). Loaded only with ?audiodraft=stings|all, after the shipped slots.",
         "slots": {"win_sting": {"file": "lnds_victory.mp3", "license": LIC, "source": "Lagos No Dey Sleep outro", "gain": 1},
                   "lose_sting": {"file": "lnds_defeat.mp3", "license": LIC, "source": "Lagos No Dey Sleep groove, tape-stop", "gain": 1}}}
json.dump(slots, open(os.path.join(d, "slots.json"), "w"), indent=2)
print("wrote manifest.json and slots.json:", len(tracks), "tracks")
