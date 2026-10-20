#!/usr/bin/env python3
"""Plot waveform + spectrogram PNGs for WAV files produced by render.ts.

    pip install numpy scipy matplotlib
    python3 tools/audio/spectrogram.py <wavDir> <outDir> [id1 id2 ...]

One PNG per sound: waveform on top, log-frequency spectrogram below. Used for eyeballing shapes
(pitch glides, decays, horn partials, crowd texture); it cannot tell you how a sound *feels*.
"""
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.io import wavfile  # noqa: E402
from scipy.signal import spectrogram  # noqa: E402


def main() -> None:
    wav_dir, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)
    ids = sys.argv[3:] or sorted(p.stem for p in wav_dir.glob("*.wav"))
    for sid in ids:
        rate, data = wavfile.read(wav_dir / f"{sid}.wav")
        mono = data.astype(np.float64).mean(axis=1) / 32768.0
        fig, (a0, a1) = plt.subplots(2, 1, figsize=(10, 5), gridspec_kw={"height_ratios": [1, 2]}, sharex=True)
        t = np.arange(len(mono)) / rate
        a0.plot(t, mono, lw=0.4)
        a0.set_ylim(-1, 1)
        a0.set_title(f"{sid}  ({len(mono) / rate:.2f}s @ {rate} Hz)")
        nper = 1024 if rate >= 24000 else 512
        f, tt, sxx = spectrogram(mono, rate, nperseg=nper, noverlap=nper * 3 // 4)
        db = 10 * np.log10(sxx + 1e-12)
        a1.pcolormesh(tt, f, db, vmin=db.max() - 80, shading="auto", cmap="magma")
        a1.set_yscale("symlog", linthresh=500)
        a1.set_ylim(40, rate / 2)
        a1.set_ylabel("Hz")
        a1.set_xlabel("s")
        fig.tight_layout()
        fig.savefig(out_dir / f"{sid}.png", dpi=80)
        plt.close(fig)


if __name__ == "__main__":
    main()
