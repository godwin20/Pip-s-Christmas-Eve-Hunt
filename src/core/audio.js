// All of the game's sound, synthesised live with WebAudio (no audio files).
//
//   sfx.unlock()            call from the first user gesture (safe to call on every gesture)
//   sfx.play(name, opts?)   one-shot effect; silent no-op before unlock / when sfx is off
//   sfx.startMusic()        gentle looping music-box medley (starts after unlock if called early)
//   sfx.stopMusic()
//   sfx.setEnabled(bool) / setMusicEnabled(bool) / setVoiceEnabled(bool)
//   sfx.speak(text)         speechSynthesis in a silly high voice
//
// Every public method is wrapped so it never throws.

const SOUND_NAMES = [
  'bang', 'pop', 'boing', 'blip', 'coin', 'jingle', 'sadTrombone', 'hoho', 'bark', 'whoosh',
  'click', 'buy', 'error', 'unlock', 'disco', 'footstep', 'slide', 'snowball', 'tick',
];

const MASTER_VOL = 0.85;
const SFX_VOL = 0.9;
const MUSIC_VOL = 0.45; // the music bus is quiet on purpose: it sits under everything
const E = 0.0001; // "silence" for exponential ramps (they cannot reach 0)

// Minimum seconds between two plays of the same sound, so bursts don't stack up.
const MIN_GAP = {
  footstep: 0.07, tick: 0.05, blip: 0.08, coin: 0.03, click: 0.025, jingle: 0.1, bark: 0.25,
  whoosh: 0.08, slide: 0.2, snowball: 0.03, pop: 0.03, bang: 0.05, boing: 0.1, hoho: 0.6,
  sadTrombone: 0.5, unlock: 0.4, buy: 0.08, error: 0.12, disco: 0.5,
};

const settings = { sfx: true, music: true, voice: true };

let ctx = null;
let master = null;
let sfxBus = null;
let musicOut = null;
let noiseBuf = null;
// Wall-clock ms at which a resume was requested and the audio clock is not
// running yet (0 = none). Sounds asked for during that short window are
// scheduled so the very first gesture's sound is heard. If the browser refuses
// to start (no real user activation yet, e.g. the first key was Escape) the
// window expires, so sounds are dropped instead of piling up on the frozen
// clock and bursting out together on the next click.
let pendingSince = 0;
const PENDING_GRACE_MS = 600;
let listenersAdded = false;
let musicWanted = false;
// Set by an explicit stopMusic(). Until then, switching the music setting from
// off to on counts as asking for music: main.js only calls startMusic() when
// the setting is already on, so a player who boots with music off and turns it
// on from the title or pause screen would otherwise hear nothing until the
// next night starts.
let musicStopped = false;
let music = null; // active music session
let disco = null; // active disco session
let collector = null; // when set, every new source is pushed here (disco uses it to stop early)
let tickToggle = false;
const lastPlayed = Object.create(null);
const speech = { token: 0, speaking: false, safety: 0, defer: 0, voice: null, voicesHooked: false, utterances: [] };

const noop = () => {};

function mtof(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function quiet(promise) {
  if (promise && typeof promise.catch === 'function') promise.catch(noop);
}

function isRunning() {
  return !!ctx && ctx.state === 'running';
}

function nowMs() {
  const perf = globalThis.performance;
  return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
}

// True while a resume() is in flight and young enough that the clock should
// start any moment (see pendingSince).
function clockStarting() {
  return pendingSince > 0 && nowMs() - pendingSince < PENDING_GRACE_MS;
}

// ---------------------------------------------------------------- context setup

function ensureContext() {
  if (ctx) return true;
  const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctor) return false;
  try {
    ctx = new Ctor({ latencyHint: 'interactive' });
  } catch {
    try {
      ctx = new Ctor();
    } catch {
      ctx = null;
      return false;
    }
  }

  master = ctx.createGain();
  master.gain.value = MASTER_VOL;
  let comp = null;
  try {
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
  } catch {
    comp = null;
  }
  if (comp) {
    master.connect(comp);
    comp.connect(ctx.destination);
  } else {
    master.connect(ctx.destination);
  }

  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOL;
  sfxBus.connect(master);

  musicOut = ctx.createGain();
  musicOut.gain.value = MUSIC_VOL;
  musicOut.connect(master);

  // One second of white noise, looped with random offsets for every noisy sound.
  const len = Math.max(1, Math.floor(ctx.sampleRate || 44100));
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate || 44100);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const onState = () => {
    if (!ctx) return;
    if (ctx.state === 'running') {
      pendingSince = 0;
      if (musicWanted && settings.music && !music) startMusicNow();
    }
  };
  if (typeof ctx.addEventListener === 'function') ctx.addEventListener('statechange', onState);
  else ctx.onstatechange = onState;
  return true;
}

// iOS needs a real (silent) buffer played inside the gesture to fully unlock.
function primeSilentBuffer() {
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.connect(ctx.destination);
    s.onended = () => s.disconnect();
    s.start(0);
  } catch {
    /* ignore */
  }
}

function addGlobalListeners() {
  if (listenersAdded) return;
  listenersAdded = true;
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        try {
          if (document.hidden) {
            pendingSince = 0;
            if (typeof ctx.suspend === 'function') quiet(ctx.suspend());
          } else {
            resumeContext();
          }
        } catch {
          /* ignore */
        }
      });
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      // Re-wake the context after iOS interruptions etc. on any later gesture.
      const wake = () => {
        if (ctx && ctx.state !== 'running' && !(typeof document !== 'undefined' && document.hidden)) resumeContext();
      };
      window.addEventListener('pointerdown', wake, { capture: true, passive: true });
      window.addEventListener('keydown', wake, { capture: true, passive: true });
    }
  } catch {
    /* ignore */
  }
}

function resumeContext() {
  if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return;
  pendingSince = nowMs() || 1;
  try {
    const p = ctx.resume();
    if (p && typeof p.then === 'function') {
      p.then(
        () => {
          pendingSince = 0;
          if (musicWanted && settings.music && !music) startMusicNow();
        },
        () => {
          pendingSince = 0;
        }
      );
    }
  } catch {
    pendingSince = 0;
  }
}

function unlock() {
  if (!ensureContext()) return false;
  addGlobalListeners();
  if (ctx.state !== 'running') {
    resumeContext();
    primeSilentBuffer();
  }
  if (musicWanted && settings.music && !music) startMusicNow();
  return true;
}

// ------------------------------------------------------------- synth building blocks

// Registers a source so it (and the helper nodes that only it feeds) are
// disconnected once it has finished playing.
function track(src, ...nodes) {
  if (collector) collector.push(src);
  src.onended = () => {
    try {
      src.disconnect();
    } catch {
      /* already gone */
    }
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!n) continue;
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  };
}

