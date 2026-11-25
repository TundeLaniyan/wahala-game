#!/usr/bin/env python3
"""Builds ONE self-contained listening page: the approved original, every candidate, the music transitions, the danger-over-music
test and the sound effects with before/after comparisons. Audio is embedded (MP3 data), so the page needs no network.
The page embeds the approved recording itself: do not commit its output.
usage: build_review.py --original ORIGINAL.mp3 --cand DIR (candidates with report.json) --sfx DIR (render_set.ts output) --out FILE.html
"""
import argparse, base64, json, os, subprocess, tempfile

ap = argparse.ArgumentParser()
ap.add_argument("--original", required=True); ap.add_argument("--cand", required=True); ap.add_argument("--sfx", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
rep = json.load(open(os.path.join(a.cand, "report.json")))
meta = json.load(open(os.path.join(a.sfx, "meta.json")))
sets = json.load(open(os.path.join(here, "listening_set.json")))
b64 = lambda p: base64.b64encode(open(p, "rb").read()).decode()
tmp = tempfile.mkdtemp()
audio, items = {}, []

orig_b = os.path.getsize(a.original)
audio["original"] = b64(a.original)
items.append(dict(id="original", group="orig", title="Lagos No Dey Sleep (approved original, full song)", file="WAHALA_APPROVED_MAIN_THEME_Lagos_No_Dey_Sleep.mp3", seconds=98.9, bytes=orig_b, lufs=-12.6, loop=False,
                  event="the founder-selected theme, untouched. 110 BPM, about F major / A minor, with vocals"))
ORDER = [("lnds_menu", "menu"), ("lnds_rumble", "rumble"), ("lnds_suddendeath", "rumble"), ("lnds_boss_1", "boss"), ("lnds_boss_2", "boss"), ("lnds_boss_3", "boss"),
         ("lnds_sting", "stinger"), ("lnds_victory", "stinger"), ("lnds_defeat", "stinger"), ("lnds_camp_calm", "camp"), ("lnds_camp_tension", "camp"), ("lnds_camp_alert", "camp")]
for cid, grp in ORDER:
    c = rep["cues"][cid]
    audio[cid] = b64(os.path.join(a.cand, cid + ".mp3"))
    items.append(dict(id=cid, group=grp, title=c["description"], file=cid + ".mp3", seconds=c["seconds"], bytes=c["bytes"], lite=c["liteBytes"], lufs=c["lufs"], loop=c["loop"], event=c["gameEvent"], added=c["addedSynthesis"]))

sfx = []
for cat in sets["categories"]:
    for it in cat["items"]:
        for sid in {it["id"], it.get("replaces")} - {None}:
            if sid in audio: continue
            w = os.path.join(a.sfx, sid + ".wav"); m = os.path.join(tmp, sid + ".mp3")
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", w, "-ac", "1", "-c:a", "libmp3lame", "-b:a", "64k", m], check=True)
            audio[sid] = b64(m)
        sfx.append(dict(cat=cat["id"], catTitle=cat["title"], **it, seconds=round(meta[it["id"]]["seconds"], 2), bytes=os.path.getsize(os.path.join(a.sfx, it["id"] + ".wav"))))

html = open(os.path.join(here, "review_template.html")).read()
html = html.replace("__ITEMS__", json.dumps(items)).replace("__SFX__", json.dumps(sfx)).replace("__AUDIO__", json.dumps(audio))
open(a.out, "w").write(html)
print(a.out, round(os.path.getsize(a.out) / 1e6, 1), "MB;", len(audio), "audio files")
