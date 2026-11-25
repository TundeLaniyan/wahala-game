#!/usr/bin/env python3
"""Masters the seven district recordings into game-ready CANDIDATES: bar-aligned seamless loops that keep the song's
variation, standard and Data Saver MP3s, and a Sudden Death loop per track on the track's own tempo.

usage: make_districts.py --wav DIR (44.1 kHz WAVs of the pack) --analysis analysis.json --out DIR [--instrumental fadeyi=PATH.wav]
The recordings are NOT in git; the output folder is git-ignored too (derivatives of unapproved audio). Needs numpy scipy soundfile librosa, ffmpeg.
"""
import argparse, json, os, subprocess, sys
import numpy as np, soundfile as sf, librosa
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dsp import SR, db, hp, lp, peq, shelf, compress, limiter, measure, xfade_join, loop_close, place, sub_tom, noise_hit, riser, impact, tvec, phase

X = int(0.06 * SR)  # 60 ms equal-power join

DISTRICTS = {  # file stem prefix -> (id, district, game arena, title)
    "01_Ojuelegba": ("ojuelegba", "Ojuelegba", "rumbleOjuelegba", "Asphalt Throne"),
    "02_Oshodi": ("oshodi", "Oshodi", "rumbleOshodi", "Oshodi Transit"),
    "03_Mushin": ("mushin", "Mushin", "rumbleMushin", "Mushin Heat"),
    "04_Fadeyi": ("fadeyi", "Fadeyi-Somolu", "rumbleFadeyi", "We Still Dey Move"),
    "05_Ebute": ("ebute", "Ebute-Metta", "rumbleEbuteMetta", "Steel and Skin"),
    "06_Lagos": ("lagosisland", "Lagos Island", "rumbleLagosIsland", "Lagos Market Swagger"),
    "07_Lekki": ("lekki", "Lekki", "rumbleLekki", "Lekki Power Move"),
}
TONIC = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def refine_grid(mono, bpm0):
    """Tempo, first-beat offset and per-half phase drift, fitted on the onset envelope at 2.9 ms resolution."""
    hop = 128
    env = librosa.onset.onset_strength(y=mono, sr=SR, hop_length=hop, n_fft=1024)
    fs = SR / hop
    def best(env_, lo, hi):
        out = None
        for bpm in np.arange(lo, hi, 0.01):
            per = 60 / bpm * fs
            for ph in np.arange(0, per, 0.5):
                pos = (ph + np.arange(0, len(env_), per)).astype(int); pos = pos[pos < len(env_)]
                v = env_[pos].mean()
                if out is None or v > out[0]: out = (v, bpm, ph / fs)
        return out
    _, bpm, ph = best(env, bpm0 - 4.5, bpm0 + 4.5)
    if abs(bpm - round(bpm)) < 0.06: bpm = float(round(bpm))  # these generators use whole-number tempos; a 0.02 fit error would drift 0.2 s over 130 s  # wide: the beat tracker can be a whole BPM out (it said 123 for a 124 BPM track)
    beat = 60 / bpm
    half = len(env) // 2
    def phase_of(seg, off):
        per = beat * fs; best_ = None
        for p in np.arange(0, per, 0.5):
            pos = (p + np.arange(0, len(seg), per)).astype(int); pos = pos[pos < len(seg)]
            v = seg[pos].mean()
            if best_ is None or v > best_[0]: best_ = (v, p)
        return ((off + best_[1]) / fs) % beat
    p1 = phase_of(env[:half], 0); p2 = phase_of(env[half:], half)
    d = (p2 - p1 + beat / 2) % beat - beat / 2
    return bpm, ph, float(d * 1000)


def bar_features(x, bars, bar):
    """Features of the audio preceding (and following) each bar line: chroma, timbre, level."""
    mono = x.mean(axis=1); out = []
    for t in bars:
        a = int(max(0, t - bar) * SR); z = int(t * SR); seg = mono[a:z] if z - a > SR * 0.5 else np.zeros(SR)
        c = librosa.feature.chroma_stft(y=seg, sr=SR, n_fft=4096, hop_length=2048).mean(axis=1)
        m = librosa.feature.mfcc(y=seg, sr=SR, n_mfcc=13, n_fft=2048, hop_length=1024).mean(axis=1)[1:]
        out.append((c / (np.linalg.norm(c) + 1e-9), m / (np.linalg.norm(m) + 1e-9), 20 * np.log10(np.sqrt((seg ** 2).mean()) + 1e-9)))
    return out


