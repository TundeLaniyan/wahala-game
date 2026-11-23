#!/usr/bin/env python3
"""Render every WAHALA! audio draft deterministically and encode for the web.

usage:  python3 -I build.py [--out ../drafts] [--masters ../build/masters]

Outputs (per asset):  <out>/{music,sfx}/<id>.ogg  (Opus)  and  <id>.m4a (AAC-LC)
plus <out>/manifest.generated.json with durations, sample counts, sizes and loudness.
Lossless 48 kHz float WAV masters go to --masters (gitignored, regenerate on demand).
"""
import argparse, json, os, re, subprocess, sys
import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme, sfx
from dsp import SR, peak_db

# ---------------------------------------------------------------- targets
LUFS = {"menu": -16.0, "sting": -14.0, "victory": -15.0, "defeat": -17.0, "trailer": -14.0, "gameplay_full": -21.0}
# SFX hierarchy: loudest 100 ms RMS (dBFS) per category, plus a peak ceiling. Danger cues and
# explosions sit on top; UI/pickups sit under combat; ambience is a bed (mean RMS for loops).
SFX_LEVEL = {  # category: (target dBFS RMS100ms, peak ceiling dBFS)
    "danger": (-14.0, -3.0), "expl": (-11.5, -2.0), "combat": (-15.0, -4.0), "defense": (-17.0, -5.0),
    "gen": (-16.0, -4.0), "pickup": (-18.0, -6.0), "ui": (-19.0, -7.0), "amb": (-34.0, -18.0),
    "amb_event": (-27.0, -12.0),
}


def rms100(x, mean=False):
    n = int(0.1 * SR)
    if mean or len(x) <= n:
        return 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-9)
    c = np.cumsum(np.concatenate([[0.0], x ** 2]))
    w = (c[n:] - c[:-n]) / n
    return 20 * np.log10(np.sqrt(w.max()) + 1e-9)


def lufs(path_wav):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path_wav, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    m = re.search(r"Integrated loudness:\s+I:\s+(-?\d+\.?\d*) LUFS", r.stderr)
    tp = re.search(r"True peak:\s+Peak:\s+(-?\d+\.?\d*) dBFS", r.stderr)
    return (float(m.group(1)) if m else None, float(tp.group(1)) if tp else None)


def write_wav(path, buf):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    wavfile.write(path, SR, buf.T.astype(np.float32) if buf.ndim == 2 else buf.astype(np.float32))


def limiter(buf, ceiling_db=-1.0):
    """Soft-knee peak limiter: tanh above 0.7 of ceiling, then hard guard."""
    c = 10 ** (ceiling_db / 20)
    x = buf / c
    k = 0.7
    y = np.where(np.abs(x) <= k, x, np.sign(x) * (k + (1 - k) * np.tanh((np.abs(x) - k) / (1 - k))))
    return y * c


def normalise_to_lufs(buf, target, tmp):
    write_wav(tmp, buf)
    cur, _ = lufs(tmp)
    g = 10 ** ((target - cur) / 20)
    return limiter(buf * g, -1.5)


def trim_tail(buf, floor_db=-60.0, min_keep=0.2):
    """Trim digital silence at the end (non-loop assets) with a short fade."""
    env = np.abs(buf).max(axis=0) if buf.ndim == 2 else np.abs(buf)
    idx = np.where(env > 10 ** (floor_db / 20))[0]
    end = min(len(env), (idx[-1] + int(0.05 * SR)) if len(idx) else int(min_keep * SR))
    out = buf[..., :end].copy()
    f = min(int(0.04 * SR), out.shape[-1])
    out[..., -f:] *= np.linspace(1, 0, f)
    return out


def encode(wav, out_base, kind, channels, lean=False):
    """kind: 'music' | 'sfx'. Returns {fmt: bytes}"""
    sizes = {}
    music = kind == "music"
    br_opus = (("56k" if channels == 2 else "40k") if music else "40k")
    br_aac = (("72k" if channels == 2 else "48k") if music else "56k")
    if lean:  # beat-synced gameplay stems: three loaded together, so keep each lean
        br_opus, br_aac = "40k", "64k"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "libopus", "-b:a", br_opus,
                    "-vbr", "on", "-application", "audio", "-ar", "48000", out_base + ".ogg"], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-c:a", "aac", "-b:a", br_aac,
                    "-ar", "48000", "-movflags", "+faststart", out_base + ".m4a"], check=True)
    for ext in ("ogg", "m4a"):
        sizes[ext] = os.path.getsize(f"{out_base}.{ext}")
    return sizes