// Gain envelope: 0 -> peak over `attack`, hold, then exponential fade so the
// whole thing lasts `dur` seconds.
function envGain(t, attack, peak, hold, dur, dest) {
  const g = ctx.createGain();
  // Intrinsic value 0: Chrome can render the first frame of a source that starts
  // exactly on the envelope's first event at the default gain (1.0) -> a click.
  g.gain.value = 0;
  const p = Math.max(E * 2, peak);
  const a = Math.max(0.0005, attack);
  const h = Math.max(0, hold || 0);
  const end = t + Math.max(a + h + 0.01, dur);
  g.gain.setValueAtTime(E, t);
  g.gain.linearRampToValueAtTime(p, t + a);
  if (h > 0) g.gain.setValueAtTime(p, t + a + h);
  g.gain.exponentialRampToValueAtTime(E, end);
  g.connect(dest);
  return g;
}

// Applies [[dt, value], ...] exponential ramps to a frequency param.
function freqRamps(param, t, pts) {
  if (!pts) return;
  for (let i = 0; i < pts.length; i++) param.exponentialRampToValueAtTime(Math.max(1, pts[i][1]), t + Math.max(0.001, pts[i][0]));
}

function makePanner(t, o, dest) {
  if ((o.pan === undefined && o.pan0 === undefined) || typeof ctx.createStereoPanner !== 'function') return null;
  const pn = ctx.createStereoPanner();
  if (o.pan0 !== undefined) {
    pn.pan.setValueAtTime(o.pan0, t);
    pn.pan.linearRampToValueAtTime(o.pan1 ?? -o.pan0, t + (o.dur || 0.3));
  } else {
    pn.pan.setValueAtTime(o.pan, t);
  }
  pn.connect(dest);
  return pn;
}

// Oscillator voice.
// o: { type, f, f1, glide, pts, detune, dur, attack, hold, peak, dest, filter, ff, fq, ffPts, pan|pan0/pan1 }
function tone(t, o) {
  const dur = o.dur || 0.3;
  const dest = o.dest || sfxBus;
  const pn = makePanner(t, o, dest);
  const g = envGain(t, o.attack ?? 0.005, o.peak ?? 0.2, o.hold, dur, pn || dest);
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t);
  if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.glide || dur));
  freqRamps(osc.frequency, t, o.pts);
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);
  let filt = null;
  if (o.filter) {
    filt = ctx.createBiquadFilter();
    filt.type = o.filter;
    filt.frequency.setValueAtTime(o.ff || 1000, t);
    freqRamps(filt.frequency, t, o.ffPts);
    filt.Q.value = o.fq ?? 0.8;
    osc.connect(filt);
    filt.connect(g);
  } else {
    osc.connect(g);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
  track(osc, filt, g, pn);
  return osc;
}

// Filtered noise voice. o: { filter, f, f1, glide, pts, q, dur, attack, hold, peak, dest, pan|pan0/pan1 }
function noise(t, o) {
  const dur = o.dur || 0.2;
  const dest = o.dest || sfxBus;
  const pn = makePanner(t, o, dest);
  const g = envGain(t, o.attack ?? 0.002, o.peak ?? 0.2, o.hold, dur, pn || dest);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = o.filter || 'bandpass';
  filt.frequency.setValueAtTime(o.f || 1000, t);
  if (o.f1) filt.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.glide || dur));
  freqRamps(filt.frequency, t, o.pts);
  filt.Q.value = o.q ?? 1;
  src.connect(filt);
  filt.connect(g);
  src.start(t, Math.random() * 0.9);
  src.stop(t + dur + 0.05);
  track(src, filt, g, pn);
  return src;
}

// Pitch wobble on an oscillator (boing, vibrato).
function vibrato(osc, t, rate, depth0, depth1, dur) {
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(rate, t);
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(Math.max(E, depth0), t);
  lg.gain.exponentialRampToValueAtTime(Math.max(E, depth1), t + dur);
  lfo.connect(lg);
  lg.connect(osc.frequency);
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
  track(lfo, lg);
}

// FM bell: bright metallic attack that melts into a pure tone.
function bell(t, f, dur, peak, dest, ratio = 3.5, bright = 1) {
  const g = envGain(t, 0.002, peak, 0, dur, dest || sfxBus);
  const car = ctx.createOscillator();
  car.frequency.setValueAtTime(f, t);
  const mod = ctx.createOscillator();
  mod.frequency.setValueAtTime(f * ratio, t);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.6 * bright, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.02), t + Math.min(dur, 0.35));
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + Math.min(dur, 0.4) + 0.05); // the shimmer is gone by then
  track(car, g);
  track(mod, mg);
}

// One tiny sleigh-bell shake.
function jingleHit(t, out, peak) {
  noise(t, { filter: 'bandpass', f: rand(6000, 8500), q: 6, dur: 0.08, peak, dest: out, attack: 0.001 });
  const f = rand(3800, 5600);
  tone(t, { f, dur: 0.14, peak: peak * 0.45, attack: 0.001, dest: out });
  tone(t, { f: f * 1.47, dur: 0.09, peak: peak * 0.25, attack: 0.001, dest: out });
}

// Brassy note: saw + square through a "wah" filter.
function brass(t, f, dur, peak, out, o = {}) {
  const cut0 = o.cut0 || 400;
  const cut1 = o.cut1 || 2200;
  const cut2 = o.cut2 || 900;
  const a = Math.min(0.08, dur * 0.3);
  const s = tone(t, {
    type: 'sawtooth', f, f1: o.droop ? f * o.droop : 0, glide: dur, dur, attack: a, hold: dur * 0.55, peak,
    filter: 'lowpass', ff: cut0, fq: o.q ?? 3, ffPts: [[a + 0.02, cut1], [dur, cut2]], dest: out,
  });
  tone(t, { type: 'square', f: f * 1.003, f1: o.droop ? f * o.droop : 0, glide: dur, dur, attack: a, hold: dur * 0.55, peak: peak * 0.35, filter: 'lowpass', ff: cut1 * 0.6, fq: 0.7, dest: out });
  if (o.vib) vibrato(s, t + dur * 0.25, o.vibRate || 5.5, 0.5, f * 0.03, dur * 0.75);
  return s;
}

// ------------------------------------------------------------------- the sounds
// Each generator: (t = start time, out = destination node, p = pitch multiplier)

const COIN_NOTES = [880, 1318.5, 1760];
const JINGLE_SPARKLE = [2093, 2637, 3136, 4186];
const TROMBONE_NOTES = [293.66, 277.18, 261.63, 246.94];
const HO_PITCH = [150, 134, 112];
const HO_START = [0, 0.33, 0.66];
const HO_DUR = [0.25, 0.25, 0.6];
const FANFARE_RUN = [67, 72, 76, 79];
const FANFARE_CHORD = [72, 76, 79, 84];
const FANFARE_SPARKLE = [84, 88, 91, 96, 100];

