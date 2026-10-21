"""Script for the crowd's spoken Nigerian Pidgin: every line, its trigger category, and a hand-written
pronunciation lexicon.

WHY A LEXICON: the neural voices used by build_voices.py are English voices. Reading Pidgin spelling through
an English grapheme-to-phoneme model gives an English accent with English vowel reduction. Instead every word
below is mapped to an explicit IPA string using a West-African-style vowel set (a e E i o O u, no schwa, no
vowel reduction, open syllables where Pidgin has them) in the symbols Kokoro understands:
    ɛ = open e, ɔ = open o, ʧ = ch, ʤ = j, ʃ = sh, ɡ = hard g, 'I' = ai, 'A' = ei, 'W' = au, 'O' = ou
Primary stress marks (ˈ) are kept light so rhythm stays syllable-timed.

THIS IS A BEST EFFORT, NOT AN AUTHENTIC ACCENT: the timbre, intonation and tone patterns still come from
American/British-trained voices. A native Pidgin speaker will hear that at once. See docs/AUDIO.md.
"""
from __future__ import annotations

import re

# -------------------------------------------------------------------------------------------------
# Lexicon: lowercase word -> IPA
# -------------------------------------------------------------------------------------------------
LEX: dict[str, str] = {
    # pronouns, particles, grammar
    "a": "a", "i": "ai", "e": "ɛ", "you": "yu", "una": "ˈuna", "dem": "dɛm", "him": "im", "my": "mai", "your": "yɔ",
    "we": "wi", "me": "mi", "no": "no", "na": "na", "dey": "dɛ", "don": "dɔn", "go": "ɡo", "wan": "wan", "for": "fɔ",
    "the": "da", "this": "dis", "that": "dat", "be": "bi", "is": "iz", "of": "ɔv", "to": "tu", "and": "an", "if": "if",
    "make": "mɛk", "shey": "ʃɛ", "o": "o", "oh": "o", "ah": "ˈa", "ha": "ha", "haa": "ˈhaa", "ehen": "ɛˈhɛn", "hey": "hɛ",
    "oya": "ˈɔya", "abeg": "aˈbɛɡ", "oga": "ˈoɡa", "omo": "ˈɔmɔ", "chai": "ʧai", "wahala": "waˈhala", "sabi": "ˈsabi",
    "wetin": "ˈwɛtin", "which": "witʃ", "kain": "kain", "so": "so", "as": "as", "am": "am", "how": "hao", "who": "hu",
    "what": "wɔt", "where": "wɛ", "when": "wɛn", "why": "wai", "wait": "wɛt", "not": "nɔt", "dey": "dɛ", "can": "kan",
    "more": "mɔ", "one": "wɔn", "two": "tu", "ten": "tɛn", "last": "las", "first": "fɛst", "small": "smɔl", "big": "bik",
    "biggest": "ˈbikɛst", "well": "wɛl", "done": "dɔn", "again": "aˈɡɛn", "now": "nao", "here": "hia", "there": "dɛ",
    "front": "frɔnt", "back": "bak", "side": "sId", "price": "pris", "all": "ɔl", "every": "ˈɛvri", "everything": "ˈɛvriting",
    "nobody": "ˈnobɔdi", "both": "bot", "other": "ˈɔda", "next": "nɛkst", "time": "taim", "thing": "ting", "like": "laik",
    "with": "wit", "from": "frɔm", "but": "bɔt", "if": "if", "never": "ˈnɛva", "yesterday": "ˈyɛstɛdɛ", "tell": "tɛl",
    "hear": "hia", "know": "no", "see": "si", "look": "lʊk", "want": "wɔnt", "say": "sɛ", "said": "sɛd", "just": "ʤɔs",
    # verbs / actions
    "happen": "ˈhapɛn", "shift": "ʃift", "pass": "pas", "collect": "kɔˈlɛkt", "take": "tɛk", "escape": "ɛsˈkɛp",
    "carry": "ˈkari", "finish": "ˈfiniʃ", "run": "rɔn", "move": "muv", "blow": "blo", "explode": "ɛkˈsplod", "catch": "katʃ",
    "kill": "kil", "fight": "fait", "vex": "vɛks", "reduce": "rɛˈdus", "touch": "tɔʧ", "start": "stat", "begin": "biˈɡin",
    "win": "win", "stop": "stɔp", "enter": "ˈɛnta", "buy": "bai", "hold": "hold", "drop": "drɔp", "push": "puʃ", "kick": "kik",
    "throw": "tro", "hurry": "ˈhɔri", "scatter": "ˈskata", "burst": "bɔst", "die": "dai", "fall": "fɔl", "slip": "slip",
    "turn": "tɔn", "fly": "flai", "come": "kɔm", "waka": "ˈwaka", "comot": "ˈkomɔt", "survive": "saˈvaiv", "cost": "kɔst",
    "owe": "o", "give": "ɡiv", "get": "ɡɛt", "chop": "ʧɔp", "remain": "riˈmɛn", "reach": "riʧ", "put": "pʊt", "add": "ad",
    "try": "trai", "go": "ɡo", "dem": "dɛm", "end": "ɛnd", "do": "du", "pay": "pɛ", "think": "tink", "watch": "wɔʧ", "out": "aut",
    "sorry": "ˈsɔri", "congratulations": "kɔnɡratʃuˈlɛʃɔnz", "calculation": "kalkyuˈlɛʃɔn", "wicked": "ˈwikɛd",
    "craze": "krɛz", "respect": "riˈspɛkt", "mind": "maind", "head": "hɛd", "brake": "brɛk", "lucky": "ˈlɔki", "luck": "lɔk",
    "better": "ˈbɛta", "careful": "ˈkɛfʊl", "calm": "kam", "down": "daun", "war": "wɔ", "accident": "ˈaksidɛnt", "inch": "inʧ",
    "shave": "ʃɛv", "close": "klos", "hot": "hɔt", "cold": "kold", "pure": "pyua", "water": "ˈwɔta", "buy": "bai",
    "hero": "ˈhiro", "nonsense": "ˈnɔnsɛns", "goods": "ɡʊdz", "load": "lod", "change": "ʧɛnʤ", "madam": "ˈmadam", "sir": "sɔ",
    "aunty": "ˈanti", "brother": "ˈbrɔda", "boy": "bɔi", "man": "man", "guy": "ɡai", "wife": "waif", "driver": "ˈdraiva",
    "conductor": "kɔnˈdɔkta", "god": "ɡɔd", "bless": "blɛs", "thank": "tank", "friend": "frɛnd", "food": "fud", "fuel": "ˈfiul",
    "money": "ˈmɔni", "naira": "ˈnaira", "thousand": "ˈtauzand", "hundred": "ˈhɔndrɛd", "five": "faiv", "dey": "dɛ",
    "winner": "ˈwina", "oil": "ɔil", "pothole": "ˈpɔthol", "road": "rod", "roof": "ruf", "land": "land", "left": "lɛft",
    "time": "taim", "minute": "ˈminit", "seconds": "ˈsɛkɔnz", "before": "biˈfɔ", "near": "nia", "almost": "ˈɔlmost",
    "nearly": "ˈniali", "by": "bai", "draw": "drɔ", "eye": "ai", "joke": "ʤok", "much": "mɔʧ", "person": "ˈpɛsɔn", "ready": "ˈrɛdi", "save": "sɛv", "wake": "wɛk", "up": "ɔp", "life": "laif", "sweet": "swit", "loud": "laud", "no": "no", "yes": "yɛs",
    # nouns of the game
    "danfo": "ˈdanfo", "taxi": "ˈtaksi", "keke": "ˈkɛkɛ", "napep": "ˈnapɛp", "okada": "oˈkada", "yellow": "ˈyɛlo",
    "generator": "ˈʤɛnɛrɛta", "motor": "ˈmoto", "firecracker": "ˈfaiakraka", "bottle": "ˈbɔtɔl", "pepsi": "ˈpɛpsi",
    "gala": "ˈɡala", "bread": "brɛd", "suya": "ˈsuya", "agege": "aˈɡɛɡɛ", "pickup": "ˈpikɔp", "wahala": "waˈhala", "lagos": "ˈlaɡɔs",
    # places (conductor calls)
    "ikeja": "iˈkɛʤa", "oshodi": "oˈʃodi", "yaba": "ˈyaba", "ojota": "oˈʤota", "ikorodu": "ikoˈrodu", "island": "ˈailand",
    "mile": "mail", "straight": "strɛt", "cms": "si ɛm ɛs", "lekki": "ˈlɛki", "obalende": "obaˈlɛndɛ", "ajah": "ˈaʤa",
    "mushin": "ˈmuʃin", "ojuelegba": "oʤuˈɛlɛɡba", "surulere": "suruˈlɛrɛ", "berger": "ˈbɛɡa", "ketu": "ˈkɛtu",
}


