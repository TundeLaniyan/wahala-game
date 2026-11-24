#!/usr/bin/env python3
"""Builds the Lagos No Dey Sleep arrangement CANDIDATES from the founder-approved recording.

Everything musical comes from the approved song itself: the instrumental is its own drums + bass + other stems (ML
separation, htdemucs_ft), re-cut on its own 110 BPM bar grid. The only added material is short percussion / riser /
brass-stab layers for the Sudden Death and boss versions (code-synthesised, marked as such in the report).

Needs: numpy scipy soundfile librosa, ffmpeg. Stems are made by tools/audio/production/separate.sh (not committed).
usage: make_candidates.py --stems DIR --original FILE.mp3 --out DIR
"""
import argparse, json, os, subprocess, sys
import numpy as np
import soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import *

BPM, OFF = 110.0, 0.05          # measured: tempo 110.00, first beat 0.05 s (tools/audio/production/analyse.py)
BEAT = 60 / BPM
BAR = 4 * BEAT
X = int(0.04 * SR)              # 40 ms equal-power joins


def tb(b): return OFF + b * BAR  # start time (s) of bar b


def cut(x, b0, nb, pre=0):
    a = int(round(tb(b0) * SR)); z = int(round(tb(b0 + nb) * SR))
    return x[a - pre:z]


def assemble(stem, sections, loop=True):
    segs = [cut(stem, b0, nb, pre=X) for b0, nb in sections]
    out = segs[0][X:]
    for s in segs[1:]:
        out = xfade_join(out, s, X)
    return loop_close(out, segs[0][:X], X) if loop else out