const SOUNDS = {
  // Christmas cracker SNAP! with a little confetti rustle and a festive ting.
  bang(t, out, p) {
    noise(t, { filter: 'highpass', f: 1200 * p, q: 0.7, attack: 0.0008, dur: 0.07, peak: 0.95, dest: out });
    noise(t, { filter: 'bandpass', f: 2400 * p, f1: 650, q: 1.2, attack: 0.001, dur: 0.26, peak: 0.55, dest: out });
    tone(t, { f: 160 * p, f1: 40, glide: 0.18, dur: 0.24, peak: 0.65, attack: 0.001, dest: out });
    for (let i = 0; i < 4; i++) noise(t + 0.03 + Math.random() * 0.09, { filter: 'highpass', f: 3000, q: 0.7, attack: 0.0005, dur: 0.02, peak: 0.12, dest: out });
    noise(t + 0.05, { filter: 'bandpass', f: 4800, q: 1.8, attack: 0.03, dur: 0.5, peak: 0.07, dest: out, pan0: -0.5, pan1: 0.5 });
    bell(t + 0.14, 1568 * p, 0.6, 0.075, out);
    bell(t + 0.22, 2093 * p, 0.8, 0.065, out);
  },

  // Bow popping off a present: a round "bloop!" plus a squeak.
  pop(t, out, p) {
    tone(t, { f: 300 * p, f1: 1250 * p, glide: 0.06, dur: 0.13, peak: 0.45, attack: 0.002, dest: out });
    noise(t, { filter: 'highpass', f: 1800, q: 0.7, attack: 0.0005, dur: 0.03, peak: 0.25, dest: out });
    tone(t + 0.07, { type: 'triangle', f: 1700 * p, f1: 2500 * p, dur: 0.09, peak: 0.07, dest: out });
  },

  // Jack-in-the-box spring: wobbling pitch that settles.
  boing(t, out, p) {
    const o = tone(t, { f: 150 * p, pts: [[0.1, 430 * p], [0.85, 300 * p]], dur: 0.9, peak: 0.42, attack: 0.008, dest: out });
    vibrato(o, t, 15, 90 * p, 2, 0.85);
    const o2 = tone(t, { type: 'triangle', f: 300 * p, pts: [[0.1, 860 * p], [0.85, 600 * p]], dur: 0.7, peak: 0.12, attack: 0.008, dest: out });
    vibrato(o2, t, 15, 180 * p, 4, 0.65);
    noise(t, { filter: 'lowpass', f: 600, q: 0.8, dur: 0.06, peak: 0.2, dest: out });
  },

  // Radar ping with a soft echo.
  blip(t, out, p) {
    tone(t, { f: 1480 * p, f1: 1320 * p, dur: 0.35, peak: 0.28, attack: 0.003, dest: out });
    tone(t, { type: 'triangle', f: 740 * p, dur: 0.18, peak: 0.07, dest: out });
    tone(t + 0.15, { f: 1480 * p, f1: 1320 * p, dur: 0.3, peak: 0.085, attack: 0.003, dest: out });
  },

  // Sparkly three-note coin pickup.
  coin(t, out, p) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.055;
      tone(tt, { type: 'triangle', f: COIN_NOTES[i] * p, dur: 0.26, peak: 0.17, attack: 0.002, dest: out });
      tone(tt, { type: 'square', f: COIN_NOTES[i] * p, dur: 0.05, peak: 0.03, attack: 0.001, dest: out });
    }
    bell(t + 0.12, 3520 * p, 0.45, 0.035, out);
  },

  // Sleigh bells shaking plus a rising sparkle.
  jingle(t, out, p) {
    for (let i = 0; i < 9; i++) jingleHit(t + i * 0.065 + Math.random() * 0.02, out, 0.11 * (1 - i * 0.06));
    for (let i = 0; i < 4; i++) bell(t + 0.05 + i * 0.09, JINGLE_SPARKLE[i] * p, 0.5, 0.045, out);
  },

  // Wah-wah-wah-waaaah.
  sadTrombone(t, out, p) {
    for (let i = 0; i < 3; i++) brass(t + i * 0.42, TROMBONE_NOTES[i] * p, 0.38, 0.16, out, { cut0: 300, cut1: 1500, cut2: 500 });
    brass(t + 1.26, TROMBONE_NOTES[3] * p, 1.25, 0.17, out, { cut0: 300, cut1: 1500, cut2: 380, vib: true, vibRate: 5, droop: 0.94 });
  },

  // Deep jolly "HO HO HO!" (formant-filtered voice) and a little jingle.
  hoho(t, out, p) {
    // +0.04: each syllable's breathy "h" starts 35 ms early, which must not be in the past
    const s = t + 0.04;
    for (let i = 0; i < 3; i++) hoSyllable(s + HO_START[i], HO_PITCH[i] * p, HO_DUR[i], out);
    jingleHit(s + 1.3, out, 0.06);
    jingleHit(s + 1.38, out, 0.05);
    jingleHit(s + 1.45, out, 0.04);
  },

  // Tiny puppy "yip-yip!"
  bark(t, out, p) {
    for (let k = 0; k < 2; k++) {
      const tt = t + k * 0.15;
      const base = (k ? 840 : 760) * p;
      tone(tt, {
        type: 'sawtooth', f: base * 0.8, pts: [[0.03, base * 1.35], [0.11, base * 0.7]], dur: 0.12, peak: 0.32, attack: 0.004,
        filter: 'bandpass', ff: 1700 * p, fq: 1.4, dest: out,
      });
      tone(tt, { type: 'triangle', f: base * 0.8, pts: [[0.03, base * 1.35], [0.11, base * 0.7]], dur: 0.1, peak: 0.12, attack: 0.004, dest: out });
      noise(tt, { filter: 'bandpass', f: 2600, q: 1, dur: 0.05, peak: 0.08, dest: out });
    }
  },

  // Airy swoosh that sweeps across the stereo field.
  whoosh(t, out, p) {
    noise(t, { filter: 'bandpass', f: 300 * p, pts: [[0.22, 2600 * p], [0.5, 500 * p]], q: 1.3, attack: 0.2, dur: 0.52, peak: 0.38, dest: out, pan0: -0.7, pan1: 0.7 });
    noise(t + 0.05, { filter: 'highpass', f: 4000, q: 0.5, attack: 0.15, dur: 0.35, peak: 0.05, dest: out });
  },

  // Soft UI "tock".
  click(t, out, p) {
    tone(t, { f: 1900 * p, f1: 1250 * p, glide: 0.04, dur: 0.05, peak: 0.26, attack: 0.001, dest: out });
    tone(t, { type: 'triangle', f: 3800 * p, dur: 0.02, peak: 0.045, attack: 0.0005, dest: out });
  },

  // Cash-register "ka-CHING!"
  buy(t, out, p) {
    noise(t, { filter: 'bandpass', f: 3500, q: 3, attack: 0.001, dur: 0.07, peak: 0.28, dest: out });
    tone(t, { f: 140, f1: 70, dur: 0.1, peak: 0.25, attack: 0.001, dest: out });
    noise(t + 0.035, { filter: 'bandpass', f: 5200, q: 4, attack: 0.001, dur: 0.05, peak: 0.18, dest: out });
    bell(t + 0.09, 2093 * p, 0.9, 0.15, out, 3.5, 1.2);
    bell(t + 0.09, 2637 * p, 0.9, 0.09, out);
    bell(t + 0.16, 3136 * p, 0.9, 0.08, out);
    for (let i = 0; i < 4; i++) tone(t + 0.22 + i * 0.045 + Math.random() * 0.02, { type: 'triangle', f: rand(2600, 4000) * p, dur: 0.06, peak: 0.035, dest: out });
  },

  // Soft, friendly "bwom-bwom" (not a harsh buzzer).
  error(t, out, p) {
    tone(t, { type: 'square', f: 220 * p, f1: 205 * p, dur: 0.14, peak: 0.11, attack: 0.006, filter: 'lowpass', ff: 850, fq: 1, dest: out });
    tone(t, { f: 110 * p, dur: 0.14, peak: 0.1, attack: 0.006, dest: out });
    tone(t + 0.17, { type: 'square', f: 175 * p, f1: 150 * p, dur: 0.26, peak: 0.11, attack: 0.006, filter: 'lowpass', ff: 650, fq: 1, dest: out });
    tone(t + 0.17, { f: 87.5 * p, f1: 75 * p, dur: 0.26, peak: 0.1, attack: 0.006, dest: out });
  },

  // Ta-ta-ta-TAAA! fanfare with bells and a cymbal swell.
  unlock(t, out, p) {
    for (let i = 0; i < 4; i++) brass(t + i * 0.1, mtof(FANFARE_RUN[i]) * p, 0.14, 0.12, out, { cut0: 600, cut1: 2600, cut2: 1400, q: 1.5 });
    const ct = t + 0.42;
    for (let i = 0; i < 4; i++) {
      brass(ct, mtof(FANFARE_CHORD[i]) * p, 1.15, 0.075, out, { cut0: 700, cut1: 2800, cut2: 1300, q: 1.2, vib: i === 3, vibRate: 6 });
      tone(ct, { type: 'triangle', f: mtof(FANFARE_CHORD[i]) * p, dur: 1.3, peak: 0.04, attack: 0.02, hold: 0.6, dest: out });
    }
    tone(ct, { f: 98 * p, f1: 80 * p, dur: 0.5, peak: 0.3, attack: 0.003, dest: out });
    noise(ct - 0.2, { filter: 'highpass', f: 6000, q: 0.5, attack: 0.22, dur: 1.3, peak: 0.06, dest: out });
    for (let i = 0; i < 5; i++) bell(ct + 0.06 + i * 0.07, mtof(FANFARE_SPARKLE[i]) * p, 0.7, 0.05, out);
  },

  // Funky ~10 s disco loop (managed separately so it can be stopped early).
  disco(t, out, p, vol) {
    playDisco(t, p, vol);
  },

  // Soft snow crunch, a little different every step.
  footstep(t, out, p) {
    const f = rand(650, 1300) * p;
    noise(t, { filter: 'bandpass', f, f1: f * 0.6, q: 0.9, attack: 0.005, dur: rand(0.08, 0.11), peak: rand(0.22, 0.3), dest: out });
    for (let i = 0; i < 3; i++) noise(t + Math.random() * 0.05, { filter: 'highpass', f: rand(2500, 4500), q: 0.7, attack: 0.0005, dur: 0.018, peak: rand(0.05, 0.09), dest: out });
  },

  // Belly-slide "shhhhff" with a tiny "wheee!" whistle.
  slide(t, out, p) {
    noise(t, { filter: 'lowpass', f: 1800 * p, pts: [[0.7, 550]], q: 0.6, attack: 0.1, dur: 0.75, peak: 0.17, dest: out });
    noise(t, { filter: 'highpass', f: 3500, q: 0.5, attack: 0.08, dur: 0.5, peak: 0.04, dest: out });
    const w = tone(t + 0.05, { type: 'triangle', f: 520 * p, f1: 1100 * p, glide: 0.42, attack: 0.08, dur: 0.55, peak: 0.05, dest: out });
    vibrato(w, t + 0.05, 7, 8, 20, 0.5);
  },

  // Snowball landing: a soft "pfff-thump".
  snowball(t, out, p) {
    tone(t, { f: 190 * p, f1: 52, glide: 0.16, dur: 0.2, peak: 0.42, attack: 0.002, dest: out });
    noise(t, { filter: 'lowpass', f: 1100, pts: [[0.15, 300]], q: 0.7, attack: 0.002, dur: 0.18, peak: 0.33, dest: out });
    noise(t + 0.01, { filter: 'bandpass', f: 2800, q: 1.2, attack: 0.001, dur: 0.06, peak: 0.11, dest: out });
  },

  // Clock tick / tock, alternating.
  tick(t, out, p) {
    tickToggle = !tickToggle;
    const f = (tickToggle ? 2400 : 1750) * p;
    tone(t, { f, f1: f * 0.8, dur: 0.045, peak: 0.3, attack: 0.0008, dest: out });
    noise(t, { filter: 'bandpass', f: f * 2, q: 4, attack: 0.0005, dur: 0.02, peak: 0.22, dest: out });
    tone(t, { type: 'triangle', f: f / 2, dur: 0.055, peak: 0.09, attack: 0.001, dest: out });
  },
};

