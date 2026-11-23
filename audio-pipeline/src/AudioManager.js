// @ts-check
/**
 * WAHALA! AudioManager — dependency-free Web Audio engine for the game.
 *
 * Isolated deliverable of the audio workstream: nothing in the gameplay code needs to change
 * to adopt it except calling the small public API below (see docs/audio/AUDIO_INTEGRATION_PLAN.md).
 *
 * Graph:   sources -> [cue/stem gains] -> musicDuck -> music ─┐
 *          sfx / ui / danger one-shots ------------> sfx ─────┤
 *          ambience ----------------------------> ambience ───┼-> master -> limiter -> destination
 *          voice (Pidgin lines, future) ------------> voice ──┘
 *
 * Guarantees implemented here (each is covered by tests/audio.spec.mjs):
 *  - mobile unlock on first gesture (resume + silent buffer + iOS audio-session hint); play requests
 *    made before unlock are remembered (music) or dropped (sfx), never throw
 *  - per-bus volume + master mute, persisted, applied with ramps (no zipper noise)
 *  - music duck for danger/explosion cues so gameplay warnings stay intelligible
 *  - voice limiting with priority stealing, per-id cooldown (chain reactions cannot pile up)
 *  - stem-synced adaptive music (all stems start on the same clock tick)
 *  - epoch tokens: anything still decoding when stopAll()/stopMusic() is called never starts
 *  - tab hidden => suspend; visible => resume; pagehide => stopAll
 */

const STORE_KEY = "wahala.audio.v1";
const DEFAULT_SETTINGS = { master: 1.0, music: 0.7, sfx: 0.9, ambience: 0.6, voice: 1.0, muted: false };
const GLOBAL_VOICE_CAP = 24;

/** @typedef {{ id:string, node:AudioBufferSourceNode, gain:GainNode, prio:number, t0:number, key?:string, group:string }} Voice */

export class AudioManager {
  /**
   * @param {object} opts
   * @param {string} opts.baseUrl            e.g. "/audio/"
   * @param {any}    opts.manifest           runtime manifest (see audio-pipeline/src/audio-manifest.json)
   * @param {Storage|null} [opts.storage]    defaults to localStorage (guarded)
   * @param {typeof AudioContext} [opts.AudioContextClass]
   * @param {typeof fetch} [opts.fetchFn]
   * @param {string[]} [opts.formats]        override format preference, e.g. ["m4a"]
   */
  constructor(opts) {
    this.baseUrl = opts.baseUrl.endsWith("/") ? opts.baseUrl : opts.baseUrl + "/";
    this.manifest = opts.manifest;
    this.fetchFn = opts.fetchFn || ((...a) => fetch(...a));
    this.AC = opts.AudioContextClass || (typeof window !== "undefined" ? window.AudioContext || /** @type {any} */ (window).webkitAudioContext : undefined);
    this.storage = opts.storage !== undefined ? opts.storage : this._safeStorage();
    this.format = this._pickFormat(opts.formats);
    this.settings = { ...DEFAULT_SETTINGS, ...this._loadSettings() };

    /** @type {AudioContext|null} */ this.ctx = null;
    this.unlocked = false;
    this.epoch = 0; // bumped by stopAll / stopMusic / new music => invalidates in-flight async starts
    /** @type {Map<string, AudioBuffer>} */ this.buffers = new Map();
    /** @type {Map<string, Promise<AudioBuffer|null>>} */ this.loading = new Map();
    /** @type {Set<Voice>} */ this.voices = new Set();
    /** @type {Map<string, Voice>} */ this.loops = new Map();
    this.lastPlayed = new Map();
    this.music = null; // { id, epoch, t0, bar, stems:{name:GainNode}, cueGain, sources:[] }
    this.pendingMusic = null; // request made before unlock
    this.intensity = 0;
    this._duck = { until: 0, level: 1 };
    this._hiddenSuspended = false;
    this.stats = { sfxPlayed: 0, sfxDropped: 0, sfxStolen: 0, loadsFailed: 0 };
  }