def build(stems, sections, loop=True):
    return {k: assemble(v, sections, loop) for k, v in stems.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stems", required=True); ap.add_argument("--original", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--tmp", default="/tmp/_lnds.wav")
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "lite"), exist_ok=True)

    def rd(p):
        x, sr = sf.read(p, dtype="float64"); assert sr == SR, sr
        return to_stereo(x)
    st = {n: rd(os.path.join(a.stems, n + ".wav")) for n in ("vocals", "drums", "bass", "other")}
    orig = rd(a.original)
    n = min(len(orig), *[len(v) for v in st.values()])
    st = {k: v[:n] for k, v in st.items()}; orig = orig[:n]
    ins = {k: st[k] for k in ("drums", "bass", "other")}  # the instrumental: no vocals stem anywhere in the loops

    import librosa  # pitch-shifted copies (-5 semitones: F -> C) for the boss / campaign material
    def shift(x, steps):
        return np.stack([librosa.effects.pitch_shift(x[:, c], sr=SR, n_steps=steps, res_type="soxr_hq") for c in (0, 1)], axis=1)
    low = {"bass": shift(st["bass"], -5), "other": shift(st["other"], -5)}

    report = {"bpm": BPM, "firstBeat": OFF, "barSeconds": BAR, "cues": {}}

    def emit(cid, x, target, kind, desc, event, loop, sources, lite=True, added=None):
        y = normalise(x, target, a.tmp)
        full = os.path.join(a.out, cid + ".mp3")
        for _ in range(4):  # closed loop: AAC decoders overshoot, so measure the DECODED file and back off until it is safe
            encode(y, a.tmp, full, "128k")
            dec = full + ".dec.wav"; subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", full, "-ar", str(SR), dec], check=True)
            dx, _ = sf.read(dec); _, dtp = measure(dx, a.tmp); os.remove(dec)
            if dtp is None or dtp <= -1.0: break
            y = y * db(-1.3 - dtp)
        lufs, tp = measure(y, a.tmp)
        lite_b = None
        if lite:
            lp_ = os.path.join(a.out, "lite", cid + ".mp3"); encode(y, a.tmp, lp_, "64k"); lite_b = os.path.getsize(lp_)
        report["cues"][cid] = dict(kind=kind, description=desc, gameEvent=event, loop=loop, samples=int(len(y)), seconds=round(len(y) / SR, 3),
                                   lufs=lufs, truePeakDb=tp, bytes=os.path.getsize(full), liteBytes=lite_b, source=sources, addedSynthesis=added or [])
        print(f"{cid:22s} {len(y)/SR:6.2f}s {lufs:6.1f} LUFS tp {tp:5.1f}  {os.path.getsize(full)/1024:6.0f} KB" + (f" lite {lite_b/1024:5.0f} KB" if lite_b else ""))
        return y

    # ---------------------------------------------------------------- 1. menu loop: verse 2 + chorus B, instrumental, 16 bars
    m = build(ins, [(24, 16)])
    mix = m["drums"] * db(-1.0) + bass_harmonics(m["bass"], 0.2) * db(0.0) + m["other"] * db(1.5)
    mix = compress(hp(mix, 35), -22, 2.0)
    emit("lnds_menu", mix, -15.0, "music", "Instrumental main-menu loop: verse 2 + chorus B of the approved song, vocals removed (bars 25-40, 16 bars)",
         "title / menus", True, "bars 24-39 of drums+bass+other")

    # ---------------------------------------------------------------- 2/3. City Rumble mix and Sudden Death (identical grid: crossfade-able)
    secs = [(8, 8), (32, 8)]
    m = build(ins, secs)
    def gameplay(dm, bm, om, pocket=True):
        x = m["drums"] * db(dm) + bass_harmonics(m["bass"] * db(bm), 0.45) + m["other"] * db(om)
        x = hp(x, 60)
        if pocket:  # leave room where danger SFX live (2-5 kHz) and cut mud, so warnings stay clear on phone speakers
            x = peq(x, 3200, -3.5, 0.9); x = peq(x, 1100, -1.5, 0.9); x = peq(x, 300, -1.5, 1.0)
        return x
    rum = compress(gameplay(1.8, 0.8, -1.5), -20, 2.6, makeup_db=0.5)
    emit("lnds_rumble", rum, -14.0, "music", "City Rumble in-match mix: chorus A + chorus B, instrumental, drums/bass forward, mid pocket for SFX (16 bars)",
         "City Rumble match", True, "bars 8-15 + 32-39 of drums+bass+other")

    sd = gameplay(3.5, 1.5, 0.0)
    sd = shelf(sd, 4500, 2.5)
    L = len(sd); lay = np.zeros((L, 2)); nbeats = int(L / SR / BEAT)
    tom = sub_tom(); hat = noise_hit(); hat2 = noise_hit(seed=2, decay=0.012)
    for k in range(nbeats):
        t = k * BEAT; bar_i = k // 4; accent = (k % 4 == 0)
        place(lay, tom, t, 0.34 if accent else 0.2)
        place(lay, hat2, t + BEAT / 2, 0.16, 0.3); place(lay, hat, t + BEAT * 0.25, 0.07, -0.3); place(lay, hat, t + BEAT * 0.75, 0.07, 0.3)
    for bar_i in range(16):
        t0 = bar_i * BAR
        if bar_i % 4 == 3:  # snare-ish roll in the last beat of every fourth bar
            for j in range(8): place(lay, noise_hit(0.09, 1200, 5000, 0.03, 10 + j), t0 + 3 * BEAT + j * BEAT / 8, 0.10 + 0.03 * j)
        if bar_i % 8 == 6: place(lay, riser(2 * BAR - 0.05), t0, 0.35)
        if bar_i % 8 == 0: place(lay, impact(), t0, 0.26)
    sd = sd + lay
    sd = compress(sd, -19, 3.0, makeup_db=0.8)
    emit("lnds_suddendeath", sd, -13.0, "music", "Sudden Death version: same 16-bar grid as the rumble mix (position-synced crossfade), drums +1.7 dB, brighter, heartbeat toms, hats, snare rolls, risers",
         "Sudden Death / Wahala Crush", True, "bars 8-15 + 32-39 of drums+bass+other", added=["sub toms", "hats", "snare rolls", "risers", "impacts"])

    # ---------------------------------------------------------------- 4. boss theme, three position-synced levels (same grid)
    bsec = [(24, 8), (32, 8)]
    bi = build({"drums": st["drums"], "bass": low["bass"], "other": low["other"]}, bsec)
    Lb = len(bi["drums"]); C3, G3, C4, G2 = 130.81, 196.0, 261.63, 98.0
    def boss(level):
        d, b, o = bi["drums"], bass_harmonics(bi["bass"], 0.5), bi["other"]
        lay = np.zeros((Lb, 2)); nb = int(Lb / SR / BEAT)
        if level == 0:
            x = lp(d, 260) * db(-1.0) + b * db(0.5) + lp(o, 900) * db(-4.0)
            for k in range(0, nb, 2): place(lay, sub_tom(70, 38, 0.45, 0.2), k * BEAT, 0.3)
        elif level == 1:
            x = d * db(1.0) + b * db(1.0) + o * db(0.0)
            for k in range(nb): place(lay, sub_tom(80, 42, 0.38, 0.15), k * BEAT, 0.3 if k % 4 == 0 else 0.18)
            for k in range(nb * 2): place(lay, noise_hit(0.05, 7000, 16000, 0.015, 3 + k % 5), k * BEAT / 2 + BEAT / 2 * (k % 2), 0.08, 0.2)
        else:
            x = shelf(d * db(2.5) + b * db(1.5) + o * db(1.0), 4000, 2.0)
            for k in range(nb): place(lay, sub_tom(85, 42, 0.4, 0.16), k * BEAT, 0.34 if k % 4 == 0 else 0.2)
            stab = brass_stab([G2, C3, G3, C4])
            for bar_i in range(16):
                t0 = bar_i * BAR
                place(lay, stab, t0, 0.42, -0.1); place(lay, stab, t0 + 2.5 * BEAT, 0.3, 0.1)
                if bar_i % 4 == 3:
                    for j in range(8): place(lay, noise_hit(0.09, 1200, 5000, 0.03, 20 + j), t0 + 3 * BEAT + j * BEAT / 8, 0.10 + 0.03 * j)
                if bar_i % 8 == 6: place(lay, riser(2 * BAR - 0.05), t0, 0.32)
                if bar_i % 8 == 0: place(lay, impact(), t0, 0.3)
        y = hp(x + lay, 55); y = peq(y, 3200, -3.0, 0.9)
        return compress(y, -19, 2.8)
    for lv, tgt in ((0, -17.0), (1, -14.5), (2, -13.0)):
        emit(f"lnds_boss_{lv+1}", boss(lv), tgt, "music", f"Boss theme level {lv+1}/3 ({['stalking','engaged','all-out'][lv]}): the song's bass and 'other' stems transposed -5 semitones (F->C) over its own drums; levels share one 16-bar grid",
             f"boss encounter, intensity {lv+1}", True, "bars 24-39 (drums, bass -5 st, other -5 st)",
             added=["sub toms"] + (["hats"] if lv == 1 else []) + (["brass stabs C-G", "snare rolls", "risers", "impacts", "hats"] if lv == 2 else []))

    # ---------------------------------------------------------------- 5. logo sting from the chorus's first sung line (original mix, vocals kept on purpose)
    s0 = OFF + 32 * BEAT - 0.004; s1 = OFF + 37.45 * BEAT + 0.30
    seg = orig[int(s0 * SR):int(s1 * SR)].copy()
    lead = int(0.85 * SR); out = np.zeros((lead + len(seg), 2))
    out[lead:] = seg; place(out, riser(0.85, 250, 9000), 0.0, 0.55); place(out, impact(), lead / SR, 0.5)
    f = int(0.45 * SR); out[-f:] *= np.linspace(1, 0, f)[:, None]
    emit("lnds_sting", out, -13.0, "stinger", "WAHALA! logo sting: a riser into the chorus's first sung line (the original recording, bars 9-10) with an impact",
         "title / logo reveal (no game hook yet)", False, "original mix, 17.5 s - 20.4 s", lite=False, added=["riser", "impact"])

    # ---------------------------------------------------------------- 6. victory: the song's own ending (outro), from bar 42
    v0 = tb(41); v = orig[int(v0 * SR):].copy()
    idx = np.where(np.abs(v).max(axis=1) > db(-58))[0]; v = v[:idx[-1] + int(0.25 * SR)]
    fo = int(0.3 * SR); v[-fo:] *= np.linspace(1, 0, fo)[:, None]
    vo = np.zeros((len(v), 2)); vo += v; place(vo, impact(), 0.0, 0.3)
    emit("lnds_victory", vo, -14.0, "stinger", "Victory cue: the approved song's own outro and ending (bars 42-45), with a low impact on the downbeat",
         "match won / mission complete", False, "original mix from 89.5 s to the end", lite=False, added=["impact"])

    # ---------------------------------------------------------------- 7. defeat: one bar of the groove that tape-stops
    d0 = tb(13); src = (ins["drums"] + ins["bass"] + ins["other"])[int(d0 * SR):int((d0 + BAR + 0.5) * SR)]
    sec = 2.6; tt = np.arange(int(sec * SR)) / SR
    spd = np.where(tt < 0.6, 1.0, np.exp(-(tt - 0.6) / 0.9) * 0.85 + 0.15)
    pos = np.cumsum(spd) / SR * SR
    pos = np.clip(pos, 0, len(src) - 2)
    ds = np.stack([np.interp(pos, np.arange(len(src)), src[:, c]) for c in (0, 1)], axis=1)
    cutoff = np.geomspace(12000, 300, 24); chunks = np.array_split(np.arange(len(ds)), 24); y = np.zeros_like(ds)
    for ci, ix in zip(cutoff, chunks): y[ix] = lp(ds, ci, 2)[ix]
    y *= np.minimum(1, (sec - tt) / 0.4)[:, None] ** 1.0
    place(y, sub_tom(70, 36, 0.8, 0.3), 1.45, 0.5)
    emit("lnds_defeat", y, -15.0, "stinger", "Defeat cue: one bar of the song's groove that slows like a tape stopping, with a low thud (comic, not cruel)",
         "match lost", False, "bar 14 instrumental, tape-stop processed", lite=False, added=["sub tom"])

    # ---------------------------------------------------------------- 8. campaign atmosphere cues (three)
    c = build({"bass": st["bass"], "other": st["other"]}, [(0, 6)])
    calm = lp(c["bass"] * db(-2) + c["other"] * db(2.0), 7000)
    emit("lnds_camp_calm", calm, -22.0, "music", "Campaign calm / briefing bed: the song's intro pad + bass, no drums, no vocals (bars 1-6)",
         "campaign briefing, story cards, safe areas", True, "bars 0-5 of bass+other")
    t_ = build({"other": low["other"]}, [(16, 8)])
    ten = lp(t_["other"] * db(4.0), 2200); lay = np.zeros_like(ten)
    for k in range(0, int(len(ten) / SR / BEAT), 2): place(lay, sub_tom(60, 36, 0.5, 0.22), k * BEAT, 0.3)
    emit("lnds_camp_tension", ten + lay, -22.0, "music", "Campaign tension bed: verse 1's 'other' stem (-5 st, low-passed) with a slow heartbeat (8 bars)",
         "raids, stealth, guarded areas", True, "bars 16-23 of other -5 st", added=["heartbeat sub toms"])
    al = build({"drums": st["drums"], "bass": low["bass"]}, [(24, 8)])
    alert = hp(al["drums"], 1500) * db(1.0) + bass_harmonics(al["bass"], 0.5) * db(0.5); lay = np.zeros_like(alert)
    for j in range(0, 8, 4): place(lay, riser(2 * BAR - 0.05), (j + 2) * BAR, 0.3)
    emit("lnds_camp_alert", alert + lay, -19.0, "music", "Campaign alert / pursuit bed: the song's hats and snares over its bass at -5 st, risers every 4 bars (8 bars)",
         "campaign alert, enemy reinforcements, boss approach", True, "bars 24-31 of drums (>1.5 kHz) + bass -5 st", added=["risers"])

    json.dump(report, open(os.path.join(a.out, "report.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