// One "HO" syllable: buzzy voice source through two vowel formants.
function hoSyllable(t, f, dur, out) {
  noise(Math.max(ctx.currentTime, t - 0.035), { filter: 'bandpass', f: 1400, q: 0.8, attack: 0.01, dur: 0.07, peak: 0.06, dest: out });
  const g = envGain(t, 0.03, 0.55, dur * 0.45, dur, out);
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.setValueAtTime(f * 1.04, t);
  src.frequency.exponentialRampToValueAtTime(f * 0.9, t + dur);
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.frequency.value = 480;
  f1.Q.value = 5;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.frequency.value = 820;
  f2.Q.value = 6;
  const f2g = ctx.createGain();
  f2g.gain.value = 0.55;
  src.connect(f1);
  src.connect(f2);
  f1.connect(g);
  f2.connect(f2g);
  f2g.connect(g);
  src.start(t);
  src.stop(t + dur + 0.05);
  track(src, f1, f2, f2g, g);
  // a warm chest tone underneath (and a little vibrato for jolliness)
  const sub = tone(t, { f: f * 1.04, f1: f * 0.9, glide: dur, dur, attack: 0.03, hold: dur * 0.45, peak: 0.16, dest: out });
  vibrato(sub, t, 6, 1, f * 0.02, dur);
}

