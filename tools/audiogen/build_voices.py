"""Renders the crowd's spoken Nigerian Pidgin to public/audio/voices/ (sprite sheets + voices.json).

THESE ARE SYNTHETIC PLACEHOLDERS, NOT RECORDINGS. Speech comes from Kokoro-82M (Apache-2.0, free, runs
offline on CPU) reading the Pidgin spelling of pidgin_script.py. The voices are English-trained, so the
accent is NOT authentic Nigerian and there is no Pidgin tone/intonation model.

Two ways of giving Kokoro the text (--method):
  text (default)  the Pidgin spelling goes through Kokoro's English grapheme-to-phoneme model. English accent,
                  natural prosody. In an A/B run (66 reaction lines, Whisper-small.en round trip scored against
                  the intended spelling) this gave a mean similarity of 0.88.
  ipa             hand-written West-African-style pronunciations (the lexicon in pidgin_script.py: 7 pure
                  vowels, no reduction) fed as phonemes. Closer to Nigerian vowel quality in intent, but the
                  English-trained voices render it less cleanly: mean similarity 0.72 in the same A/B run.
Intelligibility to English-literate listeners was prioritised, so `text` ships. Neither method has been
judged by a Nigerian listener.
voices.json says so (`synthetic: true`) and docs/AUDIO.md explains how to replace clips with real
recordings. A Whisper-small.en round trip is stored per clip purely as a rough "is it speech-like and
readable" signal; it cannot judge Pidgin pronunciation and is not a quality claim.

    pip install numpy scipy kokoro-onnx sherpa-onnx
    # models (not committed; ~350 MB) from github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0):
    #   kokoro-v1.0.onnx  voices-v1.0.bin
    # optional ASR check: sherpa-onnx-whisper-small.en from github.com/k2-fsa/sherpa-onnx/releases (asr-models)
    python3 tools/audiogen/build_voices.py --models <dir with kokoro files> [--asr <whisper dir>] [--work <dir>]

--work receives the individual clip WAVs (also consumed by build_ambience.py to make the market babble).
"""
from __future__ import annotations

import argparse
import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal

import pidgin_script as P

REPO = Path(__file__).resolve().parents[2]
SR = 24000
GAP = 0.3  # seconds of silence between clips inside a sprite sheet

MALE = ["am_adam", "am_michael", "am_onyx", "am_eric", "am_liam", "bm_daniel", "bm_lewis", "bm_george", "hm_omega", "hm_psi"]
FEMALE = ["af_bella", "af_nicole", "af_sarah", "af_sky", "bf_emma", "bf_isabella", "bf_alice", "hf_alpha", "hf_beta", "af_jessica"]

# lines said by market women / hawkers are voiced female; conductors and drivers male
FEMALE_CALLS = {"call_water", "call_gala", "call_bread"}


_ROT = {"m": 0, "f": 0}
# fixed rotation orders (a deterministic shuffle) so every voice is used about equally and neighbours differ
_ORDER = {"m": [3, 7, 1, 9, 5, 0, 8, 2, 6, 4], "f": [6, 2, 9, 4, 0, 7, 3, 8, 1, 5]}


def next_voice(female: bool) -> str:
    key = "f" if female else "m"
    pool = FEMALE if female else MALE
    v = pool[_ORDER[key][_ROT[key] % len(pool)]]
    _ROT[key] += 1
    return v


def plan() -> list[dict]:
    """Every clip to render: id, text, pack, category, voice, speed. Deterministic."""
    clips: list[dict] = []
    n = 0
    for cat, lines in P.REACTIONS.items():
        for i, text in enumerate(lines):
            female = (n % 2 == 1)
            voice = next_voice(female)
            clips.append({"id": f"r_{cat}_{i}", "pack": "react", "category": cat, "text": text, "voice": voice,
                          "speed": 1.08 + 0.04 * ((n * 5) % 4)})
            n += 1
    for si, scene in enumerate(P.AMBIENT):
        for i, text in enumerate(scene["lines"]):
            if scene["kind"] == "call":
                female = scene["id"] in FEMALE_CALLS
            else:
                female = (i + si) % 2 == 1
            voice = next_voice(female)
            clips.append({"id": f"a_{scene['id']}_{i}", "pack": "ambient", "category": scene["id"], "text": text, "voice": voice,
                          "speed": (1.2 if scene["kind"] == "call" else 1.05 + 0.03 * ((n * 3) % 4))})
            n += 1
    return clips