  // ------------------------------------------------------------------ setup / unlock
  /** Call once at boot. Attaches one-shot gesture listeners that unlock audio on mobile/desktop. */
  installUnlock(target = typeof document !== "undefined" ? document : null) {
    if (!target) return;
    const events = ["pointerdown", "touchend", "click", "keydown"];
    const handler = () => {
      this.unlock().then((ok) => {
        if (ok) events.forEach((e) => target.removeEventListener(e, handler, true));
      });
    };
    events.forEach((e) => target.addEventListener(e, handler, true));
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => this._onVisibility());
      if (typeof window !== "undefined") window.addEventListener("pagehide", () => this.stopAll({ fade: 0 }));
    }
  }

  /** @returns {Promise<boolean>} true when the context is running */
  async unlock() {
    if (!this.AC) return false;
    try {
      if (!this.ctx) this._buildGraph();
      const ctx = /** @type {AudioContext} */ (this.ctx);
      // iOS: treat as media playback (works even with the ring/silent switch on, Safari >= 16.4)
      try { const as = /** @type {any} */ (navigator).audioSession; if (as) as.type = "playback"; } catch (_) {}
      if (ctx.state !== "running") await ctx.resume();
      // the classic iOS unlock: start a 1-sample silent buffer inside the gesture
      const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
      this.unlocked = ctx.state === "running";
      if (this.unlocked && this.pendingMusic) {
        const p = this.pendingMusic; this.pendingMusic = null;
        this.playMusic(p.id, p.opts);
      }
      return this.unlocked;
    } catch (_) {
      return false;
    }
  }

  _buildGraph() {
    const ctx = (this.ctx = new /** @type {any} */ (this.AC)({ latencyHint: "interactive" }));
    ctx.addEventListener?.("statechange", () => { this.unlocked = ctx.state === "running"; });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 14;
    limiter.attack.value = 0.003; limiter.release.value = 0.12;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(limiter);
    this.bus = {};
    for (const n of ["music", "sfx", "ambience", "voice"]) {
      this.bus[n] = ctx.createGain(); this.bus[n].connect(this.master);
    }
    this.musicDuck = ctx.createGain(); this.musicDuck.connect(this.bus.music);
    this.ambDuck = ctx.createGain(); this.ambDuck.connect(this.bus.ambience);
    this._applySettings(0);
  }

  _onVisibility() {
    if (!this.ctx || typeof document === "undefined") return;
    if (document.hidden) {
      if (this.ctx.state === "running") { this._hiddenSuspended = true; this.ctx.suspend(); }
    } else if (this._hiddenSuspended) {
      this._hiddenSuspended = false; this.ctx.resume();
    } else if (/** @type {any} */ (this.ctx.state) === "interrupted") {
      this.ctx.resume();
    }
  }

  // ------------------------------------------------------------------ settings
  _safeStorage() { try { return typeof localStorage !== "undefined" ? localStorage : null; } catch (_) { return null; } }
  _loadSettings() { try { return JSON.parse(this.storage?.getItem(STORE_KEY) || "{}"); } catch (_) { return {}; } }
  _saveSettings() { try { this.storage?.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch (_) {} }

  _applySettings(ramp = 0.05) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.settings;
    const set = (/** @type {GainNode} */ g, /** @type {number} */ v) => { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v, t, ramp ? ramp / 3 : 0.001); };
    set(this.master, s.muted ? 0 : s.master);
    for (const n of ["music", "sfx", "ambience", "voice"]) set(this.bus[n], s[n]);
  }

  /** @param {"master"|"music"|"sfx"|"ambience"|"voice"} bus @param {number} v 0..1 */
  setVolume(bus, v) { this.settings[bus] = Math.min(1, Math.max(0, +v || 0)); this._applySettings(); this._saveSettings(); }
  getVolume(bus) { return this.settings[bus]; }
  setMuted(m) { this.settings.muted = !!m; this._applySettings(0.04); this._saveSettings(); }
  isMuted() { return this.settings.muted; }

  // ------------------------------------------------------------------ loading
  _pickFormat(force) {
    const prefer = force || ["ogg", "m4a"];
    try {
      const a = document.createElement("audio");
      const ok = { ogg: a.canPlayType('audio/ogg; codecs="opus"'), m4a: a.canPlayType('audio/mp4; codecs="mp4a.40.2"') };
      for (const f of prefer) if (ok[f]) return f;
    } catch (_) {}
    return prefer[prefer.length - 1];
  }

  _url(id) {
    const m = this.manifest.assets[id];
    if (!m) throw new Error("unknown audio asset: " + id);
    return `${this.baseUrl}${m.path}.${this.format}`;
  }

  /** Fetch + decode one asset (cached, de-duplicated). Resolves null on failure — never rejects. */
  load(id) {
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id) || null);
    if (this.loading.has(id)) return /** @type {Promise<AudioBuffer|null>} */ (this.loading.get(id));
    const p = (async () => {
      try {
        if (!this.ctx) this._buildGraph(); // contexts may be created suspended before unlock; decoding still works
        const res = await this.fetchFn(this._url(id));
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.arrayBuffer();
        const buf = await new Promise((ok, no) => /** @type {AudioContext} */ (this.ctx).decodeAudioData(data, ok, no)); // callback form: Safari
        this.buffers.set(id, /** @type {AudioBuffer} */ (buf));
        return /** @type {AudioBuffer} */ (buf);
      } catch (e) {
        this.stats.loadsFailed++;
        return null;
      } finally {
        this.loading.delete(id);
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  /** @param {string} group name from manifest.groups ("boot" | "menu" | "match" | ...) */
  async preload(group) { await Promise.all((this.manifest.groups[group] || []).map((id) => this.load(id))); }
  /** Free decoded PCM (decoded stereo music is ~13 MB per 34 s cue). */
  release(group) { for (const id of this.manifest.groups[group] || []) this.buffers.delete(id); }

  // ------------------------------------------------------------------ music
  /**
   * @param {string} cueId  key of manifest.music
   * @param {{fadeIn?:number, intensity?:number, quantize?:"bar"|null, volume?:number}} [opts]
   */
  async playMusic(cueId, opts = {}) {
    if (!this.unlocked) { this.pendingMusic = { id: cueId, opts }; return false; }
    const cue = this.manifest.music[cueId];
    if (!cue) return false;
    if (this.music && this.music.id === cueId) { if (opts.intensity != null) this.setIntensity(opts.intensity); return true; }
    const epoch = ++this.epoch;
    const bufs = await Promise.all(Object.values(cue.stems).map((id) => this.load(/** @type {string} */ (id))));
    if (epoch !== this.epoch || !this.unlocked || bufs.some((b) => !b)) return false; // superseded / stopped while decoding
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const fadeIn = opts.fadeIn ?? 0.8;
    let t0 = ctx.currentTime + 0.06;
    const prev = this.music;
    if (prev && opts.quantize === "bar") {
      const e = t0 - prev.t0, bar = prev.bar;
      t0 = prev.t0 + Math.ceil(e / bar) * bar;
    }
    const cueGain = ctx.createGain();
    cueGain.gain.setValueAtTime(0, ctx.currentTime);
    cueGain.gain.setValueAtTime(0, t0);
    cueGain.gain.linearRampToValueAtTime(opts.volume ?? 1, t0 + Math.max(fadeIn, 0.01));
    cueGain.connect(this.musicDuck);
    const level = opts.intensity ?? 0;
    const stems = {}, sources = [];
    Object.keys(cue.stems).forEach((name, i) => {
      const g = ctx.createGain();
      g.gain.value = cue.layers ? (cue.layers[level]?.[name] ?? 0) : 1;
      g.connect(cueGain);
      const s = ctx.createBufferSource();
      s.buffer = /** @type {AudioBuffer} */ (bufs[i]);
      s.loop = !!cue.loop;
      if (cue.loop) { s.loopStart = 0; s.loopEnd = /** @type {AudioBuffer} */ (bufs[i]).duration; }
      s.connect(g); s.start(t0);
      stems[name] = g; sources.push(s);
    });
    if (prev) this._fadeOutMusic(prev, Math.max(0.25, fadeIn * 0.8), t0);
    this.music = { id: cueId, epoch, t0, bar: this.manifest.barSeconds, stems, cueGain, sources, cue };
    this.intensity = level;
    return true;
  }

  _fadeOutMusic(m, fade, at) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const t = Math.max(ctx.currentTime, at ?? 0);
    m.cueGain.gain.cancelScheduledValues(ctx.currentTime);
    m.cueGain.gain.setValueAtTime(m.cueGain.gain.value, t);
    m.cueGain.gain.linearRampToValueAtTime(0, t + fade);
    for (const s of m.sources) { try { s.stop(t + fade + 0.05); } catch (_) {} }
    setTimeout(() => { try { m.cueGain.disconnect(); } catch (_) {} }, (t - ctx.currentTime + fade + 0.2) * 1000);
  }

  /** Beat-synced adaptive layers: 0 base, 1 +percussion, 2 +hype (last 30 s / Sudden Death). */
  setIntensity(level, { fade = 1.5 } = {}) {
    this.intensity = level;
    const m = this.music;
    if (!m || !m.cue.layers || !this.ctx) return;
    const L = m.cue.layers[Math.max(0, Math.min(level, m.cue.layers.length - 1))];
    const t = this.ctx.currentTime;
    for (const [name, g] of Object.entries(m.stems)) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(L[name] ?? 0, t, fade / 3);
    }
  }

  stopMusic({ fade = 0.6 } = {}) {
    this.epoch++; this.pendingMusic = null;
    if (this.music && this.ctx) { this._fadeOutMusic(this.music, fade); this.music = null; }
  }

  /** One-shot musical stinger (logo sting, victory, defeat). Ducks the bed unless `stopBed`. */
  async playStinger(id, { stopBed = true, volume = 1 } = {}) {
    if (!this.unlocked) return null;
    if (stopBed) this.stopMusic({ fade: 0.25 });
    const epoch = this.epoch;
    const buf = await this.load(id);
    if (!buf || epoch !== this.epoch || !this.ctx) return null;
    const v = this._voice(id, buf, this.bus.music, { volume, group: "stinger", prio: 100 });
    return v ? { stop: () => this._kill(v, 0.05), duration: buf.duration } : null;
  }

  // ------------------------------------------------------------------ SFX
  /**
   * @param {string} id sfx id
   * @param {{volume?:number, rate?:number, pan?:number, distance?:number, key?:string}} [o]
   */
  sfx(id, o = {}) {
    if (!this.unlocked || !this.ctx || this.settings.muted) { this.stats.sfxDropped++; return null; }
    const meta = this.manifest.assets[id];
    const buf = this.buffers.get(id);
    if (!meta || !buf) { if (meta) this.load(id); this.stats.sfxDropped++; return null; } // never block gameplay on a load
    const now = this.ctx.currentTime;
    const cd = meta.cooldown ?? 0.03;
    if (now - (this.lastPlayed.get(id) ?? -1) < cd) { this.stats.sfxDropped++; return null; }
    const same = [...this.voices].filter((v) => v.id === id);
    const prio = meta.priority ?? 50;
    if (same.length >= (meta.maxVoices ?? 3)) {
      const victim = same.sort((a, b) => a.t0 - b.t0)[0];
      this._kill(victim, 0.02); this.stats.sfxStolen++;
    }
    if (this.voices.size >= GLOBAL_VOICE_CAP) {
      const low = [...this.voices].filter((v) => v.group !== "loop").sort((a, b) => a.prio - b.prio || a.t0 - b.t0)[0];
      if (!low || low.prio > prio) { this.stats.sfxDropped++; return null; } // quieter, less important sound loses
      this._kill(low, 0.02); this.stats.sfxStolen++;
    }
    const cat = meta.category;
    let rate = o.rate ?? 1;
    if (meta.variance && cat !== "danger") rate *= 1 + (Math.random() * 2 - 1) * meta.variance; // danger cues stay identical => recognisable
    const v = this._voice(id, buf, this.bus.sfx, { volume: o.volume ?? 1, rate, pan: o.pan, distance: o.distance, prio, group: cat, key: o.key });
    if (!v) return null;
    this.lastPlayed.set(id, now);
    this.stats.sfxPlayed++;
    const duck = this.manifest.duck?.[cat];
    if (duck) this.duck(duck.music, duck.hold ?? buf.duration, duck.release ?? 0.4, duck.ambience ?? duck.music);
    return { stop: () => this._kill(v, 0.03) };
  }

  /** Looping sfx / ambience (generator fuse, arena bed). Same key => replaces the previous loop. */
  startLoop(id, { key = id, volume = 1, rate = 1, fade = 0.3, bus = "sfx" } = {}) {
    if (!this.unlocked || !this.ctx) return null;
    const buf = this.buffers.get(id);
    if (!buf) { this.load(id); return null; }
    this.stopLoop(key, { fade: 0.05 });
    const dest = bus === "ambience" ? this.ambDuck : this.bus.sfx;
    const meta = this.manifest.assets[id];
    const v = this._voice(id, buf, dest, { volume: 0, rate, prio: meta.priority ?? 50, group: "loop", key, loop: true });
    if (!v) return null;
    const t = this.ctx.currentTime;
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(0, t);
    v.gain.gain.linearRampToValueAtTime(volume, t + fade);
    this.loops.set(key, v);
    return {
      stop: (f = 0.15) => this.stopLoop(key, { fade: f }),
      setRate: (r, ramp = 0.3) => v.node.playbackRate.linearRampToValueAtTime(r, /** @type {AudioContext} */ (this.ctx).currentTime + ramp),
    };
  }
  stopLoop(key, { fade = 0.15 } = {}) { const v = this.loops.get(key); if (v) { this.loops.delete(key); this._kill(v, fade); } }

  startAmbience(id = "amb_lagos", { fade = 1.5, volume = 1 } = {}) { return this.startLoop(id, { key: "ambience", bus: "ambience", fade, volume }); }
  stopAmbience(fade = 1.0) { this.stopLoop("ambience", { fade }); }

  /** Map a gameplay event name to its cue via manifest.events. Unknown events are ignored (and counted). */
  event(name, payload = {}) {
    const e = this.manifest.events?.[name];
    if (!e) { this.stats.sfxDropped++; return null; }
    if (e.sfx) return this.sfx(e.sfx, { ...payload, volume: (payload.volume ?? 1) * (e.volume ?? 1) });
    if (e.loop) return this.startLoop(e.loop, { key: (e.key || e.loop).replace("{id}", payload.id ?? ""), volume: e.volume ?? 1, rate: payload.rate ?? 1 });
    if (e.stopLoop) return this.stopLoop(e.stopLoop.replace("{id}", payload.id ?? ""));
    if (e.stinger) return this.playStinger(e.stinger);
    if (e.music) return this.playMusic(e.music, { intensity: e.intensity ?? 0, ...payload });
    if (e.intensity != null) return this.setIntensity(e.intensity);
    return null;
  }

  // ------------------------------------------------------------------ ducking
  /** Pull the music (and bed) down so a gameplay cue is intelligible. level = linear gain target. */
  duck(level = 0.5, hold = 0.5, release = 0.4, ambLevel = level) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const until = t + hold;
    if (until < this._duck.until && level >= this._duck.level) return; // already ducked deeper & longer
    this._duck = { until: Math.max(until, this._duck.until), level: Math.min(level, t < this._duck.until ? this._duck.level : 1) };
    for (const [g, lv] of /** @type {[GainNode, number][]} */ ([[this.musicDuck, this._duck.level], [this.ambDuck, Math.min(ambLevel, this._duck.level)]])) {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(lv, t, 0.012);
      g.gain.setTargetAtTime(1, this._duck.until, release / 3);
    }
  }

  // ------------------------------------------------------------------ plumbing
  /** @returns {Voice|null} */
  _voice(id, buf, dest, o) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = !!o.loop; src.playbackRate.value = o.rate ?? 1;
    const g = ctx.createGain(); g.gain.value = o.volume ?? 1;
    let tail = /** @type {AudioNode} */ (g);
    src.connect(g);
    if (o.distance != null && o.distance > 0) { // far explosions: quieter + darker
      const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 18000 * Math.pow(0.12, Math.min(1, o.distance));
      g.gain.value *= 1 - 0.65 * Math.min(1, o.distance); g.connect(f); tail = f;
    }
    if (o.pan != null && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, o.pan)); tail.connect(p); tail = p; }
    tail.connect(dest);
    /** @type {Voice} */
    const v = { id, node: src, gain: g, prio: o.prio ?? 50, t0: ctx.currentTime, key: o.key, group: o.group || "sfx" };
    src.onended = () => { this.voices.delete(v); try { tail.disconnect(); g.disconnect(); } catch (_) {} };
    this.voices.add(v);
    src.start();
    return v;
  }

  _kill(v, fade = 0.03) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime;
    try { v.gain.gain.cancelScheduledValues(t); v.gain.gain.setValueAtTime(v.gain.gain.value, t); v.gain.gain.linearRampToValueAtTime(0, t + fade); v.node.stop(t + fade + 0.01); } catch (_) {}
  }

  /** Hard reset for match restart / scene change / navigation: nothing may leak into the next screen. */
  stopAll({ fade = 0.05 } = {}) {
    this.epoch++; this.pendingMusic = null;
    for (const v of [...this.voices]) this._kill(v, fade);
    this.loops.clear();
    if (this.music) { this._fadeOutMusic(this.music, Math.max(fade, 0.02)); this.music = null; }
    if (this.ctx) { // reset duck so the next screen's music isn't born quiet
      const t = this.ctx.currentTime;
      for (const g of [this.musicDuck, this.ambDuck]) { g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(1, t, 0.02); }
      this._duck = { until: 0, level: 1 };
    }
  }

  getDebugState() {
    return {
      state: this.ctx?.state ?? "none", unlocked: this.unlocked, format: this.format, epoch: this.epoch,
      voices: this.voices.size, loops: this.loops.size, music: this.music?.id ?? null, intensity: this.intensity,
      pendingMusic: this.pendingMusic?.id ?? null, buffers: this.buffers.size, settings: { ...this.settings },
      masterGain: this.master?.gain.value, musicDuckGain: this.musicDuck?.gain.value, stats: { ...this.stats },
    };
  }
}