// ---------------------------------------------------------------------- disco

const DISCO_BEATS = 20; // 120 BPM -> 10 s
const DISCO_B = 0.5;
const DISCO_PROG = [
  { root: 45, chord: [57, 60, 64, 67] }, // Am7
  { root: 50, chord: [54, 57, 60, 64] }, // D9 (no root)
];
const DISCO_BASS = [0, 12, 0, 12, 0, 12, 10, 12];
// [beat offset within the bar, midi] — a cheeky little synth hook
const DISCO_RIFF = [
  [0, 76], [0.5, 79], [0.75, 76], [1, 74], [1.5, 72], [2, 69], [2.5, 72], [3, 74], [3.25, 76], [3.5, 79],
];

function discoKick(t, out) {
  tone(t, { f: 160, f1: 45, glide: 0.12, dur: 0.28, peak: 0.5, attack: 0.001, dest: out });
  noise(t, { filter: 'highpass', f: 3000, q: 0.7, attack: 0.0005, dur: 0.012, peak: 0.08, dest: out });
}

function discoClap(t, out) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(E, t);
  for (let i = 0; i < 3; i++) {
    const s = t + i * 0.012;
    g.gain.linearRampToValueAtTime(0.22, s + 0.001);
    g.gain.exponentialRampToValueAtTime(0.03, s + 0.011);
  }
  g.gain.linearRampToValueAtTime(0.18, t + 0.037);
  g.gain.exponentialRampToValueAtTime(E, t + 0.2);
  g.connect(out);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = 1400;
  filt.Q.value = 1.2;
  src.connect(filt);
  filt.connect(g);
  src.start(t, Math.random() * 0.9);
  src.stop(t + 0.25);
  track(src, filt, g);
}

