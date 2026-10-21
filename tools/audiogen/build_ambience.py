"""Renders the Lagos street/bus-park/market ambience beds to public/audio/ (slot recordings).

    crowd_loop        market / bus-park chatter ("walla"): dozens of overlapping Pidgin voices, intelligible
                      words destroyed by the overlap, plus faint market clinks            (44 s loop)
    buspark_loop      distant bus park: idling diesels, two-stroke generators, passing danfos / okadas,
                      car and truck horns, door clanks                                      (38 s loop)
    crowd_loop_hype   livelier chatter for the exciting moments: more voices, more excitement, brighter,
                      a few scattered handclaps. NO cheering swell or roar (this is a bus park)  (33 s loop)

The babble is built from the synthetic Pidgin clips of build_voices.py (so it has real speech rhythm and
phonemes); everything else is synthesised from noise and harmonic stacks. Nothing is sampled from a
recording. All beds are circular (wrap-around mixing), so they loop seamlessly.

    python3 tools/audiogen/build_ambience.py --voices <work dir with *.wav clips from build_voices.py>
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np
from scipy import signal

import dsp
from dsp import SR, Mix, rng

REPO = Path(__file__).resolve().parents[2]
VOICE_SR = 24000


def snap(seconds: float) -> float:
    """Loop length rounded to a multiple of 1024 frames. Browsers' Vorbis decoders round the decoded length up
    to a block multiple, which would append a few stray samples to the loop; block-aligned lengths cannot."""
    return round(seconds * SR / 1024) * 1024 / SR


def load_clips(work: Path) -> dict[str, np.ndarray]:
    out = {}
    for p in sorted(work.glob("*.wav")):
        if p.stem in ("react", "ambient"):
            continue
        with wave.open(str(p)) as w:
            x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768
        out[p.stem] = signal.resample_poly(x, SR // 300, VOICE_SR // 300)  # 24k -> 44.1k (147/80)
    return out


def circ(fn, x: np.ndarray, *args) -> np.ndarray:
    """Applies a causal filter circularly (filters three copies, keeps the middle one) so a loop's start carries
    the filter state of its end and the seam has no start-up transient."""
    n = len(x)
    return fn(np.concatenate([x, x, x]), *args)[n : 2 * n]


def resample_ratio(x: np.ndarray, r: float) -> np.ndarray:
    n = int(len(x) / r)
    return np.interp(np.arange(n) * r, np.arange(len(x)), x).astype(np.float32)


# -------------------------------------------------------------------------------------------------- babble
def babble(dur: float, clips: list[np.ndarray], voices: int, seed: int, *, lp=(2600, 4800), pitch=(0.86, 1.16),
           gap_mean=1.2, level=(0.25, 1.0), brightness=0.0) -> np.ndarray:
    r = rng(seed)
    n = int(dur * SR)
    mix = Mix(n)
    for _ in range(voices):
        pan = float(r.uniform(-0.9, 0.9))
        lvl = float(r.uniform(*level)) ** 1.6
        fc = float(r.uniform(*lp))
        f_hp = 150.0
        t = float(r.uniform(0, dur))
        end = t + dur
        while t < end:
            c = clips[int(r.integers(len(clips)))]
            y = resample_ratio(c, float(r.uniform(*pitch)))
            y = signal.sosfilt(signal.butter(2, fc, "lowpass", fs=SR, output="sos"), y)
            y = signal.sosfilt(signal.butter(1, f_hp, "highpass", fs=SR, output="sos"), y)
            if brightness:
                y = dsp.shelf_high(y, 2500, brightness)
            mix.add(y, int(t * SR), pan, lvl * float(r.uniform(0.6, 1.0)))
            t += len(y) / SR + float(r.exponential(gap_mean))
    return mix.buf


def clinks(dur: float, count: int, seed: int) -> np.ndarray:
    r = rng(seed)
    mix = Mix(int(dur * SR))
    for _ in range(count):
        f = float(r.uniform(900, 3200))
        n = int(0.35 * SR)
        t = np.arange(n) / SR
        y = sum(a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau)
                for ratio, a, tau in ((1, 1, 0.07), (2.32, 0.5, 0.04), (3.9, 0.3, 0.025), (5.7, 0.15, 0.012)))
        y = y * float(r.uniform(0.03, 0.09))
        mix.add(y, int(r.uniform(0, dur) * SR), float(r.uniform(-0.9, 0.9)))
    return mix.buf


def claps(dur: float, count: int, seed: int) -> np.ndarray:
    """Sparse, irregular handclaps (no applause swell)."""
    r = rng(seed)
    mix = Mix(int(dur * SR))
    for _ in range(count):
        n = int(0.12 * SR)
        t = np.arange(n) / SR
        y = dsp.bandpass(r.standard_normal(n), 900, 4200, 1) * np.exp(-t / 0.018)
        pan = float(r.uniform(-0.9, 0.9))
        t0 = float(r.uniform(0, dur))
        for k in range(int(r.integers(1, 4))):
            mix.add(y * float(r.uniform(0.2, 0.5)), int((t0 + k * float(r.uniform(0.35, 0.6))) * SR), pan)
    return mix.buf


# -------------------------------------------------------------------------------------------------- bus park
def diesel_idle(dur: float, rate_hz: float, seed: int) -> np.ndarray:
    r = rng(seed)
    n = int(dur * SR)
    pulse = np.zeros(n)
    t = 0.0
    while t < dur:
        pulse[int(t * SR) % n] += float(r.uniform(0.6, 1.0))
        t += (1.0 / rate_hz) * float(r.uniform(0.9, 1.1))
    kn = int(0.04 * SR)
    kt = np.arange(kn) / SR
    knock = np.sin(2 * np.pi * 135 * kt) * np.exp(-kt / 0.012) + 0.4 * np.sin(2 * np.pi * 310 * kt) * np.exp(-kt / 0.006)
    y = np.fft.irfft(np.fft.rfft(pulse) * np.fft.rfft(knock, n), n)  # circular convolution
    y = circ(dsp.lowpass, y, 700, 2) + 0.25 * circ(dsp.bandpass, r.standard_normal(n), 60, 260, 1)
    wob = 1 + 0.12 * np.sin(2 * np.pi * np.arange(n) / SR / dur * int(r.integers(2, 6)))
    return y * wob


def generator_putt(dur: float, rate_hz: float, seed: int) -> np.ndarray:
    r = rng(seed)
    n = int(dur * SR)
    t = np.arange(n) / SR
    pulses = np.zeros(n)
    k = 0.0
    while k < dur:
        pulses[int(k * SR) % n] += 1.0
        k += 1.0 / rate_hz * (1 + 0.04 * np.sin(2 * np.pi * 0.7 * k))
    kn = int(0.03 * SR)
    kt = np.arange(kn) / SR
    puff = (r.standard_normal(kn) * 0.3 + np.sin(2 * np.pi * 180 * kt)) * np.exp(-kt / 0.01)
    y = np.fft.irfft(np.fft.rfft(pulses) * np.fft.rfft(puff, n), n)
    y = circ(dsp.bandpass, y, 90, 1200, 2)
    hunt = 1 + 0.25 * np.sin(2 * np.pi * (1 / dur) * 5 * t + float(r.uniform(0, 6)))
    return y * hunt


def horn_event(kind: str, r: np.random.Generator) -> np.ndarray:
    """One car/truck horn pattern (mono)."""
    if kind == "truck":
        base, notes = float(r.uniform(300, 380)), [(0.0, 0.9)]
    elif kind == "danfo":
        base, notes = float(r.uniform(420, 500)), [(0.0, 0.14), (0.22, 0.14), (0.44, 0.5)]
    else:
        base, notes = float(r.uniform(400, 560)), [(0.0, float(r.uniform(0.2, 0.45)))]
    total = int((max(s + d for s, d in notes) + 0.3) * SR)
    out = np.zeros(total)
    for start, d in notes:
        n = int((d + 0.05) * SR)
        t = np.arange(n) / SR
        y = np.zeros(n)
        for f in (base, base * 1.26):  # cheap two-tone horn
            for h in (1, 3, 5, 7):
                y += np.sin(2 * np.pi * f * h * t + h) / h
        env = np.minimum(1, t / 0.012) * np.clip((d + 0.04 - t) / 0.04, 0, 1)
        i = int(start * SR)
        out[i : i + n] += (y * env)[: total - i]
    return dsp.lowpass(out, 2400 if kind != "truck" else 1400, 2)


def passby(dur: float, f0: float, seed: int) -> np.ndarray:
    """A vehicle passing: Doppler-shifted engine drone + road noise under a bell-shaped envelope."""
    r = rng(seed)
    n = int(dur * SR)
    t = np.linspace(-1, 1, n)
    env = np.exp(-(t / 0.45) ** 2)
    dop = 1 + 0.08 * -np.tanh(t * 3)
    ph = 2 * np.pi * np.cumsum(f0 * dop) / SR
    drone = sum(np.sin(h * ph + h) / h for h in range(1, 9))
    road = dsp.bandpass(r.standard_normal(n), 400, 2400, 1) * 0.5
    return dsp.lowpass(drone * 0.5 + road, 1600, 2) * env


def build_buspark(seed: int = 3, dur: float = snap(38.0)) -> np.ndarray:
    r = rng(seed)
    n = int(dur * SR)
    mix = Mix(n)
    # idling engines and generators: steady, slightly detuned, spread across the stereo field
    for i, (rate_hz, pan, g) in enumerate(((14.0, -0.7, 0.55), (23.0, 0.5, 0.5), (11.0, 0.1, 0.42), (17.5, -0.2, 0.35))):
        mix.add(diesel_idle(dur, rate_hz, seed + i), 0, pan, g)
    for i, (rate_hz, pan, g) in enumerate(((37.0, 0.8, 0.5), (43.5, -0.85, 0.42))):
        mix.add(generator_putt(dur, rate_hz, seed + 10 + i), 0, pan, g)
    # wide road wash: distant traffic
    wash = circ(dsp.lowpass, r.standard_normal(n), 900, 2) * (1 + 0.5 * np.sin(2 * np.pi * np.arange(n) / SR / dur * 3))
    mix.add(wash * 0.22, 0, 0.0)
    # passing vehicles (danfos, okadas, trucks)
    for i in range(7):
        d = float(r.uniform(4.5, 8.5))
        f0 = float(r.choice([48, 55, 62, 85, 120, 180]))  # trucks/danfos low, okadas high
        y = passby(d, f0, seed + 30 + i)
        t0 = float(r.uniform(0, dur))
        a, b = (-0.9, 0.9) if r.random() < 0.5 else (0.9, -0.9)
        # pan sweep by splitting into short chunks
        k = 8
        seg = len(y) // k
        for j in range(k):
            mix.add(y[j * seg : (j + 1) * seg], int(t0 * SR) + j * seg, a + (b - a) * (j + 0.5) / k, 0.55)
    # horns: sparse and distant
    kinds = ["car"] * 9 + ["danfo"] * 4 + ["truck"] * 2
    for kind in kinds:
        y = horn_event(kind, r)
        mix.add(y, int(r.uniform(0, dur) * SR), float(r.uniform(-0.9, 0.9)), float(r.uniform(0.05, 0.16)))
    # a few bus-door clanks and bangs
    for _ in range(6):
        nn = int(0.4 * SR)
        t = np.arange(nn) / SR
        f = float(r.uniform(180, 520))
        y = sum(a_ * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / tau) for ratio, a_, tau in ((1, 1, 0.08), (1.9, 0.6, 0.05), (3.1, 0.4, 0.03)))
        y += dsp.bandpass(r.standard_normal(nn), 600, 3000, 1) * np.exp(-t / 0.01) * 0.6
        mix.add(y * float(r.uniform(0.05, 0.12)), int(r.uniform(0, dur) * SR), float(r.uniform(-0.9, 0.9)))
    ir = dsp.make_reverb_ir(1.6, 1.0, 0.02, 3500, seed=seed)
    wet = dsp.circ_convolve(mix.buf, ir)
    return mix.buf * 0.7 + wet * 0.5


# -------------------------------------------------------------------------------------------------- crowd
def build_crowd(clips: dict[str, np.ndarray], seed: int = 5, dur: float = snap(44.0)) -> np.ndarray:
    pool = [v for k, v in clips.items() if k.startswith("a_")] or list(clips.values())
    b = babble(dur, pool, voices=34, seed=seed)
    b = b + clinks(dur, 18, seed + 1)
    n = len(b)
    r = rng(seed + 2)
    room = circ(dsp.lowpass, r.standard_normal(n), 2200, 2)[:, None] * 0.02 * np.ones((1, 2))
    ir = dsp.make_reverb_ir(1.4, 0.9, 0.015, 3800, seed=seed)
    return b + room + dsp.circ_convolve(b, ir) * 0.35


def build_hype(clips: dict[str, np.ndarray], seed: int = 9, dur: float = snap(33.0)) -> np.ndarray:
    pool = [v for k, v in clips.items() if k.startswith("r_")] or list(clips.values())
    b = babble(dur, pool, voices=26, seed=seed, lp=(3500, 6500), pitch=(0.95, 1.25), gap_mean=0.7, level=(0.35, 1.0), brightness=3.0)
    b = b + claps(dur, 9, seed + 1) * 1.2
    ir = dsp.make_reverb_ir(1.2, 0.8, 0.012, 4500, seed=seed)
    return b + dsp.circ_convolve(b, ir) * 0.3


# -------------------------------------------------------------------------------------------------- output
def finish(x: np.ndarray, rms_db: float) -> np.ndarray:
    x = circ(dsp.highpass, x, 40, 2)
    rms = np.sqrt(np.mean(x**2)) + 1e-9
    x = x * (dsp.db(rms_db) / rms)
    peak = np.max(np.abs(x))
    if peak > 0.9:
        x = np.tanh(x / peak * 1.1) * 0.9 / np.tanh(1.1)
    return x


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--voices", required=True, help="directory of clip WAVs written by build_voices.py --work")
    ap.add_argument("--out", default=str(REPO / "public/audio"))
    a = ap.parse_args()
    out = Path(a.out)
    clips = load_clips(Path(a.voices))
    beds = {
        "crowd_loop": (build_crowd(clips), -18.0),
        "buspark_loop": (build_buspark(), -24.0),
        "crowd_loop_hype": (build_hype(clips), -17.0),
    }
    report = {}
    for name, (x, rms_db) in beds.items():
        x = finish(x, rms_db)
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / f"{name}.wav"
            dsp.write_wav(str(wav), x)
            for ext, args in (("ogg", ["-c:a", "libvorbis", "-q:a", "3"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "4"])):
                subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *args, str(out / f"{name}.{ext}")], check=True)
        mono = x.mean(axis=1)
        report[name] = {
            "seconds": round(len(x) / SR, 2),
            "samples": int(len(x)),
            "rms_db": round(float(20 * np.log10(np.sqrt(np.mean(mono**2)))), 2),
            "peak_db": round(float(20 * np.log10(np.max(np.abs(x)))), 2),
            "seam_jump_ratio": round(float(abs(mono[0] - mono[-1]) / (np.mean(np.abs(np.diff(mono[:2000]))) + 1e-9)), 3),
            "ogg_bytes": (out / f"{name}.ogg").stat().st_size,
        }
        print(name, report[name])
    slots_path = out / "slots.json"
    slots = json.loads(slots_path.read_text()) if slots_path.exists() else {"slots": {}}
    for name in beds:
        slots["slots"][name] = {
            "license": "Original generated audio (tools/audiogen/build_ambience.py): no third-party recordings; babble derived from the project's own synthetic Kokoro-82M (Apache-2.0) Pidgin clips",
            "source": "tools/audiogen/build_ambience.py",
            "gain": 1,
        }
    slots_path.write_text(json.dumps(slots, indent=2) + "\n")
    (out / "ambience_report.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
