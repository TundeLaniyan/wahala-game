#!/usr/bin/env python3
"""Combine build output + authored integration data into src/audio-manifest.json (consumed by AudioManager.js)."""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import sfx

gen = json.load(open(os.path.join(here, "..", "drafts", "manifest.generated.json")))
assets = {}
for n, m in gen["music"].items():
    if n.startswith("_"): continue
    assets[n] = {"path": f"music/{n}", "kind": "music", "seconds": m["seconds"], "samples": m["samples"], "loop": m["loop"],
                 "bytes": m["bytes"], "role": m["role"]}
COOLDOWN = {"danger": 0.06, "ui": 0.04, "expl": 0.04, "combat": 0.03, "defense": 0.04, "gen": 0.05, "pickup": 0.05, "amb_event": 1.0}
VARIANCE = {"ui": 0.0, "combat": 0.04, "expl": 0.035, "defense": 0.02, "gen": 0.03, "pickup": 0.0, "amb_event": 0.03}
for n, m in gen["sfx"].items():
    fn, cat, prio, loop, voices, note = sfx.SFX[n]
    assets[n] = {"path": f"sfx/{n}", "kind": "sfx", "category": cat, "priority": prio, "loop": loop, "maxVoices": voices,
                 "cooldown": COOLDOWN.get(cat, 0.03), "variance": VARIANCE.get(cat, 0.0), "seconds": m["seconds"],
                 "samples": m["samples"], "bytes": m["bytes"], "note": note}

man = {
    "version": 1, "status": "DRAFT - synthesised placeholders pending founder listening approval",
    "sampleRate": gen["sampleRate"], "bpm": gen["bpm"], "barSeconds": gen["barSeconds"],
    "assets": assets,
    "music": {
        "menu":     {"stems": {"main": "menu_loop"}, "loop": True},
        "rumble":   {"stems": {"base": "rumble_base", "perc": "rumble_perc", "hype": "rumble_hype"}, "loop": True,
                     "layers": [{"base": 1, "perc": 0, "hype": 0}, {"base": 1, "perc": 1, "hype": 0}, {"base": 1, "perc": 1, "hype": 1}]},
        "trailer":  {"stems": {"main": "trailer"}, "loop": False},
    },
    # Initial download = "boot" only. Everything else streams in the background behind the menu.
    "groups": {
        "boot":  ["ui_move", "ui_confirm", "ui_back", "ui_error", "ui_toggle", "sting"],
        "menu":  ["menu_loop"],
        "match": ["rumble_base", "rumble_perc", "rumble_hype", "amb_lagos", "ui_match_start", "cd_tick", "cd_go",
                  "gen_place", "gen_fuse_loop", "gen_warn_a", "gen_warn_b", "gen_arm_final", "expl_gen", "expl_chain", "debris_break",
                  "punch_whoosh", "punch_hit", "push_shove", "kick_thud", "daze", "damage_hit", "elim_comic",
                  "shield_up", "shield_hit", "shield_break", "pickup_good", "pickup_curse", "sd_alarm", "sd_slam",
                  "horn_honk", "horn_honk_b", "keke_putt"],
        "result": ["victory", "defeat"],
        "boss":  ["boss_telegraph", "boss_slam", "boss_vuln_open", "boss_hit", "boss_defeat"],
    },
    # Music ducking applied when a cue of this category fires: music/ambience gain target, hold (s), release (s)
    "duck": {
        "danger": {"music": 0.5, "ambience": 0.35, "hold": 0.35, "release": 0.45},
        "expl":   {"music": 0.42, "ambience": 0.3, "hold": 0.45, "release": 0.6},
    },
    "events": {
        "ui.move": {"sfx": "ui_move"}, "ui.confirm": {"sfx": "ui_confirm"}, "ui.back": {"sfx": "ui_back"},
        "ui.error": {"sfx": "ui_error"}, "ui.toggle": {"sfx": "ui_toggle"},
        "match.start": {"sfx": "ui_match_start"}, "countdown.tick": {"sfx": "cd_tick"}, "countdown.go": {"sfx": "cd_go"},
        "generator.placed": {"sfx": "gen_place"},
        "generator.fuse.start": {"loop": "gen_fuse_loop", "key": "fuse:{id}", "volume": 0.8},
        "generator.fuse.stop": {"stopLoop": "fuse:{id}"},
        "generator.warn.a": {"sfx": "gen_warn_a"}, "generator.warn.b": {"sfx": "gen_warn_b"},
        "generator.armed.final": {"sfx": "gen_arm_final"},
        "generator.explode": {"sfx": "expl_gen"}, "generator.chain": {"sfx": "expl_chain"},
        "wall.break": {"sfx": "debris_break"}, "generator.kicked": {"sfx": "kick_thud"},
        "punch.swing": {"sfx": "punch_whoosh"}, "punch.hit": {"sfx": "punch_hit"}, "push.hit": {"sfx": "push_shove"},
        "player.daze": {"sfx": "daze"}, "player.damage": {"sfx": "damage_hit"}, "player.eliminated": {"sfx": "elim_comic"},
        "shield.up": {"sfx": "shield_up"}, "shield.hit": {"sfx": "shield_hit"}, "shield.break": {"sfx": "shield_break"},
        "pickup.good": {"sfx": "pickup_good"}, "pickup.curse": {"sfx": "pickup_curse"},
        "suddendeath.warn": {"sfx": "sd_alarm"}, "suddendeath.block": {"sfx": "sd_slam"},
        "boss.telegraph": {"sfx": "boss_telegraph"}, "boss.slam": {"sfx": "boss_slam"},
        "boss.vulnerable": {"sfx": "boss_vuln_open"}, "boss.hit": {"sfx": "boss_hit"}, "boss.defeated": {"sfx": "boss_defeat"},
        "arena.horn": {"sfx": "horn_honk"}, "arena.horn2": {"sfx": "horn_honk_b"}, "arena.keke": {"sfx": "keke_putt"},
        "music.menu": {"music": "menu"}, "music.rumble": {"music": "rumble", "intensity": 0},
        "music.intensity.0": {"intensity": 0}, "music.intensity.1": {"intensity": 1}, "music.intensity.2": {"intensity": 2},
        "stinger.logo": {"stinger": "sting"}, "stinger.victory": {"stinger": "victory"}, "stinger.defeat": {"stinger": "defeat"},
    },
}
out = os.path.join(here, "..", "src", "audio-manifest.json")
json.dump(man, open(out, "w"), indent=1)
boot = sum(assets[i]["bytes"]["ogg"] for i in man["groups"]["boot"])
print("wrote", out, "| boot group ogg bytes:", boot)
