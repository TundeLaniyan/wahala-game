#!/usr/bin/env python3
"""Export the WAHALA! main theme as a Standard MIDI File so a human composer/producer can
re-record it with real players (talking drum, agogo, congas, horns, guitar, bass).
Format 1, 480 PPQ, 112 BPM. Tracks: tempo, lead, chords, bass, drums (GM ch.10)."""
import os, struct, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import theme

PPQ = 480
STEP = PPQ // 4


def vlq(n):
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def track(events, name):
    """events: list of (tick, bytes). Sorted, delta-encoded."""
    evs = sorted(events, key=lambda e: (e[0], 0 if e[1][0] & 0xF0 == 0x80 else 1))
    data = b"\x00\xff\x03" + vlq(len(name)) + name.encode()
    last = 0
    for t, b in evs:
        data += vlq(t - last) + b
        last = t
    data += b"\x00\xff\x2f\x00"
    return b"MTrk" + struct.pack(">I", len(data)) + data


def notes(ch, items, vel=96):
    ev = []
    for tick, m, ln, v in items:
        ev.append((tick, bytes([0x90 | ch, m, v or vel])))
        ev.append((tick + max(ln, 1), bytes([0x80 | ch, m, 0])))
    return ev


def bar_tick(b, s=0):
    return (b * 16 + s) * STEP


def main(out):
    lead, chords, bass, drums = [], [], [], []
    prog = ["Dm7", "Dm7", "G", "Am"] * 2 + ["Bb", "C", "Dm7", "Dm7"] + ["Dm7", "Dm7", "G", "A"]
    # melodies exactly as in the playable menu draft
    for bar0, mel in ((4, theme.HOOK_A), (6, theme.ANSWER), (8, theme.CHORUS)):
        for s, m, ln in mel:
            lead.append((bar_tick(bar0, s), m, int(ln * STEP * 0.95), 100 if ln >= 3 else 88))
    for s, m, ln in theme.HOOK_CELL:
        lead.append((bar_tick(12, s), m, int(ln * STEP * 0.95), 90))
    for b, ch in enumerate(prog):
        for s in ((0,) if b < 8 else (0, 3, 6, 10)):
            for m in theme.CH[ch][1]:
                chords.append((bar_tick(b, s), m, STEP * (3 if s == 0 else 2), 70))
        root = theme.CH[ch][0]
        pat = theme.BASS_A if (b >= 2 or b > 7) else theme.BASS_SPARSE
        for s, off, ln in pat:
            bass.append((bar_tick(b, s), root + off, int(ln * STEP * 0.92), 100))
    # drums (GM): kick 36, clap 39, rim 37, closed hat 42, open hat 46, maracas 70,
    # hi agogo 67 / lo agogo 68 (bell cycle 3-3-3-3-2-2), hi conga 63, lo conga 64, mute conga 62
    for b in range(16):
        section = b // 4
        kicks = theme.KICK_DRIVE if section == 2 else theme.KICK_GROOVE
        for s in kicks: drums.append((bar_tick(b, s), 36, STEP, 110))
        for s in (4, 12): drums.append((bar_tick(b, s), 39, STEP, 100))
        for s in (9, 15): drums.append((bar_tick(b, s), 37, STEP // 2, 60))
        for s in range(0, 16, 2):
            if s not in (0, 4, 12): drums.append((bar_tick(b, s), 46 if s == 14 else 42, STEP, 90 if s % 4 == 2 else 55))
        for s in range(16): drums.append((bar_tick(b, s), 70, STEP // 2, 80 if s in (0, 3, 6, 9, 12, 14) else 45))
        for s, f in theme.BELL: drums.append((bar_tick(b, s), 67 if f > 700 else 68, STEP, 80))
        for s in (2, 5, 10, 13): drums.append((bar_tick(b, s), 63, STEP, 80))
        for s in (0, 8): drums.append((bar_tick(b, s), 64, STEP, 85))
        for s in (7, 15): drums.append((bar_tick(b, s), 62, STEP // 2, 80))
    tempo = b"\x00\xff\x51\x03" + struct.pack(">I", int(60_000_000 / theme.BPM))[1:]
    meta = b"\x00\xff\x58\x04\x04\x02\x18\x08" + tempo + b"\x00\xff\x59\x02\x00\x01"  # 4/4, key D minor (0 sharps/flats, minor)
    name = b"WAHALA Lagos City Rumble - Main Theme (draft score)"
    t0 = b"MTrk" + struct.pack(">I", len(b"\x00\xff\x03" + bytes([len(name)]) + name + meta + b"\x00\xff\x2f\x00")) + b"\x00\xff\x03" + bytes([len(name)]) + name + meta + b"\x00\xff\x2f\x00"
    trks = [t0, track(notes(0, lead), "Lead (WAHALA hook)"), track(notes(1, chords), "Chords / horn stabs"),
            track(notes(2, bass), "Bass"), track(notes(9, drums), "Drums & percussion")]
    hdr = b"MThd" + struct.pack(">IHHH", 6, 1, len(trks), PPQ)
    with open(out, "wb") as fh:
        fh.write(hdr + b"".join(trks))
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "drafts", "WAHALA_main_theme_score.mid"))