def phonemes(text: str) -> str:
    """Pidgin text -> Kokoro phoneme string. Raises KeyError on words missing from the lexicon so a
    typo can never silently fall back to English pronunciation."""
    out: list[str] = []
    for tok in re.findall(r"[A-Za-z']+|[,.!?]", text):
        if tok in ",.!?":
            out.append(tok)
        else:
            w = tok.lower().strip("'")
            if w not in LEX:
                raise KeyError(f"word not in Pidgin lexicon: {tok!r} (in {text!r})")
            out.append(" " + LEX[w])
    return re.sub(r"\s+", " ", "".join(out)).strip()


# -------------------------------------------------------------------------------------------------
# Reaction lines: category -> list of lines. Categories are triggered by src/audio/pidginReactions.ts.
# (voice hints: m/f = preferred voice gender; "fast" = quicker delivery)
# -------------------------------------------------------------------------------------------------
REACTIONS: dict[str, list[str]] = {
    "match_start": [
        "Oya! Make we see wetin dey happen!",
        "Ehen! Wahala don start!",
        "Come, come, come! Dem don begin!",
        "Abeg, make we start!",
    ],
    "gen_placed": [
        "Ah! Wetin be this one?",
        "Oga, e don put generator o!",
        "Ehen, see am!",
        "Abeg, who put that thing for there?",
    ],
    "fuse": [
        "Run! Run! E go blow!",
        "Oga, shift! Shift from there!",
        "Chai! The generator don dey go!",
        "Abeg, move! Make e no catch you!",
        "Ah! E don almost blow!",
    ],
    "escape": [
        "Omo! See as e take escape!",
        "Ah! E no touch am!",
        "Oya! You sabi run o!",
        "God dey! Na by inch!",
        "Chai! That one na close shave!",
        "Ah! E nearly catch am!",
    ],
    "elim_bot": [
        "Ah! You don finish am!",
        "Ehen! That one don go!",
        "See calculation! This guy wicked!",
        "Oya! One don comot!",
        "E don do! Na so e end!",
    ],
    "elim_human": [
        "Chai! Oga don waka!",
        "Ah ah! Sorry o!",
        "Wetin be that one? E don finish!",
        "Haa! You don burst!",
        "Abeg, no vex! Try again!",
    ],
    "danfo": [
        "Chai! That Danfo don carry am go!",
        "Danfo! Danfo! Shift! Shift!",
        "Oga, where you dey run go?",
        "See Danfo o! E no get brake!",
    ],
    "taxi": [
        "Yellow taxi dey come o!",
        "Taxi! Taxi! Abeg, move!",
        "Ah! That taxi dey craze!",
        "Where this taxi dey go?",
    ],
    "keke": [
        "Keke dey come! Keke dey come!",
        "Ah! Keke don turn!",
        "Chai! Napep dey fly o!",
        "Oga, abeg, Keke dey your back!",
    ],
    "vehicle_destroyed": [
        "Ah ah! Dem don scatter the motor!",
        "Wahala! The motor don burst!",
        "Na the generator scatter am o!",
        "Chai! No more motor!",
    ],
    "okada_save": [
        "Okada save am! Na so e dey go!",
        "Ah! The Okada take the wahala for am!",
        "Omo! That Okada na hero!",
    ],
    "okada_break": [
        "Chai! Okada don die!",
        "Ah! The Okada don scatter!",
        "Okada don finish o!",
    ],
    "final": [
        "Time dey go o! Oya, oya!",
        "Make una hurry! Time don near finish!",
        "Oga, finish am before time go!",
        "Last minute! Wahala dey!",
    ],
    "win": [
        "Ehen! Na you be the oga!",
        "Winner! Winner! Congratulations o!",
        "Chai! You don win o!",
        "Na you biggest! Well done!",
    ],
    "lose": [
        "Ah! Sorry o! Better luck next time!",
        "E don do! Try again, my man!",
        "Chai! The other one don win!",
    ],
    "draw": [
        "Haa! Nobody win!",
        "Wetin be this one? Both of dem don die!",
        "Na draw be that! Wahala!",
    ],
    "kicked": [
        "Oga, why you kick am?",
        "Ah! See as e throw am!",
        "Who dey throw generator like that?",
    ],
    "pickup": [
        "Ehen! Lucky guy!",
        "Oga, you don get am!",
        "Ah! See as e carry am!",
    ],
    "pushed": [
        "Ah! Why you push am?",
        "Oga, you no get respect?",
        "Hey! Abeg, no push me!",
    ],
    "thrown": [
        "Who dey throw bottle?",
        "Ah! Firecracker! Abeg, stop!",
        "Hey! Na who do that one?",
    ],
    "crush": [
        "Chai! E don fall o!",
        "Ah! Watch out!",
        "Abeg, be careful o!",
    ],
    "hazard": [
        "Ah! Pothole! Na Lagos road!",
        "E don slip! Na oil!",
        "Chai! Lagos road no be joke!",
    ],
    "dazed": [
        "Ah! Him head don turn!",
        "Abeg, wake up! Wahala dey!",
    ],
}