function stopDisco(fade = 0.25) {
  if (!disco) return;
  const d = disco;
  disco = null;
  clearTimeout(d.timer);
  if (ctx) {
    const t = ctx.currentTime;
    try {
      d.bus.gain.cancelScheduledValues(t);
      d.bus.gain.setValueAtTime(d.bus.gain.value, t);
      d.bus.gain.linearRampToValueAtTime(0, t + fade);
      const stopAt = t + fade + 0.02;
      for (let i = 0; i < d.srcs.length; i++) {
        try {
          d.srcs[i].stop(stopAt);
        } catch {
          /* already stopped */
        }
      }
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => {
    try {
      d.bus.disconnect();
    } catch {
      /* ignore */
    }
  }, fade * 1000 + 200);
  updateDuck();
}

function playDisco(t0, p, vol = 1) {
  stopDisco(0.06);
  const bus = ctx.createGain();
  bus.gain.value = 0.85 * Math.min(4, vol);
  bus.connect(sfxBus);
  const srcs = [];
  collector = srcs;
  try {
    // opening "wooo" riser
    tone(t0, { type: 'sawtooth', f: 220 * p, f1: 880 * p, glide: 0.45, dur: 0.5, peak: 0.07, attack: 0.05, filter: 'lowpass', ff: 900, ffPts: [[0.45, 4000]], dest: bus });
    for (let beat = 0; beat < DISCO_BEATS; beat++) {
      const bt = t0 + 0.5 + beat * DISCO_B;
      const bar = beat >> 2;
      const pc = DISCO_PROG[bar & 1];
      const inBar = beat & 3;
      discoKick(bt, bus);
      noise(bt, { filter: 'highpass', f: 8000, q: 0.6, attack: 0.0005, dur: 0.03, peak: 0.03, dest: bus });
      noise(bt + DISCO_B / 2, { filter: 'highpass', f: 7000, q: 0.6, attack: 0.001, dur: 0.12, peak: 0.075, dest: bus, pan: 0.25 });
      if (inBar === 1 || inBar === 3) {
        discoClap(bt, bus);
        for (let n = 0; n < pc.chord.length; n++) {
          tone(bt + DISCO_B / 2, {
            type: 'sawtooth', f: mtof(pc.chord[n]) * p, detune: n % 2 ? 6 : -6, dur: 0.16, peak: 0.045, attack: 0.003,
            filter: 'lowpass', ff: 3200, ffPts: [[0.12, 700]], fq: 2, dest: bus, pan: n % 2 ? 0.35 : -0.35,
          });
        }
      }
      for (let e = 0; e < 2; e++) {
        const f = mtof(pc.root + DISCO_BASS[inBar * 2 + e]) * p;
        tone(bt + e * DISCO_B / 2, { type: 'sawtooth', f, dur: DISCO_B * 0.45, peak: 0.16, attack: 0.004, filter: 'lowpass', ff: 300, ffPts: [[0.03, 1500], [DISCO_B * 0.4, 380]], fq: 4, dest: bus });
      }
    }
    // the hook plays over bars 2 and 4
    for (const bar of [1, 3]) {
      const bt = t0 + 0.5 + bar * 4 * DISCO_B;
      for (let i = 0; i < DISCO_RIFF.length; i++) {
        const [off, m] = DISCO_RIFF[i];
        tone(bt + off * DISCO_B, { type: 'square', f: mtof(m) * p, dur: 0.14, peak: 0.05, attack: 0.003, filter: 'lowpass', ff: 2600, fq: 1.5, dest: bus });
      }
    }
    // big finish: chord hit + crash + a sparkle run
    const end = t0 + 0.5 + DISCO_BEATS * DISCO_B;
    discoKick(end, bus);
    const fin = [57, 60, 64, 67, 71];
    for (let i = 0; i < fin.length; i++) {
      tone(end, { type: 'sawtooth', f: mtof(fin[i]) * p, detune: i % 2 ? 7 : -7, dur: 0.9, peak: 0.04, attack: 0.004, hold: 0.2, filter: 'lowpass', ff: 3500, ffPts: [[0.8, 800]], dest: bus });
    }
    noise(end, { filter: 'highpass', f: 5000, q: 0.5, attack: 0.002, dur: 1.2, peak: 0.12, dest: bus });
    const sp = [81, 84, 88, 93];
    for (let i = 0; i < 4; i++) bell(end + 0.05 + i * 0.06, mtof(sp[i]) * p, 0.6, 0.04, bus);
  } finally {
    collector = null;
  }

  const total = 0.5 + DISCO_BEATS * DISCO_B + 1.3;
  disco = {
    bus,
    srcs,
    timer: setTimeout(() => {
      if (disco && disco.bus === bus) stopDisco(0.15);
    }, total * 1000),
  };
  updateDuck();
}

// ---------------------------------------------------------------------- music
// A gentle music-box medley: a little intro, "Jingle Bells" chorus (Pierpont,
// 1857, public domain), an original interlude, "Deck the Halls" (traditional
// Welsh, public domain) and a second original interlude, then round again.

const BPM = 92;
const SPB = 60 / BPM;
const LOOKAHEAD = 1.5;
const K_LEAD = 0;
const K_SPARK = 1;
const K_BASS = 2;
const K_PAD = 3;
const K_SHAKE = 4;

const CHORDS = {
  C: { root: 48, tones: [60, 64, 67] },
  F: { root: 41, tones: [60, 65, 69] },
  G: { root: 43, tones: [59, 62, 67] },
  G7: { root: 43, tones: [59, 65, 67] },
  D7: { root: 50, tones: [60, 62, 66] },
  Am: { root: 45, tones: [60, 64, 69] },
  Em: { root: 40, tones: [59, 64, 67] },
};

const SONG_SECTIONS = [
  {
    // music box "winding up"
    melody: [[72, 1], [76, 1], [79, 1], [84, 1], [83, 1], [79, 1], [74, 1], [71, 1]],
    chords: ['C', 'G'],
    shake: 'backbeat',
  },
  {
    // Jingle Bells (chorus) — public domain
    melody: [
      [76, 1], [76, 1], [76, 2], [76, 1], [76, 1], [76, 2], [76, 1], [79, 1], [72, 1.5], [74, 0.5], [76, 4],
      [77, 1], [77, 1], [77, 1.5], [77, 0.5], [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5],
      [76, 1], [74, 1], [74, 1], [76, 1], [74, 2], [79, 2],
      [76, 1], [76, 1], [76, 2], [76, 1], [76, 1], [76, 2], [76, 1], [79, 1], [72, 1.5], [74, 0.5], [76, 4],
      [77, 1], [77, 1], [77, 1.5], [77, 0.5], [77, 1], [76, 1], [76, 1], [76, 0.5], [76, 0.5],
      [79, 1], [79, 1], [77, 1], [74, 1], [72, 4],
    ],
    chords: ['C', 'C', 'C', 'C', 'F', 'C', 'D7', 'G7', 'C', 'C', 'C', 'C', 'F', 'C', 'G7', 'C'],
    shake: 'eighths',
  },
  {
    // original interlude A
    melody: [
      [76, 1], [79, 1], [84, 2], [83, 1], [81, 1], [76, 2], [77, 1], [81, 1], [84, 1], [81, 1], [79, 3], [74, 1],
      [76, 1], [79, 1], [84, 1], [88, 1], [86, 1], [84, 1], [81, 2], [77, 1], [81, 1], [79, 1], [83, 1], [84, 4],
    ],
    chords: ['C', 'Am', 'F', 'G', 'C', 'Am', ['F', 'G'], 'C'],
    shake: null,
  },
  {
    // Deck the Halls — traditional, public domain
    melody: [
      [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 1], [74, 1], [76, 1], [72, 1],
      [74, 0.5], [76, 0.5], [77, 0.5], [74, 0.5], [76, 1.5], [74, 0.5], [72, 1], [71, 1], [72, 2],
      [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 1], [74, 1], [76, 1], [72, 1],
      [74, 0.5], [76, 0.5], [77, 0.5], [74, 0.5], [76, 1.5], [74, 0.5], [72, 1], [71, 1], [72, 2],
      [74, 1.5], [76, 0.5], [77, 1], [74, 1], [76, 1.5], [77, 0.5], [79, 1], [74, 1],
      [76, 0.5], [78, 0.5], [79, 1], [81, 0.5], [83, 0.5], [84, 1], [83, 1], [81, 1], [79, 2],
      [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 1], [74, 1], [76, 1], [72, 1],
      [81, 0.5], [81, 0.5], [81, 0.5], [81, 0.5], [79, 1.5], [77, 0.5], [76, 1], [74, 1], [72, 2],
    ],
    chords: ['C', 'C', 'G7', ['G', 'C'], 'C', 'C', 'G7', ['G', 'C'], 'G7', 'C', 'G', 'G', 'C', 'C', 'F', ['G', 'C']],
    shake: 'backbeat',
  },
  {
    // original interlude B (a sleepy little lullaby turn before looping)
    melody: [
      [72, 1], [76, 1], [79, 1], [84, 1], [81, 2], [76, 2], [77, 1], [76, 1], [74, 1], [72, 1], [74, 2], [79, 2],
      [76, 1.5], [77, 0.5], [79, 1], [84, 1], [83, 1], [81, 1], [79, 1], [76, 1], [77, 1], [74, 1], [71, 1], [74, 1], [72, 4],
    ],
    chords: ['C', 'Am', 'F', 'G', 'C', ['Am', 'Em'], ['F', 'G'], 'C'],
    shake: 'backbeat',
  },
];

function buildSong(sections) {
  const events = [];
  let base = 0;
  for (const s of sections) {
    const bars = s.chords.length;
    const limit = bars * 4;
    let b = 0;
    for (const [m, d] of s.melody) {
      if (b >= limit) break;
      if (m != null) {
        events.push({ t: base + b, k: K_LEAD, f: mtof(m), d, v: b % 4 === 0 ? 1 : 0.82 });
        if (d >= 2) events.push({ t: base + b, k: K_SPARK, f: mtof(m + 12), d, v: 1 });
      }
      b += d;
    }
    for (let i = 0; i < bars; i++) {
      const c = s.chords[i];
      const halves = Array.isArray(c) ? c : [c];
      const len = 4 / halves.length;
      for (let h = 0; h < halves.length; h++) {
        const ch = CHORDS[halves[h]] || CHORDS.C;
        const t0 = base + i * 4 + h * len;
        events.push({ t: t0, k: K_PAD, fs: ch.tones.map(mtof), d: len, v: 1 });
        events.push({ t: t0, k: K_BASS, f: mtof(ch.root), d: Math.min(2, len), v: 1 });
        if (len >= 4) events.push({ t: t0 + 2, k: K_BASS, f: mtof(ch.root + 7), d: 2, v: 0.85 });
      }
      if (s.shake === 'eighths') {
        for (let e = 0; e < 8; e++) events.push({ t: base + i * 4 + e * 0.5, k: K_SHAKE, v: e % 2 ? 1 : 0.5 });
      } else if (s.shake === 'backbeat') {
        events.push({ t: base + i * 4 + 1, k: K_SHAKE, v: 1 });
        events.push({ t: base + i * 4 + 3, k: K_SHAKE, v: 1 });
      }
    }
    base += limit;
  }
  events.sort((a, b) => a.t - b.t || a.k - b.k);
  return { events, beats: base };
}

const SONG = buildSong(SONG_SECTIONS);

// Small read-only info, handy for debugging / tests.
export const MUSIC_INFO = {
  bpm: BPM,
  loopBeats: SONG.beats,
  loopSeconds: SONG.beats * SPB,
  events: SONG.events.length,
  sounds: SOUND_NAMES.slice(),
};

function musicBox(t, f, dur, peak, dest) {
  const g = envGain(t, 0.004, peak, 0, dur, dest);
  const car = ctx.createOscillator();
  car.frequency.setValueAtTime(f, t);
  const mod = ctx.createOscillator();
  mod.frequency.setValueAtTime(f * 3, t);
  const mg = ctx.createGain();
  mg.gain.setValueAtTime(f * 1.1, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.01), t + 0.25);
  mod.connect(mg);
  mg.connect(car.frequency);
  car.connect(g);
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + 0.3);
  track(car, g);
  track(mod, mg);
}