def pick_loop(x, first, bar, nbars_total, tail_bars, sections_s):
    """Chooses bar-aligned loop in/out points: the longest loop (>= 80% of the song) whose end flows into its start."""
    bars = [first + k * bar for k in range(nbars_total + 1)]
    feats = bar_features(x, bars, bar)
    sec_bars = {int(round((s - first) / bar)) for s in sections_s}
    best = None
    for b0 in range(1, max(2, int(nbars_total * 0.22))):
        for b1 in range(int(nbars_total * 0.60), nbars_total - tail_bars + 1):
            if (b1 - b0) % 4: continue
            L = b1 - b0
            if L * bar < 0.72 * nbars_total * bar: continue
            cp, mp, ep = feats[b0]; cq, mq, eq = feats[b1]
            sim = float(cp @ cq) + float(mp @ mq) - abs(ep - eq) / 12
            bonus = 0.12 * ((b0 in sec_bars) + (b1 in sec_bars))
            score = sim + bonus + 1.2 * L / nbars_total
            if best is None or score > best[0]: best = (score, b0, b1, sim)
    return best, bars


def encode(x, path, kbps, tmp):
    sf.write(tmp, x.astype(np.float32), SR, subtype="FLOAT")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-c:a", "libmp3lame", "-b:a", f"{kbps}k", "-ar", str(SR), path], check=True)


def decode(path):
    w = path + ".dec.wav"; subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", path, "-ar", str(SR), w], check=True)
    d, _ = sf.read(w); os.remove(w); return d


def finish(x, target, tmp, ceiling=-1.8):
    """Loudness to target LUFS with a true-peak limiter and closed-loop codec peak guard (encoded at 192 k)."""
    cur, _ = measure(x, tmp); y = limiter(x * db(target - cur), ceiling)
    for _ in range(3):
        c2, _ = measure(y, tmp)
        if abs(c2 - target) < 0.2: break
        y = limiter(y * db(target - c2), ceiling)
    for _ in range(4):
        encode(y, tmp + ".mp3", 192, tmp)
        _, tp = measure(decode(tmp + ".mp3"), tmp)
        if tp is None or tp <= -1.0: break
        y = y * db(-1.2 - tp)
    return y