# -------------------------------------------------------------------------------------------------
# Ambient scenes: lists of lines said by DIFFERENT voices in sequence (a conversation), or one shout.
# kind: "talk" = ordinary conversation, "call" = conductor / hawker shouting across the park.
# -------------------------------------------------------------------------------------------------
AMBIENT: list[dict] = [
    {"id": "shift", "kind": "talk", "lines": ["Oga, abeg shift small!", "Ah ah! Where you wan make I go?", "Abeg, make I pass!"]},
    {"id": "side", "kind": "talk", "lines": ["Wetin dey happen for that side?", "I no know o. Na fight dem dey fight."]},
    {"id": "bargain1", "kind": "talk", "lines": ["Aunty, how much you wan collect for this one?", "Na two thousand naira.", "Two thousand? You dey craze? Abeg, reduce am.", "Oga, na last price be that."]},
    {"id": "bargain2", "kind": "talk", "lines": ["How much be this one?", "Na five hundred.", "Abeg, add small. I go pay now now."]},
    {"id": "call_ikeja", "kind": "call", "lines": ["Ikeja! Ikeja! Ikeja! One more person!"]},
    {"id": "call_oshodi", "kind": "call", "lines": ["Oshodi! Oshodi! Oshodi! Enter, enter!"]},
    {"id": "call_yaba", "kind": "call", "lines": ["Yaba! Yaba! Who dey go Yaba?"]},
    {"id": "call_island", "kind": "call", "lines": ["Obalende! Island! Island! Remain two!"]},
    {"id": "call_mile2", "kind": "call", "lines": ["Mile two! Mile two! Straight!"]},
    {"id": "call_ikorodu", "kind": "call", "lines": ["Ikorodu! Ikorodu! Come, come, come!"]},
    {"id": "call_water", "kind": "call", "lines": ["Pure water! Pure water! Cold pure water!"]},
    {"id": "call_gala", "kind": "call", "lines": ["Gala! Gala! Buy your gala here!"]},
    {"id": "call_suya", "kind": "call", "lines": ["Suya! Suya don ready! Hot suya!"]},
    {"id": "call_bread", "kind": "call", "lines": ["Agege bread! Hot bread! Come buy!"]},
    {"id": "change", "kind": "talk", "lines": ["Conductor, na who dey owe you change?", "Oga, I go give you. Wait small."]},
    {"id": "argue1", "kind": "talk", "lines": ["Na you wan kill me?", "Abeg, no vex. I no see you.", "You no get eye?"]},
    {"id": "argue2", "kind": "talk", "lines": ["You wan fight me?", "Oga, calm down. No be war."]},
    {"id": "lagos", "kind": "talk", "lines": ["Which kain wahala be this?", "Na Lagos, my brother."]},
    {"id": "tease", "kind": "talk", "lines": ["Your wife go catch you o!", "Ha! Na you sabi!"]},
    {"id": "fuel", "kind": "talk", "lines": ["Dem say fuel don cost again.", "Na so e be. We go survive."]},
    {"id": "come_see", "kind": "talk", "lines": ["Oya, make we go see wetin dey happen.", "Wait for me!"]},
    {"id": "driver", "kind": "talk", "lines": ["Driver, abeg stop for front!", "Oga, wait! I never reach there."]},
    {"id": "respect", "kind": "talk", "lines": ["See this boy o! You no get respect?", "Sorry, sir. Na accident."]},
    {"id": "goods", "kind": "talk", "lines": ["Hey! No touch that o! Na my goods!", "Oga, I no touch am."]},
    {"id": "gist", "kind": "talk", "lines": ["Shey you hear wetin happen yesterday?", "Ah! Tell me everything!"]},
    {"id": "thanks", "kind": "talk", "lines": ["Madam, your change.", "Thank you o. God bless you."]},
    {"id": "gen_loud", "kind": "talk", "lines": ["Ah! That generator loud o!", "Abeg, na so e dey."]},
]


def all_reaction_ids() -> list[tuple[str, int, str]]:
    return [(cat, i, text) for cat, lines in REACTIONS.items() for i, text in enumerate(lines)]


if __name__ == "__main__":
    # sanity check: every line must be fully covered by the lexicon
    n = 0
    for _cat, _i, t in all_reaction_ids():
        phonemes(t)
        n += 1
    for sc in AMBIENT:
        for t in sc["lines"]:
            phonemes(t)
            n += 1
    print("all", n, "lines covered by lexicon")