function padNote(t, f, dur, peak, dest) {
  const g = ctx.createGain();
  g.gain.value = 0;
  g.gain.setValueAtTime(E, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.35);
  g.gain.setValueAtTime(peak, t + Math.max(0.36, dur));
  g.gain.exponentialRampToValueAtTime(E, t + Math.max(0.36, dur) + 0.6);
  g.connect(dest);
  const stopAt = t + Math.max(0.36, dur) + 0.65;
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.detune.setValueAtTime(i ? 7 : -7, t);
    o.connect(g);
    o.start(t);
    o.stop(stopAt);
    track(o, i ? g : null);
  }
}

function playMusicEvent(e, t, m) {
  switch (e.k) {
    case K_LEAD:
      musicBox(t, e.f, Math.min(2.4, e.d * SPB + 0.6), 0.15 * e.v, m.bus);
      break;
    case K_SPARK:
      bell(t + 0.01, e.f, 1.6, 0.03, m.bus, 3.5, 0.6);
      break;
    case K_BASS:
      tone(t, { type: 'triangle', f: e.f, dur: e.d * SPB * 0.95, peak: 0.13 * e.v, attack: 0.012, dest: m.bus });
      break;
    case K_PAD:
      for (let i = 0; i < e.fs.length; i++) padNote(t, e.fs[i], e.d * SPB, 0.026, m.pad);
      break;
    case K_SHAKE:
      noise(t, { filter: 'highpass', f: 6500, q: 0.8, attack: 0.002, dur: 0.06, peak: 0.022 * e.v, dest: m.bus });
      tone(t, { f: rand(4800, 6200), dur: 0.05, peak: 0.005 * e.v, attack: 0.001, dest: m.bus });
      break;
    default:
      break;
  }
}

function musicTick() {
  const m = music;
  if (!m || !ctx || ctx.state !== 'running') return;
  try {
    const ev = SONG.events;
    if (!ev.length) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD;
    const loopDur = SONG.beats * SPB;
    // Fell far behind (long suspend): jump forward whole loops.
    if (m.loopStart + loopDur < now) {
      m.loopStart += Math.floor((now - m.loopStart) / loopDur) * loopDur;
      m.idx = 0;
    }
    for (let guard = 0; guard < 4000; guard++) {
      const e = ev[m.idx];
      const t = m.loopStart + e.t * SPB;
      if (t > horizon) break;
      if (t >= now - 0.03) {
        const human = e.k === K_LEAD ? (Math.random() - 0.5) * 0.012 : 0;
        try {
          playMusicEvent(e, Math.max(now + 0.005, t + human), m);
        } catch (err) {
          // skip just this note; never retry it forever and stall the tune
          if (sfx.debug) console.warn('[audio] music event', err);
        }
      }
      m.idx++;
      if (m.idx >= ev.length) {
        m.idx = 0;
        m.loopStart += loopDur;
      }
    }
  } catch {
    /* never let the scheduler die noisily */
  }
}

function startMusicNow() {
  if (!ctx || music || !settings.music || !musicWanted) return;
  const t = ctx.currentTime;
  const bus = ctx.createGain();
  bus.gain.value = 0;
  bus.gain.setValueAtTime(E, t);
  bus.gain.exponentialRampToValueAtTime(1, t + 2.5);
  bus.connect(musicOut);
  const pad = ctx.createBiquadFilter();
  pad.type = 'lowpass';
  pad.frequency.value = 1500;
  pad.Q.value = 0.5;
  pad.connect(bus);
  music = { bus, pad, idx: 0, loopStart: t + 0.25, timer: 0 };
  music.timer = setInterval(musicTick, 100);
  musicTick();
}

function stopMusicNow(fade = 0.8) {
  if (!music) return;
  const m = music;
  music = null;
  clearInterval(m.timer);
  if (ctx) {
    try {
      const t = ctx.currentTime;
      m.bus.gain.cancelScheduledValues(t);
      m.bus.gain.setValueAtTime(Math.max(E, m.bus.gain.value), t);
      m.bus.gain.linearRampToValueAtTime(0, t + fade);
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => {
    try {
      m.bus.disconnect();
      m.pad.disconnect();
    } catch {
      /* ignore */
    }
  }, fade * 1000 + 300);
}

// Music dips under the disco and while the silly voice is talking.
function updateDuck() {
  if (!ctx || !musicOut) return;
  try {
    const duck = (disco ? 0.2 : 1) * (speech.speaking ? 0.4 : 1);
    musicOut.gain.setTargetAtTime(MUSIC_VOL * duck, ctx.currentTime, 0.12);
  } catch {
    /* ignore */
  }
}

// --------------------------------------------------------------------- speech

const PREFERRED_VOICES = [
  'Google UK English Female', 'Samantha', 'Karen', 'Moira', 'Tessa', 'Fiona',
  'Microsoft Libby', 'Microsoft Sonia', 'Microsoft Hazel', 'Microsoft Zira', 'Google US English',
];

function pickVoice(synth) {
  let voices = [];
  try {
    voices = synth.getVoices() || [];
  } catch {
    voices = [];
  }
  if (!voices.length) return null;
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((x) => x && x.name && x.name.indexOf(name) === 0);
    if (v) return v;
  }
  return voices.find((x) => x && x.lang && /^en[-_]GB/i.test(x.lang)) || voices.find((x) => x && x.lang && /^en/i.test(x.lang)) || null;
}

function cleanSpeech(text) {
  let s = String(text == null ? '' : text);
  // emoji, flags, skin tones, keycaps, joiners and variation selectors
  s = s
    .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, ' ')
    .replace(/[\u200d\ufe0e\ufe0f\u20e3]/g, '');
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return s;
}

