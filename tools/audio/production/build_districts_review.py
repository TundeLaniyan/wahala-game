#!/usr/bin/env python3
"""Builds the district listening page and the file set to publish next to it (the page fetches audio by relative URL, so
the 60 MB of originals and masters is not inlined). usage: build_districts_review.py --pack ZIP_DIR --masters DIR --vocal DIR --analysis analysis.json --out DIR"""
import argparse, json, os, shutil
ap = argparse.ArgumentParser()
ap.add_argument("--pack", required=True); ap.add_argument("--masters", required=True); ap.add_argument("--vocal", required=True)
ap.add_argument("--analysis", required=True); ap.add_argument("--out", required=True)
a = ap.parse_args()
here = os.path.dirname(os.path.abspath(__file__))
rep = json.load(open(os.path.join(a.masters, "report.json"))); ana = json.load(open(a.analysis)); man = json.load(open(os.path.join(a.masters, "manifest.json")))
os.makedirs(os.path.join(a.out, "audio"), exist_ok=True)
SHARED = {"oshodi": ["oshodiInterchange"], "lekki": ["lekkiRoadworks"], "lagosisland": ["balogunMarket"]}
NOTES = {
    "ojuelegba": "Steady 110 BPM with a clear build (dynamic spread 11 dB). Two very short vocal-like bursts near 126 s and 139 s (inside the loop): check by ear. Sources clip slightly (78 samples).",
    "oshodi": "The flattest of the seven (5.4 dB spread over 181 s) and the longest: the groove barely changes, so it is the likeliest to feel repetitive. Tempo is 124 BPM (the beat tracker first said 123). A vocal-like phrase at the very start (1.2-3.6 s) falls before the loop start.",
    "mushin": "Strong contrast (13 dB spread) and the best dynamic arc. One 0.7 s vocal-like burst near 56 s. Beat phase is ambiguous by half a beat (see QA), which does not affect looping or the Sudden Death hand-over.",
    "fadeyi": "UNINTENDED VOCALS: sung or chanted lines run through about half the song (51 segments, the vocal is only 10 dB below the instrumental). The mapped version is an instrumental made from stems, but the separation leaves a vocal about 22 dB down, so ghost vocals may be audible. The original with vocals is kept for comparison. Bass-heavy: it is the quietest on a phone-speaker simulation.",
    "ebute": "Slowest (105 BPM) and nearly mono (stereo width -17.7 dB), so it sounds narrower and heavier than the others; phone-speaker loudness is low (bass-heavy). No vocals detected. Fits a rail-yard pulse by tempo and weight; check it is not too dark for a fast arena.",
    "lagosisland": "110 BPM, clear sections, no sustained vocals; short vocal-like bursts at 4 s (before the loop), 77 s and 137-140 s (inside). The title and the Balogun market arena fit by theme.",
    "lekki": "Widest dynamics (18 dB): a quiet intro and long quiet tail. Vocal-like chops in the first 8 s (before the loop). The loop skips the quiet intro and is steady after that.",
}
D = []
for did, r in rep.items():
    A = ana[next(k for k in ana if k.lower().startswith({"ojuelegba":"01","oshodi":"02","mushin":"03","fadeyi":"04","ebute":"05","lagosisland":"06","lekki":"07"}[did]))]
    bar = 240 / r["bpm"]; src0 = r["firstBar"] + r["loop"]["startBar"] * bar; src1 = r["firstBar"] + r["loop"]["endBar"] * bar
    segs = [(s, e, src0 <= s < src1) for s, e in A.get("vocalSegmentsSec", [])]
    D.append(dict(id=did, district=r["district"], title=r["title"], arenas=[r["arena"]] + SHARED.get(did, []), bpm=r["bpm"], key=A["key"][0][0], srcSeconds=A["seconds"],
                  srcLufs=A["lufs"], srcTp=A["tp"], srcClipped=A["clippedSamples"], srcPhone=A["phoneLufs"], sideMid=A["sideMidDb"], dyn=A["dynamicSpreadDb"],
                  vocal=dict(toInstrumentalDb=A["vocalToInstrumentalDb"], duty=A["vocalDutyMinus40"], segments=segs, count=A["vocalSegmentCount"]),
                  instrumental=r["instrumentalFromStems"], loop=dict(src0=round(src0, 3), src1=round(src1, 3), **r["loop"]), starts=r["variantStartsSec"], master=r["master"],
                  sd=r["suddenDeath"], bitrates=r["bitrateComparison"], note=NOTES[did], levels=r["barLevelsDb"]))
    for src, dst in ((os.path.join(a.pack, "tracks", r["sourceFile"]), f"orig_{did}.mp3"), (os.path.join(a.masters, f"dist_{did}.mp3"), f"master_{did}.mp3"),
                     (os.path.join(a.masters, "lite", f"dist_{did}.mp3"), f"lite_{did}.mp3"), (os.path.join(a.masters, f"dist_{did}_sd.mp3"), f"sd_{did}.mp3")):
        shutil.copy(src, os.path.join(a.out, "audio", dst))
shutil.copy(os.path.join(a.vocal, "dist_fadeyi.mp3"), os.path.join(a.out, "audio", "master_fadeyi_vocal.mp3"))
rv = json.load(open(os.path.join(a.vocal, "report.json")))["fadeyi"]
fv = next(d for d in D if d["id"] == "fadeyi"); fv["vocalVersion"] = dict(loop=rv["loop"], master=rv["master"])
proposed = man.get("proposedNotApplied", {})
html = open(os.path.join(here, "districts_review_template.html")).read().replace("__DATA__", json.dumps(dict(districts=D, proposed=proposed)))
open(os.path.join(a.out, "index.html"), "w").write(html)
print("files:", sum(len(f) for _, _, f in os.walk(os.path.join(a.out, "audio"))), "audio,", round(sum(os.path.getsize(os.path.join(a.out, "audio", f)) for f in os.listdir(os.path.join(a.out, "audio"))) / 1e6, 1), "MB")
