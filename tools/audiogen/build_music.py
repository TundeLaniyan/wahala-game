"""Renders the original WAHALA! Afrobeats pieces to public/audio/music/ (Ogg Vorbis + MP3 fallback).

    pip install numpy scipy pyloudnorm     # ffmpeg with libvorbis + libmp3lame must be on PATH
    python3 tools/audiogen/build_music.py [--only match_loop,menu_loop] [--out public/audio/music]

Deterministic: same library versions give the same audio. Takes a few minutes (pure numpy synthesis).
Writes manifest.json next to the audio (tempo, bars, exact length in samples, loudness and a seam report)
which src/audio/music.ts and tests/audio/music.test.ts both read.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np

import dsp
from songlib import verify_loop

REPO = Path(__file__).resolve().parents[2]


def _render(name: str) -> np.ndarray:
    import compose_extra as ce
    import compose_match as cm

    return {
        "match_loop": lambda: cm.render()[0],
        "menu_loop": ce.render_menu,
        "match_tension": ce.render_tension,
        "sting_win": ce.render_win,
        "sting_lose": ce.render_lose,
        "sting_draw": ce.render_draw,
    }[name]()


TRACKS = {
    "match_loop": {"loop": True, "bpm": 108, "bars": 32, "role": "In-match bed. 4 x 8-bar sections: groove, hook, variation, breakdown+build."},
    "menu_loop": {"loop": True, "bpm": 100, "bars": 16, "role": "Title / menu / results bed. Softer, sparser."},
    "match_tension": {"loop": True, "bpm": 108, "bars": 8, "role": "Percussion-only stem layered over match_loop in the final seconds (8 bars divide the 32-bar loop)."},
    "sting_win": {"loop": False, "bpm": 108, "bars": 0, "role": "Victory sting."},
    "sting_lose": {"loop": False, "bpm": 96, "bars": 0, "role": "Defeat sting (wry, not tragic)."},
    "sting_draw": {"loop": False, "bpm": 108, "bars": 0, "role": "Draw sting (unresolved suspension)."},
}


def encode(wav: Path, out_dir: Path, name: str) -> dict:
    files = {}
    for ext, args in (("ogg", ["-c:a", "libvorbis", "-q:a", "4"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "4"])):
        dst = out_dir / f"{name}.{ext}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), *args, str(dst)], check=True)
        files[ext] = {"file": dst.name, "bytes": dst.stat().st_size}
    return files


def decoded_samples(path: Path) -> int:
    out = subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-i", str(path), "-f", "f32le", "-ac", "2", "-ar", str(dsp.SR), "-"],
        check=True, capture_output=True,
    ).stdout
    return len(out) // 8


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default=str(REPO / "public/audio/music"))
    a = ap.parse_args()
    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    names = [n for n in TRACKS if not a.only or n in a.only.split(",")]
    with ProcessPoolExecutor(max_workers=4) as ex:
        audio = dict(zip(names, ex.map(_render, names)))

    mpath = out_dir / "manifest.json"
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {"sampleRate": dsp.SR, "tracks": {}}
    for name, x in audio.items():
        meta = dict(TRACKS[name])
        assert np.isfinite(x).all(), name
        with tempfile.TemporaryDirectory() as td:
            wav = Path(td) / f"{name}.wav"
            dsp.write_wav(str(wav), x)
            meta["files"] = encode(wav, out_dir, name)
        meta["samples"] = int(len(x))
        meta["seconds"] = round(len(x) / dsp.SR, 3)
        meta["lufs"] = round(dsp.measure_lufs(x), 2)
        meta["peak_db"] = round(float(20 * np.log10(np.max(np.abs(x)))), 2)
        if meta["loop"]:
            meta["seam"] = {k: round(v, 4) for k, v in verify_loop(x).items()}
            # decoded length must equal the rendered length for the loop to be gapless in a browser
            meta["decoded_samples"] = {ext: decoded_samples(out_dir / f["file"]) for ext, f in meta["files"].items()}
        manifest["tracks"][name] = meta
        print(name, meta["seconds"], "s", meta["lufs"], "LUFS", {k: v["bytes"] for k, v in meta["files"].items()}, meta.get("decoded_samples"))
    mpath.write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