def clean(x: np.ndarray) -> np.ndarray:
    """Trim silence, high-pass rumble, level to a consistent loudness."""
    x = signal.sosfilt(signal.butter(2, 90, "highpass", fs=SR, output="sos"), x)
    a = np.abs(x)
    idx = np.where(a > 0.012 * a.max())[0]
    if len(idx):
        pad = int(0.02 * SR)
        x = x[max(0, idx[0] - pad) : idx[-1] + pad]
    f = int(0.012 * SR)
    x[:f] *= np.linspace(0, 1, f)
    x[-f:] *= np.linspace(1, 0, f)
    rms = np.sqrt(np.mean(x**2)) + 1e-9
    x = x * (10 ** (-21 / 20) / rms)  # -21 dBFS RMS
    peak = np.abs(x).max()
    if peak > 0.89:
        x = np.tanh(x / peak * 1.2) * 0.89
    return x.astype(np.float32)


def write_wav(path: Path, x: np.ndarray) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def encode(wav: Path, out: Path) -> dict:
    files = {}
    for ext, args in (("ogg", ["-c:a", "libvorbis", "-q:a", "3"]), ("mp3", ["-c:a", "libmp3lame", "-q:a", "5"])):
        dst = out / f"{wav.stem}.{ext}"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav), "-ac", "1", *args, str(dst)], check=True)
        files[ext] = dst.name
    return files


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", required=True)
    ap.add_argument("--asr", default="")
    ap.add_argument("--work", default="")
    ap.add_argument("--out", default=str(REPO / "public/audio/voices"))
    ap.add_argument("--method", choices=("text", "ipa"), default="text")
    a = ap.parse_args()
    from kokoro_onnx import Kokoro

    k = Kokoro(str(Path(a.models) / "kokoro-v1.0.onnx"), str(Path(a.models) / "voices-v1.0.bin"))
    asr = None
    if a.asr:
        import sherpa_onnx

        d = Path(a.asr)
        asr = sherpa_onnx.OfflineRecognizer.from_whisper(
            encoder=str(d / "small.en-encoder.int8.onnx"), decoder=str(d / "small.en-decoder.int8.onnx"),
            tokens=str(d / "small.en-tokens.txt"), num_threads=4, language="en", task="transcribe")

    def transcribe(x: np.ndarray) -> str:
        y = signal.resample_poly(x, 2, 3).astype(np.float32)
        st = asr.create_stream()
        st.accept_waveform(16000, y)
        asr.decode_stream(st)
        return st.result.text.strip()

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    work = Path(a.work) if a.work else out / "_work"
    work.mkdir(parents=True, exist_ok=True)

    clips = plan()
    audio: dict[str, np.ndarray] = {}
    for c in clips:
        P.phonemes(c["text"])  # fails on a word missing from the lexicon: a cheap typo check for the script
        if a.method == "ipa":
            ph = P.phonemes(c["text"])
            x, sr = k.create(ph, voice=c["voice"], speed=c["speed"], lang="en-us", is_phonemes=True)
        else:
            ph = None
            x, sr = k.create(c["text"], voice=c["voice"], speed=c["speed"], lang="en-us")
        assert sr == SR
        x = clean(np.asarray(x, dtype=np.float32))
        audio[c["id"]] = x
        write_wav(work / f"{c['id']}.wav", x)
        c["phonemes"] = ph
        c["asr"] = transcribe(x) if asr else None
        print(c["id"], c["voice"], round(len(x) / SR, 2), "|", c["text"], "|", c["asr"])

    manifest = {
        "version": 1,
        "synthetic": True,
        "note": ("SYNTHETIC PLACEHOLDER VOICES: Kokoro-82M (Apache-2.0) reading Pidgin spelling through an English text-to-speech front end. "
                 "English-trained voices, NOT authentic Nigerian accents and NOT recordings of Nigerian speakers. "
                 "Replace with recorded lines; see docs/AUDIO.md."),
        "engine": "kokoro-onnx 1.0 (Kokoro-82M)",
        "method": a.method,
        "sampleRate": SR,
        "packs": {},
        "clips": [],
        "scenes": [],
    }
    for pack in ("react", "ambient"):
        t = 0.0
        pieces = []
        for c in [c for c in clips if c["pack"] == pack]:
            x = audio[c["id"]]
            c["start"] = round(t, 4)
            c["dur"] = round(len(x) / SR, 4)
            pieces += [x, np.zeros(int(GAP * SR), np.float32)]
            t += len(x) / SR + GAP
        sheet = np.concatenate(pieces)
        wav = work / f"{pack}.wav"
        write_wav(wav, sheet)
        files = encode(wav, out)
        manifest["packs"][pack] = {"files": files, "seconds": round(len(sheet) / SR, 2)}
    for c in clips:
        manifest["clips"].append({k2: c[k2] for k2 in ("id", "pack", "category", "text", "voice", "start", "dur", "phonemes", "asr")})
    for scene in P.AMBIENT:
        manifest["scenes"].append({"id": scene["id"], "kind": scene["kind"],
                                   "clips": [f"a_{scene['id']}_{i}" for i in range(len(scene["lines"]))]})
    (out / "voices.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n")
    secs = {p: v["seconds"] for p, v in manifest["packs"].items()}
    print("done", len(clips), "clips", secs)


if __name__ == "__main__":
    main()
