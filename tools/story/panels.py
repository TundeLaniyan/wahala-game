"""The shipped story panels: which master each one is cut from and how it is graded (tools/story/build_story_art.py).

The key of a panel is its file name (src/assets/story/<key>.webp); src/campaign/content/storyImages.ts says which campaign
card each file goes with. Masters are tools/story/masters/<master or key>.jpg, made by scripts/story-shots.mjs from
tools/story/shots.config.mjs. A boss tint is the boss's palette (visualDirection.palette.primary in src/campaign/content/*.ts)
laid softly over the grade, because the game has no per-boss costume art yet. `crop` is (left, top, width) in master pixels:
it frames the subject and trims the renderer's dithered fade-out of near objects off the edge.
"""

from build_story_art import Panel

# boss palettes (RGB 0..1) from src/campaign/content/<district>.ts visualDirection.palette.primary
SUNMOLA = (0.851, 0.635, 0.106)  # 0xd9a21b park yellow
RONKE = (0.753, 0.224, 0.169)  # 0xc0392b flame red
KOBO = (0.184, 0.659, 0.310)  # 0x2fa84f vest green
WAYSIDE = (0.420, 0.310, 0.165)  # 0x6b4f2a rail brown
QUILL = (0.541, 0.553, 0.576)  # 0x8a8d93 robe grey (burgundy accent 0xb3202a)
HALCYON = (0.169, 0.227, 0.290)  # 0x2b3a4a steel blue

PANELS: dict[str, Panel] = {
    # ---- the opening and ending
    "prologue": Panel(mood="dusk", sky="dusk", sun=(0.12, 0.2), exposure=0.88),
    "finale": Panel(mood="night", sky="night"),
    "ending": Panel(master="ending", mood="day", sky="dusk", sun=(0.78, 0.30), crop=(0, 0, 1040)),
    # ---- district briefings
    # a place shot of the underbridge (no character: the Ojuelegba figure and boss identity are being developed separately)
    "district-ojuelegba-briefing": Panel(master="prologue", crop=(200, 70, 1000), mood="dusk", sky="dusk", sun=(0.7, 0.15), exposure=0.9),
    "district-oshodi-briefing": Panel(master="district-oshodi", sun=(0.12, 0.12)),
    "district-mushin-briefing": Panel(master="district-mushin"),
    "district-fadeyiSomolu-briefing": Panel(master="district-fadeyi", sun=(0.2, 0.05)),
    "district-ebuteMetta-briefing": Panel(master="district-ebute", sun=(0.2, 0.06)),
    "district-lagosIsland-briefing": Panel(master="district-island", sun=(0.62, 0.05)),
    "district-lekki-briefing": Panel(master="district-lekki", sun=(0.84, 0.3)),
    # ---- boss introductions (arrival compositions)
    "boss-ogaSunmola-intro": Panel(master="boss-oshodi", tint=SUNMOLA, tint_amount=0.22, sun=(0.2, 0.1)),
    "boss-madamRonke-intro": Panel(master="boss-mushin", tint=RONKE, tint_amount=0.22, sun=(0.35, 0.12)),
    "boss-marshalKobo-intro": Panel(master="boss-fadeyi", tint=KOBO, tint_amount=0.2, sun=(0.2, 0.08)),
    "boss-ikennaWayside-intro": Panel(master="boss-ebute", tint=WAYSIDE, tint_amount=0.24, sun=(0.25, 0.08)),
    "boss-barristerQuill-intro": Panel(master="boss-island", crop=(250, 60, 1030), tint=QUILL, tint_amount=0.2, sun=(0.3, 0.1)),
    "boss-stewardHalcyon-intro": Panel(master="boss-lekki", tint=HALCYON, tint_amount=0.26, sun=(0.8, 0.3)),
    # ---- field and raid sections (the thumbnails and cards of the section list)
    "section-oshodi-approach": Panel(crop=(60, 40, 1000), sun=(0.3, 0.05)),
    "raid-warehouseDispatchDepot": Panel(sun=(0.15, 0.1), exposure=1.15),
    "section-ebuteMetta-railYard": Panel(sun=(0.15, 0.1), exposure=1.25),
}
