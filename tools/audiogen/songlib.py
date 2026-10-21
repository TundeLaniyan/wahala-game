"""Tiny step-sequencer + mixing helpers on top of dsp.py / instruments.py.

A `Song` owns one wrap-around `Mix` per instrument group. Notes placed near the end of the loop
spill over into bar 1, and the reverb/delay sends are circular, so the rendered loop is seamless by
construction (`verify_loop` checks it anyway).
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

import dsp
from dsp import SR, Mix, db, rng

# MIDI helpers --------------------------------------------------------------------------------
NOTE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def n(name: str) -> int:
    """'A4' -> 69, 'F#3' -> 54, 'Bb2' -> 46."""
    base = NOTE[name[0]]
    i = 1
    if name[i] in "#b":
        base += 1 if name[i] == "#" else -1
        i += 1
    return base + 12 * (int(name[i:]) + 1)


@dataclass
class Chord:
    root: int  # bass root (low octave MIDI)
    third: int  # interval 3 or 4
    tones: list[int]  # voicing for guitar / keys, low -> high (MIDI)
    pad: list[int] = field(default_factory=list)  # pad voicing


class Song:
    def __init__(self, bpm: float, bars: int, seed: int = 1):
        self.bpm = bpm
        self.bars = bars
        self.step_f = SR * 60.0 / bpm / 4.0
        self.n = int(round(bars * 16 * self.step_f))
        self.groups: dict[str, Mix] = {}
        self.r = rng(seed)
        self.kicks: list[int] = []

    # time ---------------------------------------------------------------------------------
    def at(self, bar: int, step: float, late_ms: float = 0.0) -> int:
        return int(round((bar * 16 + step) * self.step_f + late_ms * SR / 1000.0)) % self.n

    def group(self, name: str) -> Mix:
        if name not in self.groups:
            self.groups[name] = Mix(self.n)
        return self.groups[name]

    def put(self, group: str, x: np.ndarray, bar: int, step: float, pan: float = 0.0, gain: float = 1.0, human_ms: float = 0.0, late_ms: float = 0.0) -> None:
        jitter = float(self.r.normal(0, human_ms)) if human_ms else 0.0
        self.group(group).add(x, self.at(bar, step, late_ms + jitter), pan, gain)

    def steps(self, steps: float) -> float:
        """Seconds of `steps` sixteenth notes."""
        return steps * self.step_f / SR

    # section helpers ------------------------------------------------------------------------
    def vel(self, base: float, spread: float = 0.08) -> float:
        return float(np.clip(base + self.r.normal(0, spread), 0.05, 1.0))


def verify_loop(x: np.ndarray, win_ms: float = 6.0) -> dict:
    """Seam diagnostics: sample jump across the wrap versus the typical sample-to-sample step, and
    the RMS level either side. A seamless loop has a seam jump comparable to the local step size."""
    w = int(SR * win_ms / 1000)
    mono = x.mean(axis=1) if x.ndim == 2 else x
    seam = float(abs(mono[0] - mono[-1]))
    typical = float(np.mean(np.abs(np.diff(mono[: 4 * w]))) + np.mean(np.abs(np.diff(mono[-4 * w :])))) / 2
    return {
        "seam_jump": seam,
        "typical_step": typical,
        "jump_ratio": seam / (typical + 1e-9),
        "rms_head_db": float(20 * np.log10(np.sqrt(np.mean(mono[:w * 4] ** 2)) + 1e-9)),
        "rms_tail_db": float(20 * np.log10(np.sqrt(np.mean(mono[-w * 4 :] ** 2)) + 1e-9)),
    }


def master(song: Song, spec: dict[str, dict], reverbs: dict[str, np.ndarray], target_lufs: float = -15.0, bar_gain: list[float] | None = None) -> np.ndarray:
    """Mix the song's groups. `spec[group]` keys: gain, rev (send), dly (send), dly_time, dly_fb, sc (sidechain depth),
    hp, lp (filters), width."""
    total = np.zeros((song.n, 2))
    rev_send = np.zeros((song.n, 2))
    dly_send = np.zeros((song.n, 2))
    sc_curve = dsp.sidechain(song.n, song.kicks, depth=0.5, release=0.16) if song.kicks else np.ones(song.n)
    delay_buses: dict[tuple[float, float], np.ndarray] = {}
    for name, mix in song.groups.items():
        s = spec.get(name, {})
        x = mix.buf.copy()
        if s.get("hp"):
            x = dsp.highpass(x, s["hp"], 2)
        if s.get("lp"):
            x = dsp.lowpass(x, s["lp"], 2)
        if s.get("sc"):
            x = x * (1 - s["sc"] * (1 - sc_curve))[:, None]
        if s.get("width"):
            x = dsp.stereo_widen(x, s["width"])
        x = x * s.get("gain", 1.0)
        total += x
        if s.get("rev"):
            rev_send += x * s["rev"]
        if s.get("dly"):
            key = (s.get("dly_time", 0.4), s.get("dly_fb", 0.4))
            delay_buses[key] = delay_buses.get(key, 0) + x * s["dly"]
    for (t, fb), bus in delay_buses.items():
        d = dsp.ping_delay(bus, t, fb)
        total += d
        rev_send += d * 0.25
    ir = reverbs["plate"]
    total += dsp.circ_convolve(rev_send, ir) * 0.9
    total = dsp.highpass(total, 28, 2)
    if bar_gain:
        # slow per-bar level automation (section contrast), smoothed circularly so bar lines do not click
        env = np.repeat(np.array(bar_gain, dtype=float), int(round(16 * song.step_f)))
        env = np.concatenate([env, np.full(song.n - len(env), env[-1])])[: song.n]
        w = int(0.35 * SR)
        pad3 = np.concatenate([env, env, env])
        pad3 = np.convolve(pad3, np.ones(w) / w, mode="same")
        total = total * pad3[song.n : 2 * song.n][:, None]
    total = dsp.shelf_high(total, 7000, 2.5)  # a little air: the synthesised percussion is otherwise dark
    total = dsp.compressor(total, thresh_db=-7, ratio=1.8, attack=0.01, release=0.2, makeup_db=1.0)
    return dsp.to_lufs(total, target_lufs, -1.0)
