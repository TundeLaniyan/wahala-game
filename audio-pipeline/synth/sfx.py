"""Procedural SFX drafts (original, math-generated). Mono unless noted.

These are *functional placeholders with a considered design hierarchy*, not final
foley/sound-design. Danger cues are deliberately tonal/rhythmic in the 2-4.5 kHz band
and music is EQ-pocketed there; ambience is band-limited low and quiet.
"""
import numpy as np
from dsp import *
import instruments as I


def periodic_noise(sec, lo, hi, seed):
    """Exactly periodic band-limited noise (random-phase spectrum) => seamless loop."""
    n = n_of(sec)
    r = rng(seed)
    spec = np.zeros(n // 2 + 1, dtype=complex)
    f = np.fft.rfftfreq(n, 1 / SR)
    m = (f >= lo) & (f <= hi)
    spec[m] = np.exp(1j * r.uniform(0, 2 * np.pi, m.sum()))
    x = np.fft.irfft(spec, n)
    return x / (np.abs(x).max() + 1e-9)


def tone(f, sec, decay=0.1, attack=0.002, harm=()):
    t = tvec(sec)
    x = np.sin(2 * np.pi * f * t)
    for k, a in harm:
        x += a * np.sin(2 * np.pi * f * k * t)
    return x * env_exp(sec, decay, attack)


def seq(*items, total=None):
    """items: (time, signal, gain)."""
    end = max(t + len(s) / SR for t, s, g in items)
    out = np.zeros(n_of(total or end))
    for t, s, g in items:
        k = n_of(t)
        out[k:k + len(s)] += (s * g)[: max(0, len(out) - k)]
    return out


# ------------------------------------------------------------------ UI
def ui_move(): return tone(1900, 0.06, 0.012, harm=((2, 0.3),)) * 0.5
def ui_confirm(): return seq((0, tone(880, 0.2, 0.07, harm=((2, 0.3), (3, 0.15))), 0.6), (0.07, tone(1318.5, 0.28, 0.1, harm=((2, 0.3),)), 0.6))
def ui_back(): return seq((0, tone(660, 0.14, 0.05, harm=((2, 0.25),)), 0.55), (0.05, tone(440, 0.18, 0.07, harm=((2, 0.25),)), 0.55))
def ui_error(): return softclip(seq((0, tone(150, 0.12, 0.05, harm=((2, 0.8), (3, 0.5))), 0.8), (0.11, tone(130, 0.16, 0.06, harm=((2, 0.8), (3, 0.5))), 0.8)), 1.5) * 0.5
def ui_toggle(): return tone(1200, 0.07, 0.02, harm=((2, 0.4),)) * 0.5
def ui_match_start():
    w = bp(noise(0.55, 31), 300, 6000, 1) * (tvec(0.55) / 0.55) ** 2 * 0.5
    return seq((0, w, 1.0), (0.5, I.kick(0.35), 0.8), (0.5, tone(1046.5, 0.3, 0.1, harm=((2, 0.3),)), 0.4))
def cd_tick(): return (tone(1400, 0.1, 0.02, harm=((2.4, 0.5),)) + 0.3 * bp(noise(0.1, 32), 2000, 5000, 1) * env_exp(0.1, 0.01)) * 0.55
def cd_go(): return seq((0, I.brass_stab([float(midi(m)) for m in (62, 69, 74, 78)], 0.45, bright=4500), 0.9), (0, I.kick(0.3), 0.6))


# ------------------------------------------------------------------ Generator / fuse
def gen_place():
    clank = I.agogo(310, 0.3) * 0.8 + bp(noise(0.3, 33), 1200, 5000) * env_exp(0.3, 0.02) * 0.4
    thunk = I.kick(0.3, 95, 52) * 0.9
    return seq((0, thunk, 1.0), (0.015, clank, 0.7), (0.2, I.generator_sputter(0.5, accel=False)[: n_of(0.3)] * 0.6, 1.0))


def gen_fuse_loop():
    """1.2 s seamless loop: sizzling fuse + low generator rattle. Quiet, mid-low, not tonal."""
    sec = 1.2
    t = tvec(sec)
    sizzle = periodic_noise(sec, 3500, 9000, 34) * (0.55 + 0.45 * np.sin(2 * np.pi * 7 * t) ** 2)
    rattle = periodic_noise(sec, 60, 320, 35) * (0.5 + 0.5 * np.sin(2 * np.pi * 12 * t) ** 2)
    crackle = np.zeros_like(t)
    r = rng(36)
    for k in r.integers(0, len(t) - 400, 14):
        crackle[k:k + 90] += r.uniform(0.3, 1.0) * np.exp(-np.arange(90) / 18) * r.choice([-1, 1])
    return (sizzle * 0.35 + rattle * 0.5 + crackle * 0.45) * 0.8


def gen_warn_a(): return tone(2400, 0.12, 0.05, attack=0.003, harm=((2, 0.2),)) * 0.9
def gen_warn_b(): return tone(3150, 0.12, 0.05, attack=0.003, harm=((1.5, 0.2),)) * 0.9


def gen_arm_final():
    t = tvec(0.55)
    f = 700 * (2.2 ** (t / 0.55))
    x = np.sin(phase_from_freq(f)) * (t / 0.55) ** 1.2 + 0.4 * np.sin(phase_from_freq(f * 2.01)) * (t / 0.55)
    return x * 0.75 * np.minimum(1, (0.55 - t) / 0.02 + 0.0)


# ------------------------------------------------------------------ Explosions
def expl_gen():
    sec = 1.9
    boom = I.impact(sec) * 1.0
    fire = lp(noise(sec, 37), 1800) * np.exp(-tvec(sec) / 0.35) * (1 - np.exp(-tvec(sec) / 0.02)) * 0.9
    fire = sweep_lp(fire, 4500, 500, 24)
    deb = np.zeros(n_of(sec))
    r = rng(38)
    for k in range(34):
        t0 = 0.08 + r.exponential(0.32)
        if t0 > sec - 0.12: continue
        c = I.agogo(float(r.uniform(900, 3800)), 0.1) * r.uniform(0.15, 0.5)
        s = n_of(t0)
        deb[s:s + len(c)] += c
    crack = hp(noise(0.05, 39), 1800) * env_exp(0.05, 0.008)
    out = boom + fire * 0.7 + deb * 0.8
    out[: len(crack)] += crack * 0.9
    return softclip(out, 1.1) * 0.9


def expl_chain():
    sec = 1.1
    t = tvec(sec)
    crack = hp(noise(sec, 40), 1500) * np.exp(-t / 0.05)
    thud = np.sin(phase_from_freq(55 + 140 * np.exp(-t / 0.04))) * np.exp(-t / 0.28)
    whoomp = lp(noise(sec, 41), 900) * np.exp(-t / 0.2)
    return softclip(crack * 0.7 + thud * 1.3 + whoomp * 0.8, 1.3) * 0.85


def debris_break():
    sec = 0.55
    t = tvec(sec)
    x = bp(noise(sec, 42), 300, 4000) * np.exp(-t / 0.09)
    for k, (tt, f) in enumerate(((0.03, 700), (0.1, 520), (0.17, 880), (0.26, 430))):
        c = tone(f, 0.12, 0.03) * 0.35
        s = n_of(tt); x[s:s + len(c)] += c
    return softclip(x * 1.2) * 0.7


# ------------------------------------------------------------------ Combat
def punch_whoosh(): return bp(noise(0.2, 43), 400, 5000, 1) * np.sin(np.pi * tvec(0.2) / 0.2) ** 1.5 * 0.55
def punch_hit(): return seq((0, I.kick(0.2, 160, 70, punch=1.6), 0.9), (0, bp(noise(0.14, 44), 800, 4500) * env_exp(0.14, 0.02), 0.7))
def push_shove(): return seq((0, lp(noise(0.28, 45), 900) * env_exp(0.28, 0.08), 0.9), (0.02, I.conga(160, 0.2), 0.8))
def kick_thud(): return seq((0, I.kick(0.3, 110, 60), 1.0), (0, bp(noise(0.1, 46), 600, 2500) * env_exp(0.1, 0.02), 0.5))


def daze():
    t = tvec(0.8)
    f = 880 * (1 + 0.04 * np.sin(2 * np.pi * 7 * t))
    x = np.sin(phase_from_freq(f)) * np.exp(-t / 0.35) * 0.45
    for i, tt in enumerate((0.0, 0.14, 0.28, 0.42)):
        c = I.agogo(1320 + 220 * i, 0.2) * 0.5; s = n_of(tt); x[s:s + len(c)] += c
    return x


def damage_hit(): return seq((0, I.conga(180, 0.25, slap=True), 0.9), (0, I.kick(0.2, 140, 60), 0.6), (0, tone(520, 0.2, 0.05, harm=((2, 0.3),)), 0.3))


def elim_comic():
    """Non-graphic comic elimination: spin whistle -> bonk -> dust poof -> tiny shoes clatter."""
    sec = 1.5
    t = tvec(0.7)
    f = 1900 * np.exp(-t / 0.4) + 300
    whistle = np.sin(phase_from_freq(f)) * np.minimum(1, t / 0.02) * np.exp(-t / 0.55) * 0.5
    bonk = tone(300, 0.25, 0.07, harm=((1.6, 0.6), (2.9, 0.3))) * 0.8
    poof = lp(noise(0.5, 47), 1500) * env_exp(0.5, 0.12, 0.01) * 0.6
    shoe = I.conga(480, 0.1, slap=True) * 0.5
    return seq((0, whistle, 0.8), (0.55, bonk, 0.9), (0.55, I.kick(0.2, 120, 60), 0.5), (0.58, poof, 0.8), (0.95, shoe, 0.7), (1.08, shoe * 0.7, 0.7), total=sec)


# ------------------------------------------------------------------ Shields / defence
def shield_up():
    sec = 0.7
    t = tvec(sec)
    x = sum(np.sin(2 * np.pi * f * t) * (t / sec) ** 0.8 * np.exp(-(t / sec) ** 3 * 2) for f in (523, 784, 1046, 1568)) * 0.18
    return x * np.minimum(1, (sec - t) / 0.05)


def shield_hit(): return seq((0, I.agogo(1568, 0.35), 1.0), (0, tone(220, 0.2, 0.05, harm=((2, 0.5),)), 0.5))


def shield_break():
    sec = 0.8
    shards = np.zeros(n_of(sec)); r = rng(48)
    for k in range(18):
        c = I.agogo(float(r.uniform(1500, 5200)), 0.12) * r.uniform(0.2, 0.7); s = n_of(r.uniform(0, 0.4)); shards[s:s + len(c)] += c
    return seq((0, shards, 0.8), (0, I.kick(0.3, 100, 50), 0.6), (0, tone(196, 0.45, 0.18, harm=((2, 0.5),)), 0.3), total=sec)


# ------------------------------------------------------------------ Pickups
def pickup_good(): return seq(*[(i * 0.06, I.pluck(float(midi(m)), 0.35, bright=0.9), 0.8) for i, m in enumerate((74, 78, 81, 86))])
def pickup_curse(): return seq(*[(i * 0.09, tone(float(midi(m)), 0.3, 0.12, harm=((2, 0.6),)) , 0.6) for i, m in enumerate((70, 66, 62, 57))])


# ------------------------------------------------------------------ Sudden Death
def sd_alarm():
    sec = 1.9
    t = tvec(sec)
    f = np.where((t % 0.95) < 0.475, 540, 400).astype(float)
    x = softclip(np.sin(phase_from_freq(f)) + 0.5 * np.sin(phase_from_freq(f * 2)), 1.3)
    return x * 0.5 * np.minimum(1, np.minimum(t / 0.02, (sec - t) / 0.05))


def sd_slam():
    sec = 0.8
    t = tvec(sec)
    x = np.sin(phase_from_freq(48 + 60 * np.exp(-t / 0.05))) * np.exp(-t / 0.3) + lp(noise(sec, 49), 700) * np.exp(-t / 0.1) + hp(noise(sec, 50), 2000) * np.exp(-t / 0.012) * 0.5
    return softclip(x * 1.2, 1.4) * 0.85


# ------------------------------------------------------------------ Boss
def boss_telegraph():
    """Danger cue: rising two-voice horn + growl; must be unmistakable over music."""
    sec = 1.1
    t = tvec(sec)
    f = 150 * (2 ** (t / sec * 1.1))
    x = (saw_poly(f) + 0.7 * saw_poly(f * 1.5)) * 0.4
    x = sweep_lp(x, 600, 3600, 24) * (0.3 + 0.7 * t / sec)
    g = lp(noise(sec, 51), 400) * (0.5 + 0.5 * np.sin(2 * np.pi * 22 * t)) * 0.5
    return softclip(x + g, 1.5) * 0.7 * np.minimum(1, (sec - t) / 0.03)


def boss_slam(): return seq((0, I.impact(1.4), 1.0), (0.0, debris_break(), 0.6))
def boss_vuln_open():
    return seq(*[(i * 0.07, I.pluck(float(midi(m)), 0.6, bright=1.0), 0.9) for i, m in enumerate((81, 86, 90, 93))], (0.28, tone(2093, 0.4, 0.15), 0.25), (0.0, lp(noise(0.5, 52), 3000) * env_exp(0.5, 0.15) * 0.3, 1.0))
def boss_hit(): return seq((0, I.kick(0.3, 150, 60, punch=1.5), 0.9), (0, I.agogo(740, 0.3), 0.6), (0, bp(noise(0.12, 53), 900, 5000) * env_exp(0.12, 0.02), 0.6))
def boss_defeat(): return seq((0, I.impact(2.0), 1.0), (0.2, expl_chain(), 0.8), (0.9, expl_chain(), 0.6), (1.3, I.talking_drum(260, 90, 0.7), 0.7), total=2.2)


# ------------------------------------------------------------------ Lagos street flavour (one-shots)
def horn_honk(f1=420.0, f2=525.0, sec=0.42):
    t = tvec(sec)
    x = sum(np.sign(np.sin(2 * np.pi * f * t)) * 0.5 + np.sin(2 * np.pi * f * t) * 0.5 for f in (f1, f2))
    x = lp(x, 2600) * env_adsr(sec, 0.01, 0.03, 0.9, 0.05)
    return x * 0.4


def horn_honk_b(): return horn_honk(380.0, 480.0, 0.3)


def keke_putt():
    """Three-stroke putt-putt one-shot (ambient 'Keke passes')."""
    sec = 1.6
    out = np.zeros(n_of(sec)); t = 0.0; k = 0
    while t < sec - 0.1:
        b = (np.sin(2 * np.pi * (95 + 8 * (k % 2)) * tvec(0.09)) + 0.8 * lp(noise(0.09, 54 + k), 600)) * np.exp(-tvec(0.09) / 0.03)
        s = n_of(t); out[s:s + len(b)] += b[: len(out) - s]; t += 0.14 + 0.02 * np.sin(k); k += 1
    return softclip(out, 1.4) * 0.45


def amb_lagos():
    """16 s seamless low-level Lagos bed: traffic wash, distant generators, sparse horns/Keke.
    Deliberately sparse and band-limited (<~1.8 kHz) so it never masks danger cues or the music."""
    sec = 16.0
    n = n_of(sec)
    t = tvec(sec)
    traffic = periodic_noise(sec, 70, 1100, 60) * (0.6 + 0.4 * np.sin(2 * np.pi * 3 / sec * t + 1.0))
    gen = sum(np.sin(2 * np.pi * f * t + p) for f, p in ((50.0, 0.1), (100.0, 1.3), (150.0, 2.2))) * (0.5 + 0.5 * np.sin(2 * np.pi * 2 / sec * t)) * 0.18
    hiss = periodic_noise(sec, 1500, 2600, 61) * 0.05
    out = traffic * 0.55 + gen + hiss
    # distant horns & keke, low-passed + far; each fully decays inside the loop
    for tt, fn, g in ((2.8, horn_honk, 0.35), (7.4, horn_honk_b, 0.3), (12.6, horn_honk, 0.25), (9.2, keke_putt, 0.45)):
        s = lp(fn(), 1500) * g
        k = n_of(tt); out[k:k + len(s)] += s
    return out * 0.6


# ------------------------------------------------------------------ registry
# id: (fn, category, priority 0-100 (higher wins voice stealing), loop, max_voices, notes)
SFX = {
    "ui_move": (ui_move, "ui", 20, False, 2, "menu cursor"),
    "ui_confirm": (ui_confirm, "ui", 30, False, 2, "confirm"),
    "ui_back": (ui_back, "ui", 30, False, 2, "back/cancel"),
    "ui_error": (ui_error, "ui", 30, False, 1, "invalid"),
    "ui_toggle": (ui_toggle, "ui", 20, False, 2, "setting toggle/slider tick"),
    "ui_match_start": (ui_match_start, "ui", 60, False, 1, "start match"),
    "cd_tick": (cd_tick, "ui", 60, False, 2, "3-2-1 countdown"),
    "cd_go": (cd_go, "ui", 70, False, 1, "round start GO"),
    "gen_place": (gen_place, "gen", 55, False, 4, "generator placement"),
    "gen_fuse_loop": (gen_fuse_loop, "danger", 70, True, 3, "fuse loop; per-generator, pitch-detune per instance"),
    "gen_warn_a": (gen_warn_a, "danger", 90, False, 2, "danger beep A (2.4 kHz)"),
    "gen_warn_b": (gen_warn_b, "danger", 90, False, 2, "danger beep B (3.15 kHz); alternate with A"),
    "gen_arm_final": (gen_arm_final, "danger", 92, False, 2, "final-half-second whine"),
    "expl_gen": (expl_gen, "expl", 95, False, 4, "generator explosion"),
    "expl_chain": (expl_chain, "expl", 90, False, 4, "chain-reaction accent layered 80-120 ms behind expl_gen"),
    "debris_break": (debris_break, "expl", 50, False, 3, "destructible obstacle breaks"),
    "punch_whoosh": (punch_whoosh, "combat", 45, False, 3, "swing"),
    "punch_hit": (punch_hit, "combat", 55, False, 3, "punch connects"),
    "push_shove": (push_shove, "combat", 50, False, 3, "push"),
    "kick_thud": (kick_thud, "combat", 50, False, 3, "kicked generator"),
    "daze": (daze, "combat", 60, False, 2, "daze/freeze"),
    "damage_hit": (damage_hit, "combat", 65, False, 3, "damage taken"),
    "elim_comic": (elim_comic, "combat", 85, False, 2, "comic non-graphic elimination"),
    "shield_up": (shield_up, "defense", 60, False, 2, "shield/Okada protection on"),
    "shield_hit": (shield_hit, "defense", 70, False, 3, "shield absorbs blast/hit"),
    "shield_break": (shield_break, "defense", 75, False, 2, "shield breaks"),
    "pickup_good": (pickup_good, "pickup", 55, False, 3, "power-up"),
    "pickup_curse": (pickup_curse, "pickup", 60, False, 2, "bad fuel / curse"),
    "sd_alarm": (sd_alarm, "danger", 88, False, 1, "Sudden Death / Wahala Crush warning"),
    "sd_slam": (sd_slam, "danger", 80, False, 3, "crush block lands"),
    "boss_telegraph": (boss_telegraph, "danger", 95, False, 1, "boss attack wind-up"),
    "boss_slam": (boss_slam, "expl", 90, False, 2, "boss attack lands"),
    "boss_vuln_open": (boss_vuln_open, "danger", 85, False, 1, "boss vulnerability window open (bright, distinct)"),
    "boss_hit": (boss_hit, "combat", 70, False, 3, "player hits boss"),
    "boss_defeat": (boss_defeat, "expl", 95, False, 1, "boss defeated"),
    "horn_honk": (horn_honk, "amb_event", 15, False, 2, "street horn (also driven by arena events)"),
    "horn_honk_b": (horn_honk_b, "amb_event", 15, False, 2, "street horn variant"),
    "keke_putt": (keke_putt, "amb_event", 15, False, 2, "Keke passes"),
    "amb_lagos": (amb_lagos, "amb", 5, True, 1, "arena bed, 16 s loop"),
}