def main():
    ap = argparse.ArgumentParser()
    here = os.path.dirname(os.path.abspath(__file__))
    ap.add_argument("--out", default=os.path.join(here, "..", "drafts"))
    ap.add_argument("--masters", default=os.path.join(here, "..", "build", "masters"))
    ap.add_argument("--only", default="")
    a = ap.parse_args()
    out, mas = os.path.abspath(a.out), os.path.abspath(a.masters)
    tmp = os.path.join(mas, "_tmp.wav")
    os.makedirs(mas, exist_ok=True)
    manifest = {"sampleRate": SR, "bpm": theme.BPM, "barSeconds": theme.BAR, "music": {}, "sfx": {}}
    want = set(filter(None, a.only.split(",")))

    def do(name): return not want or name in want

    def emit(kind, name, buf, meta):
        sub = "music" if kind == "music" else "sfx"
        wav = os.path.join(mas, f"{name}.wav")
        write_wav(wav, buf)
        i, tp = lufs(wav)
        if tp is not None and tp > -1.0:  # inter-sample peak guard: codecs can overshoot
            buf = buf * 10 ** ((-1.2 - tp) / 20)
            write_wav(wav, buf)
            i, tp = lufs(wav)
        mono = buf.mean(axis=0) if buf.ndim == 2 else buf
        base = os.path.join(out, sub, name)
        os.makedirs(os.path.dirname(base), exist_ok=True)
        ch = 2 if buf.ndim == 2 else 1
        sizes = encode(wav, base, kind, ch, lean=bool(meta.get("stem")))
        samples = buf.shape[-1]
        entry = dict(meta, samples=int(samples), seconds=round(samples / SR, 4), channels=ch,
                     lufs=i if kind == "music" else None, rms100Db=round(float(rms100(mono, mean=bool(meta.get("loop")))), 1), peakDb=round(float(peak_db(buf)), 1), truePeakDb=tp, bytes=sizes)
        manifest[sub][name] = entry
        print(f"  {name:20s} {samples/SR:7.2f}s  {(i if kind == "music" else rms100(mono, mean=bool(meta.get("loop")))):6.1f} {"LUFS" if kind == "music" else "rms "}  tp {tp}  ogg {sizes['ogg']/1024:6.1f} KB  m4a {sizes['m4a']/1024:6.1f} KB")

    print("== MUSIC ==")
    if do("menu"):
        tr = theme.render_menu()
        buf = normalise_to_lufs(tr.buf, LUFS["menu"], tmp)
        emit("music", "menu_loop", buf, dict(role="main menu", loop=True, loopStart=0, loopEnd=int(tr.n), bars=16, desc="Main Theme, 16-bar loopable instrumental"))
    if do("gameplay"):
        st = theme.gameplay_stems()
        full = sum(s.buf for s in st.values())
        write_wav(tmp, full)
        cur, _ = lufs(tmp)
        g = 10 ** ((LUFS["gameplay_full"] - cur) / 20)
        # one shared gain => the stems keep their relative balance and sum cleanly
        for name, s in st.items():
            emit("music", f"rumble_{name}", limiter(s.buf * g, -1.5), dict(role=f"City Rumble stem: {name}", loop=True, loopStart=0, loopEnd=int(s.n), bars=16, stem=True))
        mix = sum(limiter(s.buf * g, -1.5) for s in st.values())
        write_wav(tmp, sum(limiter(st[k].buf * g, -1.5) for k in ("base",)))
        manifest["music"]["_gameplay_levels"] = {"base_only_lufs": lufs(tmp)[0]}
        write_wav(tmp, sum(limiter(st[k].buf * g, -1.5) for k in ("base", "perc")))
        manifest["music"]["_gameplay_levels"]["base_perc_lufs"] = lufs(tmp)[0]
        write_wav(tmp, mix)
        manifest["music"]["_gameplay_levels"]["all_three_lufs"] = lufs(tmp)[0]
    for key, fn, role in (("sting", theme.render_sting, "WAHALA! logo sting"), ("victory", theme.render_victory, "victory celebration"),
                          ("defeat", theme.render_defeat, "defeat sting"), ("trailer", theme.render_trailer, "optional trailer treatment")):
        if do(key):
            tr = fn()
            buf = trim_tail(tr.buf)
            buf = normalise_to_lufs(buf, LUFS[key], tmp)
            emit("music", key, buf, dict(role=role, loop=False))

    print("== SFX ==")
    for name, (fn, cat, prio, loop, voices, note) in sfx.SFX.items():
        if not do(name) and not do("sfx"):
            continue
        x = fn().astype(float)
        x = x - x.mean()
        if not loop:
            from dsp import hp as _hp
            x = _hp(x, 25, 1)  # DC / sub-rumble blocker for one-shots
        if not loop:
            x = trim_tail(x)
            f = min(int(0.002 * SR), len(x)); x[:f] *= np.linspace(0, 1, f)
        tgt, ceil = SFX_LEVEL[cat]
        x = limiter(x * 10 ** ((tgt - rms100(x, mean=loop)) / 20), ceil)
        emit("sfx", name, x, dict(category=cat, priority=prio, loop=loop, maxVoices=voices, note=note,
                                 **({"loopStart": 0, "loopEnd": len(x)} if loop else {})))

    manifest["music"] = dict(sorted(manifest["music"].items()))
    with open(os.path.join(out, "manifest.generated.json"), "w") as fh:
        json.dump(manifest, fh, indent=1)
    if os.path.exists(tmp):
        os.remove(tmp)
    tot = {e: 0 for e in ("ogg", "m4a")}
    for sec in ("music", "sfx"):
        for k, v in manifest[sec].items():
            if k.startswith("_"):
                continue
            for e in tot:
                tot[e] += v["bytes"][e]
    print(f"TOTAL  ogg {tot['ogg']/1024:.0f} KB   m4a {tot['m4a']/1024:.0f} KB")


if __name__ == "__main__":
    main()