// Chrome cuts off very long utterances, so speak in sentence-sized chunks.
function splitChunks(s) {
  const parts = s.match(/[^.!?]+[.!?]*["'”’)]*\s*/g) || [s];
  const out = [];
  let cur = '';
  for (const part of parts) {
    if (cur && (cur + part).length > 180) {
      out.push(cur.trim());
      cur = '';
    }
    cur += part;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function setSpeaking(on) {
  if (speech.speaking === on) return;
  speech.speaking = on;
  updateDuck();
}

// Returns true if the browser was still busy with earlier speech.
function cancelSpeech() {
  speech.token++;
  clearTimeout(speech.safety);
  // a replacement still waiting out an earlier cancel counts as busy too
  let busy = !!speech.defer;
  clearTimeout(speech.defer);
  speech.defer = 0;
  speech.utterances = [];
  setSpeaking(false);
  try {
    const synth = globalThis.speechSynthesis;
    if (synth) {
      busy = busy || !!(synth.speaking || synth.pending);
      synth.cancel();
    }
  } catch {
    /* ignore */
  }
  return busy;
}

function speak(text) {
  if (!settings.voice) return false;
  const synth = globalThis.speechSynthesis;
  const Utter = globalThis.SpeechSynthesisUtterance;
  if (!synth || typeof Utter !== 'function') return false;
  const clean = cleanSpeech(text);
  if (!clean) return false;

  if (!speech.voicesHooked) {
    speech.voicesHooked = true;
    try {
      const refresh = () => {
        speech.voice = pickVoice(synth);
      };
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', refresh);
      else synth.onvoiceschanged = refresh;
    } catch {
      /* ignore */
    }
  }
  if (!speech.voice) speech.voice = pickVoice(synth);

  const wasBusy = cancelSpeech();
  const token = ++speech.token;
  const chunks = splitChunks(clean);
  const pitch = Math.min(2, 1.6 + (Math.random() - 0.5) * 0.12);
  const done = () => {
    if (token !== speech.token) return;
    clearTimeout(speech.safety);
    speech.utterances = [];
    setSpeaking(false);
  };
  // Safety net in case the browser never fires onend.
  speech.safety = setTimeout(done, 2500 + clean.length * 90);
  // Safari (and some Chrome builds) silently drop an utterance queued in the
  // same tick as cancel() of one that was still talking, so give the cancel a
  // moment. The first ever speak() is never deferred: iOS needs it to happen
  // inside the tap that asked for it.
  if (wasBusy) {
    speech.defer = setTimeout(() => {
      speech.defer = 0;
      try {
        if (token === speech.token && settings.voice) queueUtterances(synth, Utter, chunks, pitch, token, done);
      } catch {
        done();
      }
    }, 70);
  } else {
    queueUtterances(synth, Utter, chunks, pitch, token, done);
  }
  return true;
}

function queueUtterances(synth, Utter, chunks, pitch, token, done) {
  try {
    if (typeof synth.resume === 'function') synth.resume();
  } catch {
    /* ignore */
  }
  // Holding the utterances stops Chrome garbage-collecting them mid-speech,
  // which otherwise loses their onend events.
  speech.utterances = [];
  for (let i = 0; i < chunks.length; i++) {
    const u = new Utter(chunks[i]);
    u.pitch = pitch;
    u.rate = 0.95;
    u.volume = 1;
    if (speech.voice) {
      u.voice = speech.voice;
      u.lang = speech.voice.lang;
    } else {
      u.lang = 'en-GB';
    }
    if (i === 0) {
      u.onstart = () => {
        if (token === speech.token) setSpeaking(true);
      };
    }
    if (i === chunks.length - 1) {
      u.onend = done;
      u.onerror = done;
    }
    speech.utterances.push(u);
    synth.speak(u);
  }
}

// -------------------------------------------------------------------- public API

function play(name, opts) {
  if (!settings.sfx || !ctx || !noiseBuf) return;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(SOUNDS, name)) return;
  const gen = SOUNDS[name];
  // Only schedule when the clock is moving (or about to start after unlock),
  // otherwise sounds pile up and burst out when the tab comes back.
  if (ctx.state !== 'running' && !clockStarting()) return;
  const t = ctx.currentTime + 0.01;
  const gap = MIN_GAP[name] ?? 0.02;
  const last = lastPlayed[name];
  if (last !== undefined && t - last < gap && t >= last) return;
  lastPlayed[name] = t;

  let out = sfxBus;
  const vol = opts && typeof opts.volume === 'number' && isFinite(opts.volume) ? Math.max(0, opts.volume) : 1;
  const pitch = opts && typeof opts.pitch === 'number' && isFinite(opts.pitch) && opts.pitch > 0 ? Math.min(4, Math.max(0.25, opts.pitch)) : 1;
  if (vol === 0) return;
  if (vol !== 1 && name !== 'disco') {
    out = ctx.createGain();
    out.gain.value = Math.min(4, vol);
    out.connect(sfxBus);
    const node = out;
    setTimeout(() => {
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }, 4000);
  }
  gen(t, out, pitch, vol);
}

function safe(fn, fallback) {
  return function (...args) {
    try {
      return fn.apply(this, args);
    } catch (err) {
      if (sfx.debug) console.warn('[audio]', err);
      return fallback;
    }
  };
}

function bool(v) {
  return v === undefined ? true : !!v;
}

export const sfx = {
  debug: false,

  unlock: safe(unlock, false),

  // play(name, { volume = 1, pitch = 1 }?) — names listed in sfx.names
  play: safe(play),

  setEnabled: safe((on) => {
    settings.sfx = bool(on);
    if (!settings.sfx) stopDisco(0.1);
  }),

  setMusicEnabled: safe((on) => {
    const was = settings.music;
    settings.music = bool(on);
    if (!settings.music) {
      stopMusicNow(0.6);
      return;
    }
    if (!was && !musicStopped) musicWanted = true;
    if (musicWanted && isRunning()) startMusicNow();
  }),

  setVoiceEnabled: safe((on) => {
    settings.voice = bool(on);
    if (!settings.voice) cancelSpeech();
  }),

  // Safe to call before unlock(): the music starts as soon as audio is unlocked.
  startMusic: safe(() => {
    musicWanted = true;
    musicStopped = false;
    if (ctx && settings.music && (ctx.state === 'running' || pendingSince > 0)) startMusicNow();
  }),

  stopMusic: safe(() => {
    musicWanted = false;
    musicStopped = true;
    stopMusicNow(0.8);
  }),

  speak: safe(speak, false),

  // ---- extras (not required by the contract) ----
  stopDisco: safe(() => stopDisco(0.25)),
  stopSpeaking: safe(cancelSpeech),
  isUnlocked: () => isRunning(),
  isMusicPlaying: () => !!music,
  names: SOUND_NAMES.slice(),
};

export default sfx;