def wrap_metrics(x):
    step = np.abs(np.diff(x, axis=0)); typ = float(np.percentile(step, 99.9)); jump = float(np.abs(x[0] - x[-1]).max())
    n = int(0.05 * SR); a = x[-n:].mean(axis=1); b = x[:n].mean(axis=1)
    fa = np.abs(np.fft.rfft(a * np.hanning(n))); fb = np.abs(np.fft.rfft(b * np.hanning(n)))
    spec = float(20 * np.log10((fa.sum() + 1e-9) / (fb.sum() + 1e-9)))
    return dict(wrapStep=round(jump, 4), typicalStep=round(typ, 4), wrapOk=bool(jump <= typ * 1.5), edgeSpectrumDiffDb=round(spec, 1))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wav", required=True); ap.add_argument("--analysis", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--instrumental", action="append", default=[], help="id=PATH.wav (44.1 kHz stereo) used instead of the mix")
    ap.add_argument("--only", default=""); ap.add_argument("--tmp", default="/tmp/_dist.wav")
    a = ap.parse_args()
    os.makedirs(os.path.join(a.out, "lite"), exist_ok=True)
    ana = json.load(open(a.analysis)); inst = dict(s.split("=", 1) for s in a.instrumental)
    rp = os.path.join(a.out, "report.json"); report = json.load(open(rp)) if os.path.exists(rp) else {}  # runs for single tracks accumulate
    for stem, A in sorted(ana.items()):
        key = next(k for k in DISTRICTS if stem.startswith(k)); did, district, arena, title = DISTRICTS[key]
        if a.only and did not in a.only.split(","): continue
        src = os.path.join(a.wav, stem + ".wav"); x, sr = sf.read(src); assert sr == SR
        used_inst = did in inst
        if used_inst:
            ix, _ = sf.read(inst[did]); n = min(len(x), len(ix)); x = ix[:n]
        x = x * db(-3.0)  # the sources are hard-limited above 0 dBFS (clipped samples): back off before any processing
        mono = x.mean(axis=1)
        bpm, ph, drift = refine_grid(mono, A["bpm"]); beat = 60 / bpm; bar = 4 * beat
        # downbeat: the beat of each 4 with the most low-band onset energy
        S = np.abs(librosa.stft(mono, n_fft=2048, hop_length=512)); fr = librosa.fft_frequencies(sr=SR, n_fft=2048); low = S[(fr > 35) & (fr < 150)].sum(axis=0)
        on = np.maximum(np.diff(low, prepend=low[0]), 0); nb = int((len(mono) / SR - ph) / beat)
        # the comb can lock onto the off-beat (hats on the "and"): keep whichever of the two candidate phases has the kick
        def kick_e(p0): return sum(on[min(int((p0 + k * beat) * SR / 512), len(on) - 1)] for k in range(nb - 2))
        if kick_e((ph + beat / 2) % beat) > kick_e(ph): ph = (ph + beat / 2) % beat
        be = np.zeros(4)
        for k in range(nb):
            f = int((ph + k * beat) * SR / 512)
            if f < len(on): be[k % 4] += on[f]
        dphase = int(np.argmax(be)); first = ph + dphase * beat
        while first - bar >= 0.02: first -= bar
        n_total = int((len(mono) / SR - first) / bar); tail_end = A["seconds"] - A["tailSilence"]
        tail_bars = max(2, int(np.ceil((A["seconds"] - tail_end + 4.0) / bar)))
        best, bars = pick_loop(x, first, bar, n_total, tail_bars, A["sectionBoundariesSec"])
        score, b0, b1, sim = best
        a0 = int(round(bars[b0] * SR)); a1 = int(round(bars[b1] * SR))
        body = x[a0:a1].copy(); pre = x[a0 - X:a0]
        body = loop_close(body, pre, X)
        body = hp(body, 30, 2)
        master = finish(body, -14.0, a.tmp)
        seam = wrap_metrics(master)
        L = len(master)
        # per-bar level map of the loop (variation) and loudest 16-bar window for Sudden Death
        nloop = (b1 - b0); barn = int(round(bar * SR))
        lv = [float(20 * np.log10(np.sqrt((master[int(k * bar * SR):int((k + 1) * bar * SR)] ** 2).mean()) + 1e-9)) for k in range(nloop)]
        win = 16 if nloop >= 24 else 8
        cand = [(np.mean(lv[s:s + win]), s) for s in range(0, nloop - win + 1, 4)]
        sd_s = max(cand)[1]
        # variant B: start half a loop later, on a 4-bar boundary
        startB = int(round((nloop / 2) / 4)) * 4
        starts = {"a": 0.0, "b": startB * bar, "c": int(round((nloop * 0.25) / 4)) * 4 * bar, "d": int(round((nloop * 0.75) / 4)) * 4 * bar}  # four start points of one seamless loop
        # ------------------------------------------------ Sudden Death loop: loudest window, same tempo, extra tension layers
        s0 = a0 + int(round(sd_s * bar * SR)); s1 = s0 + int(round(win * bar * SR))
        wsrc = x[s0:s1].copy()
        # closure: blend the end of the window into the audio before its start
        sdl = loop_close(wsrc, x[s0 - X:s0], X)
        sdl = hp(sdl, 30, 2); sdl = shelf(sdl, 4500, 2.0); sdl = peq(sdl, 3200, -2.0, 0.9)
        tonic = TONIC[A["key"][0][0].split()[0]]; f0 = 440 * 2 ** ((tonic - 9) / 12); 
        while f0 > 110: f0 /= 2
        while f0 < 55: f0 *= 2
        lay = np.zeros((len(sdl), 2)); nbeats = int(len(sdl) / SR / beat); tom = sub_tom(f0 * 1.5, f0 * 0.8, 0.32, 0.12); h1 = noise_hit(); h2 = noise_hit(seed=2, decay=0.012)
        for k in range(nbeats):
            t = k * beat; place(lay, tom, t, 0.30 if k % 4 == 0 else 0.17); place(lay, h2, t + beat / 2, 0.15, 0.3); place(lay, h1, t + beat * 0.25, 0.06, -0.3); place(lay, h1, t + beat * 0.75, 0.06, 0.3)
        for k in range(win):
            t0 = k * bar
            if k % 4 == 3:
                for j in range(8): place(lay, noise_hit(0.09, 1200, 5000, 0.03, 10 + j), t0 + 3 * beat + j * beat / 8, 0.09 + 0.03 * j)
            if k % 8 == 6: place(lay, riser(2 * bar - 0.05), t0, 0.32)
            if k % 8 == 0: place(lay, impact(), t0, 0.22)
        sdl = compress(sdl + lay, -19, 2.8, makeup_db=0.5)
        sdm = finish(sdl, -13.5, a.tmp)
        sd_seam = wrap_metrics(sdm)
        # ------------------------------------------------ write files, size comparison at several bitrates
        base = f"dist_{did}"; sizes = {}; fids = {}
        for kb in (192, 160, 128, 96, 64):
            p = os.path.join(a.tmp + f".{kb}.mp3"); encode(master, p, kb, a.tmp); dec = decode(p)[: len(master)]
            err = master[: len(dec)] - dec; snr = float(10 * np.log10((master[: len(dec)] ** 2).sum() / ((err ** 2).sum() + 1e-12)))
            sp = np.abs(np.fft.rfft(dec.mean(axis=1)[: SR * 20])); fq = np.fft.rfftfreq(len(dec.mean(axis=1)[: SR * 20]), 1 / SR)
            cut = float(fq[np.where(20 * np.log10(sp / sp.max() + 1e-9) > -70)[0][-1]])
            sizes[kb] = dict(bytes=os.path.getsize(p), snrDb=round(snr, 1), bandwidthHz=int(cut))
            if kb == 192: os.replace(p, os.path.join(a.out, base + ".mp3"))
            elif kb == 96: os.replace(p, os.path.join(a.out, "lite", base + ".mp3"))
            else: os.remove(p)
        encode(sdm, os.path.join(a.out, base + "_sd.mp3"), 192, a.tmp); encode(sdm, os.path.join(a.out, "lite", base + "_sd.mp3"), 96, a.tmp)
        mm, tpm = measure(decode(os.path.join(a.out, base + ".mp3")), a.tmp); mph, _ = measure(hp(decode(os.path.join(a.out, base + ".mp3")), 150, 4), a.tmp)
        ms, tps = measure(decode(os.path.join(a.out, base + "_sd.mp3")), a.tmp)
        report[did] = dict(
            district=district, arena=arena, title=title, sourceFile=stem + ".mp3", instrumentalFromStems=used_inst,
            sourceSeconds=A["seconds"], sourceLufs=A["lufs"], sourceTruePeakDb=A["tp"], sourceClippedSamples=A["clippedSamples"],
            bpm=round(bpm, 3), firstBar=round(first, 4), gridDriftMs=round(drift, 1), downbeatConfidence=A["downbeatScore"], key=A["key"][0][0],
            loop=dict(startBar=b0, endBar=b1, bars=b1 - b0, seconds=round(L / SR, 2), samples=L, fractionOfSong=round((L / SR) / A["seconds"], 3), joinSimilarity=round(sim, 2), **seam),
            barLevelsDb=[round(v, 1) for v in lv], variationSpreadDb=round(float(np.percentile(lv, 95) - np.percentile(lv, 5)), 1),
            variantStartsSec={k: round(v, 3) for k, v in starts.items()},
            master=dict(lufs=mm, decodedTruePeakDb=tpm, phoneLufs=mph, bytes=os.path.getsize(os.path.join(a.out, base + ".mp3")), liteBytes=os.path.getsize(os.path.join(a.out, "lite", base + ".mp3"))),
            suddenDeath=dict(startBarInLoop=sd_s, bars=win, seconds=round(len(sdm) / SR, 2), samples=len(sdm), lufs=ms, decodedTruePeakDb=tps, bytes=os.path.getsize(os.path.join(a.out, base + "_sd.mp3")), liteBytes=os.path.getsize(os.path.join(a.out, "lite", base + "_sd.mp3")), tonicHz=round(f0, 1), **sd_seam),
            bitrateComparison=sizes,
        )
        r = report[did]
        print(f"{did:12s} bpm {bpm:7.3f} first {first:6.3f} loop bars {b0}-{b1} ({r['loop']['seconds']:.0f}s of {A['seconds']:.0f}s) join {sim:4.2f} wrapOk {seam['wrapOk']} | {mm:5.1f} LUFS tp {tpm:5.1f} | {r['master']['bytes']//1024} KB / lite {r['master']['liteBytes']//1024} KB | SD {win} bars {ms:5.1f} LUFS {r['suddenDeath']['bytes']//1024} KB")
        sf.write(os.path.join(a.out, base + ".loop.wav"), master.astype(np.float32), SR, subtype="FLOAT") if os.environ.get("KEEP_WAV") else None
        json.dump(report, open(rp, "w"), indent=1)


if __name__ == "__main__":
    main()
