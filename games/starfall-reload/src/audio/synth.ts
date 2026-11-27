// Deterministic code-synthesized audio for Starfall Reload.
// Every cue and track is rendered from scratch: FM / pulse / saw oscillators,
// seeded noise and filters. No samples, no external assets, no DOM.

export const SFX_IDS = ["shot", "laser", "halo", "scatter", "enemyShot", "hit", "armorHit", "explodeS", "explodeM", "explodeL", "bossBreak", "playerHit", "playerDie", "bomb", "graze", "reload", "chip", "pickup", "powerUp", "modeSwitch", "warning", "extend", "menuMove", "menuSelect", "coin", "pause", "barrier"] as const;
export type SfxId = (typeof SFX_IDS)[number];
export const MUSIC_IDS = ["title", "area1", "area2", "area3", "boss", "finalBoss", "clear", "gameOver"] as const;
export type MusicId = (typeof MUSIC_IDS)[number];
export interface Rendered {
    sampleRate: number;
    channels: Float32Array[];
    loop: boolean;
}

// ---------------------------------------------------------------------------
// Shared DSP primitives
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const INV_TAU = 1 / TAU;

type Rng = () => number;

function hashSeed(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.codePointAt(i)!;
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function makeRng(seed: number): Rng {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SIN_N = 4096;
const SIN_TABLE = new Float64Array(SIN_N + 1);
for (let i = 0; i <= SIN_N; i++) SIN_TABLE[i] = Math.sin((TAU * i) / SIN_N);

/** Sine of a phase given in cycles (table lookup with linear interpolation). */
function sinc(phase: number): number {
    const x = (phase - Math.floor(phase)) * SIN_N;
    const i = Math.trunc(x);
    const a = SIN_TABLE[i]!;
    return a + (SIN_TABLE[i + 1]! - a) * (x - i);
}

/** PolyBLEP residual for band-limited saw/pulse edges. */
function blep(t: number, dt: number): number {
    if (t < dt) {
        const x = t / dt;
        return x + x - x * x - 1;
    }
    if (t > 1 - dt) {
        const x = (t - 1) / dt;
        return x * x + x + x + 1;
    }
    return 0;
}

/** Band-limited pulse with its DC component removed. */
function pulse(t: number, dt: number, width: number): number {
    let v = t < width ? 1 : -1;
    v += blep(t, dt);
    let t2 = t - width;
    if (t2 < 0) t2 += 1;
    v -= blep(t2, dt);
    return v - (2 * width - 1);
}

function saw(t: number, dt: number): number {
    return 2 * t - 1 - blep(t, dt);
}

/** Smooth saturator (Pade tanh approximation, hard-limited beyond |x| = 3). */
function softClip(x: number): number {
    if (x >= 3) return 1;
    if (x <= -3) return -1;
    const x2 = x * x;
    return (x * (27 + x2)) / (27 + 9 * x2);
}

function midiToHz(midi: number): number {
    return 440 * Math.pow(2, (midi - 69) / 12);
}

const PITCH_CLASS: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };

/** Semitone offset of an accidental: "#" sharpens, "b" flattens, none is natural. */
function accidental(mark: string | undefined): number {
    if (mark === "#") return 1;
    if (mark === "b") return -1;
    return 0;
}

/** "c#4", "bb3", "e5" -> MIDI number (a4 = 69). */
function noteToMidi(name: string): number {
    const m = /^([a-g])([#b])?(\d)$/.exec(name);
    if (!m) throw new Error(`bad note "${name}"`);
    return 12 * (Number(m[3]) + 1) + PITCH_CLASS[m[1]!]! + accidental(m[2]);
}

/** Topology-preserving state-variable filter (lp / bp / hp). */
class Svf {
    private ic1 = 0;
    private ic2 = 0;
    private g = 0;
    private k = 1;
    private a1 = 0;
    private a2 = 0;
    private a3 = 0;

    set(cutoff: number, q: number, sampleRate: number): void {
        const fc = Math.min(Math.max(cutoff, 10), sampleRate * 0.45);
        this.g = Math.tan((Math.PI * fc) / sampleRate);
        this.k = 1 / q;
        this.a1 = 1 / (1 + this.g * (this.g + this.k));
        this.a2 = this.g * this.a1;
        this.a3 = this.g * this.a2;
    }

    run(x: number, mode: FilterMode): number {
        const v3 = x - this.ic2;
        const v1 = this.a1 * this.ic1 + this.a2 * v3;
        const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
        this.ic1 = 2 * v1 - this.ic1;
        this.ic2 = 2 * v2 - this.ic2;
        if (mode === "lp") return v2;
        if (mode === "bp") return v1;
        return x - this.k * v1 - v2;
    }
}

type FilterMode = "lp" | "bp" | "hp";

// ---------------------------------------------------------------------------
// One-shot canvas (SFX and drum hits)
// ---------------------------------------------------------------------------

type Wave = "sine" | "tri" | "saw" | "square" | "pulse25" | "pulse12";

interface EnvOpts {
    /** start time, seconds */
    t?: number;
    dur: number;
    gain: number;
    attack?: number;
    /** exponential decay time constant in seconds; 0 or omitted = sustain */
    decay?: number;
    /** linear fade at the end of the voice, seconds */
    release?: number;
}

interface ToneOpts extends EnvOpts {
    wave: Wave;
    f0: number;
    f1?: number;
    /** sweep time for f0 -> f1, seconds (default: dur) */
    sweep?: number;
    linear?: boolean;
    vibRate?: number;
    vibDepth?: number;
}

interface FmOpts extends EnvOpts {
    f0: number;
    f1?: number;
    sweep?: number;
    ratio: number;
    idx0: number;
    idx1?: number;
    idxTau?: number;
    fb?: number;
}

interface NoiseOpts extends EnvOpts {
    mode: FilterMode;
    c0: number;
    c1?: number;
    sweep?: number;
    q?: number;
}

function oscValue(wave: Wave, t: number, dt: number): number {
    switch (wave) {
        case "sine":
            return sinc(t);
        case "tri":
            return 1 - 4 * Math.abs(t - 0.5);
        case "saw":
            return saw(t, dt);
        case "square":
            return pulse(t, dt, 0.5);
        case "pulse25":
            return pulse(t, dt, 0.25);
        case "pulse12":
            return pulse(t, dt, 0.125);
    }
}

class Canvas {
    readonly sr: number;
    readonly n: number;
    readonly data: Float32Array;
    readonly rng: Rng;

    constructor(sampleRate: number, seconds: number, seed: number) {
        this.sr = sampleRate;
        this.n = Math.max(1, Math.round(seconds * sampleRate));
        this.data = new Float32Array(this.n);
        this.rng = makeRng(seed);
    }

    private span(o: EnvOpts): [number, number] {
        const s0 = Math.round((o.t ?? 0) * this.sr);
        const len = Math.min(Math.round(o.dur * this.sr), this.n - s0);
        return [s0, len];
    }

    private envelope(len: number, o: EnvOpts): Float32Array {
        const sr = this.sr;
        const e = new Float32Array(len);
        const att = Math.max(1, Math.round((o.attack ?? 0.001) * sr));
        const tau = o.decay ?? 0;
        const dc = tau > 0 ? Math.exp(-1 / (tau * sr)) : 1;
        const rel = Math.min(len, Math.max(1, Math.round((o.release ?? 0.004) * sr)));
        let d = 1;
        for (let i = 0; i < len; i++) {
            let v: number;
            if (i < att) v = i / att;
            else {
                v = d;
                d *= dc;
            }
            const k = len - i;
            if (k < rel) v *= k / rel;
            e[i] = v;
        }
        return e;
    }

    tone(o: ToneOpts): void {
        const [s0, len] = this.span(o);
        if (len <= 0) return;
        const sr = this.sr;
        const env = this.envelope(len, o);
        const f1 = o.f1 ?? o.f0;
        const sweepN = Math.max(1, Math.round((o.sweep ?? o.dur) * sr));
        const mul = Math.pow(f1 / o.f0, 1 / sweepN);
        const add = (f1 - o.f0) / sweepN;
        const vr = (o.vibRate ?? 0) / sr;
        const vd = o.vibDepth ?? 0;
        const d = this.data;
        let f = o.f0;
        let ph = 0;
        for (let i = 0; i < len; i++) {
            if (i < sweepN) f = o.linear ? f + add : f * mul;
            const fi = vd > 0 ? f * (1 + vd * sinc(i * vr)) : f;
            const dt = fi / sr;
            ph += dt;
            if (ph >= 1) ph -= Math.floor(ph);
            d[s0 + i] = d[s0 + i]! + o.gain * env[i]! * oscValue(o.wave, ph, dt);
        }
    }

    fm(o: FmOpts): void {
        const [s0, len] = this.span(o);
        if (len <= 0) return;
        const sr = this.sr;
        const env = this.envelope(len, o);
        const f1 = o.f1 ?? o.f0;
        const sweepN = Math.max(1, Math.round((o.sweep ?? o.dur) * sr));
        const mul = Math.pow(f1 / o.f0, 1 / sweepN);
        const idx1 = o.idx1 ?? o.idx0;
        const idc = Math.exp(-1 / ((o.idxTau ?? 0.1) * sr));
        const fbk = (o.fb ?? 0) * INV_TAU;
        const d = this.data;
        let f = o.f0;
        let pc = 0;
        let pm = 0;
        let ie = 1;
        let mPrev = 0;
        for (let i = 0; i < len; i++) {
            if (i < sweepN) f *= mul;
            pc += f / sr;
            pm += (f * o.ratio) / sr;
            const m = sinc(pm + fbk * mPrev);
            mPrev = m;
            const idx = idx1 + (o.idx0 - idx1) * ie;
            ie *= idc;
            d[s0 + i] = d[s0 + i]! + o.gain * env[i]! * sinc(pc + idx * m * INV_TAU);
        }
    }

    noise(o: NoiseOpts): void {
        const [s0, len] = this.span(o);
        if (len <= 0) return;
        const sr = this.sr;
        const env = this.envelope(len, o);
        const c1 = o.c1 ?? o.c0;
        const q = o.q ?? 0.707;
        const sweepN = Math.max(1, Math.round((o.sweep ?? o.dur) * sr));
        const mul = Math.pow(c1 / o.c0, 1 / sweepN);
        const svf = new Svf();
        const d = this.data;
        const rng = this.rng;
        let c = o.c0;
        svf.set(c, q, sr);
        for (let i = 0; i < len; i++) {
            if (i < sweepN && c1 !== o.c0) {
                c *= mul;
                if ((i & 7) === 0) svf.set(c, q, sr);
            }
            const x = svf.run(rng() * 2 - 1, o.mode);
            d[s0 + i] = d[s0 + i]! + o.gain * env[i]! * x;
        }
    }

    /** Scattered tiny high-passed noise pops (debris / crackle). */
    crackle(t: number, span: number, count: number, gain: number): void {
        for (let k = 0; k < count; k++) {
            const at = t + this.rng() * span;
            const fade = 1 - (at - t) / (span * 1.2);
            this.noise({ t: at, dur: 0.004 + this.rng() * 0.006, mode: "hp", c0: 2000 + this.rng() * 3000, gain: gain * fade * (0.5 + this.rng() * 0.5), decay: 0.002 });
        }
    }

    drive(amount: number): void {
        const d = this.data;
        for (let i = 0; i < this.n; i++) d[i] = softClip(d[i]! * amount);
    }

    lowpass(cutoff: number): void {
        const a = 1 - Math.exp((-TAU * cutoff) / this.sr);
        const d = this.data;
        let y1 = 0;
        let y2 = 0;
        for (let i = 0; i < this.n; i++) {
            y1 += a * (d[i]! - y1);
            y2 += a * (y1 - y2);
            d[i] = y2;
        }
    }

    /** Amplitude modulation over [t, t + dur). */
    am(t: number, dur: number, rate: number, depth: number): void {
        const s0 = Math.round(t * this.sr);
        const len = Math.min(Math.round(dur * this.sr), this.n - s0);
        const d = this.data;
        const r = rate / this.sr;
        for (let i = 0; i < len; i++) d[s0 + i] = d[s0 + i]! * (1 - depth * 0.5 + depth * 0.5 * sinc(i * r));
    }
}

/** DC-block, fade the ends and peak-normalize a set of channels jointly. */
function finishOneShot(chs: Float32Array[], sr: number, peak: number, fadeIn: number, fadeOut: number): void {
    const r = Math.exp((-TAU * 12) / sr);
    let max = 0;
    for (const d of chs) {
        let x1 = 0;
        let y1 = 0;
        const n = d.length;
        const fi = Math.max(1, Math.round(fadeIn * sr));
        const fo = Math.min(n, Math.max(1, Math.round(fadeOut * sr)));
        for (let i = 0; i < n; i++) {
            const x = d[i]!;
            let y = x - x1 + r * y1;
            x1 = x;
            y1 = y;
            if (i < fi) y *= i / fi;
            const k = n - 1 - i;
            if (k < fo) y *= k / fo;
            d[i] = y;
            const a = Math.abs(y);
            if (a > max) max = a;
        }
    }
    if (max > 0) {
        const g = peak / max;
        for (const d of chs) for (let i = 0; i < d.length; i++) d[i] = d[i]! * g;
    }
}

// ---------------------------------------------------------------------------
// Sound effects
// ---------------------------------------------------------------------------

interface SfxRecipe {
    dur: number;
    /** final peak after normalization: sets the relative level of each cue */
    peak: number;
    stereo?: boolean;
    fadeOut?: number;
    build: (c: Canvas, ch: number) => void;
}

/** Explosion core shared by the weight tiers. `w` grows with perceived mass. */
function explosionBody(c: Canvas, t: number, w: number): void {
    c.tone({ t, dur: 0.2 + 0.8 * w, f0: 170 - 80 * w, f1: 55 - 27 * w, sweep: 0.12 + 0.5 * w, wave: "sine", gain: 0.7 + 0.3 * w, decay: 0.06 + 0.28 * w });
    c.noise({ t, dur: 0.35 + 1.0 * w, mode: "lp", c0: 7000 - 3000 * w, c1: 600 - 460 * w, sweep: 0.25 + 0.75 * w, q: 0.85, gain: 0.9 + 0.1 * w, decay: 0.08 + 0.3 * w });
    if (w > 0.3) c.noise({ t: t + 0.035 + 0.025 * w, dur: 0.3 + 0.4 * w, mode: "bp", c0: 1800 - 400 * w, c1: 500 - 200 * w, q: 1, gain: 0.5, decay: 0.08 + 0.12 * w });
    if (w > 0.7) c.tone({ t, dur: 0.6, f0: 190, f1: 56, sweep: 0.4, wave: "tri", gain: 0.3, decay: 0.15 });
    c.crackle(t + 0.02, 0.15 + 0.75 * w, Math.round(5 + 13 * w), 0.3);
}

const SFX: Record<SfxId, SfxRecipe> = {
    shot: {
        dur: 0.05,
        peak: 0.24,
        build: (c) => {
            c.tone({ dur: 0.046, f0: 1500, f1: 620, sweep: 0.03, wave: "pulse25", gain: 0.6, attack: 0.0008, decay: 0.016 });
            c.noise({ dur: 0.012, mode: "hp", c0: 5000, gain: 0.25, decay: 0.004 });
            c.lowpass(7000);
        },
    },
    laser: {
        dur: 0.13,
        peak: 0.3,
        build: (c) => {
            c.fm({ dur: 0.125, f0: 2600, f1: 420, sweep: 0.1, ratio: 0.5, idx0: 3, idx1: 0.5, idxTau: 0.05, gain: 0.6, decay: 0.06 });
            c.tone({ dur: 0.1, f0: 3200, f1: 900, wave: "saw", gain: 0.15, decay: 0.03 });
        },
    },
    halo: {
        dur: 0.12,
        peak: 0.26,
        build: (c) => {
            c.fm({ dur: 0.115, f0: 1320, f1: 1480, ratio: 3.5, idx0: 2, idx1: 0.3, idxTau: 0.04, gain: 0.5, decay: 0.045 });
            c.tone({ dur: 0.1, f0: 1980, f1: 2220, wave: "sine", gain: 0.25, decay: 0.035, vibRate: 40, vibDepth: 0.02 });
        },
    },
    scatter: {
        dur: 0.07,
        peak: 0.27,
        build: (c) => {
            c.noise({ dur: 0.065, mode: "bp", c0: 3500, c1: 1200, q: 1.2, gain: 0.7, decay: 0.018 });
            c.tone({ dur: 0.05, f0: 900, f1: 380, wave: "square", gain: 0.3, decay: 0.015 });
        },
    },
    enemyShot: {
        dur: 0.08,
        peak: 0.15,
        build: (c) => {
            c.tone({ dur: 0.075, f0: 1150, f1: 560, wave: "tri", gain: 0.7, attack: 0.002, decay: 0.03 });
            c.tone({ dur: 0.05, f0: 2300, f1: 1100, wave: "pulse25", gain: 0.08, decay: 0.015 });
        },
    },
    hit: {
        dur: 0.03,
        peak: 0.2,
        build: (c) => {
            c.noise({ dur: 0.012, mode: "hp", c0: 3500, gain: 0.6, decay: 0.003 });
            c.tone({ dur: 0.028, f0: 2900, f1: 2100, wave: "sine", gain: 0.5, decay: 0.006 });
        },
    },
    armorHit: {
        dur: 0.11,
        peak: 0.34,
        build: (c) => {
            c.fm({ dur: 0.11, f0: 520, ratio: 1.41, idx0: 4.5, idx1: 0, idxTau: 0.03, gain: 0.6, decay: 0.04 });
            c.noise({ dur: 0.02, mode: "bp", c0: 2500, q: 1.5, gain: 0.5, decay: 0.006 });
            c.tone({ dur: 0.06, f0: 240, f1: 150, wave: "square", gain: 0.2, decay: 0.02 });
        },
    },
    explodeS: {
        dur: 0.38,
        peak: 0.5,
        fadeOut: 0.03,
        build: (c) => explosionBody(c, 0, 0),
    },
    explodeM: {
        dur: 0.78,
        peak: 0.68,
        fadeOut: 0.05,
        build: (c) => {
            explosionBody(c, 0, 0.45);
            c.drive(1.4);
        },
    },
    explodeL: {
        dur: 1.4,
        peak: 0.82,
        stereo: true,
        fadeOut: 0.08,
        build: (c) => {
            explosionBody(c, 0, 1);
            c.drive(1.8);
        },
    },
    bossBreak: {
        dur: 2.8,
        peak: 0.88,
        stereo: true,
        fadeOut: 0.2,
        build: (c, ch) => {
            // t = 0: the break itself (aligned to the visual break moment)
            c.noise({ dur: 0.25, mode: "hp", c0: 1500, gain: 0.8, decay: 0.05 });
            c.tone({ dur: 0.3, f0: 150, f1: 50, wave: "sine", gain: 0.7, decay: 0.08 });
            // swell: rising tension toward the climax at 1.0 s
            c.noise({ t: 0.05, dur: 1.0, mode: "bp", c0: 300, c1: 3500, sweep: 0.95, q: 1.5, gain: 0.6, attack: 0.9, release: 0.05 });
            c.tone({ t: 0.05, dur: 1.0, f0: 110, f1: 880, sweep: 0.95, wave: "saw", gain: 0.18, attack: 0.9, release: 0.05 });
            // accelerating chain of secondary blasts, alternating sides
            const chain = [0.18, 0.36, 0.52, 0.64, 0.74, 0.82, 0.89, 0.95];
            chain.forEach((at, k) => {
                const side = (k + ch) % 2 === 0 ? 1 : 0.45;
                const g = (0.35 + 0.3 * (k / chain.length)) * side;
                c.noise({ t: at, dur: 0.3, mode: "lp", c0: 5000, c1: 400, sweep: 0.2, gain: g, decay: 0.07 });
                c.tone({ t: at, dur: 0.18, f0: 140, f1: 50, wave: "sine", gain: g * 0.9, decay: 0.05 });
            });
            // climax
            c.tone({ t: 1.0, dur: 1.75, f0: 85, f1: 24, sweep: 1.0, wave: "sine", gain: 1.3, decay: 0.5 });
            c.noise({ t: 1.0, dur: 1.78, mode: "lp", c0: 5000, c1: 110, sweep: 1.5, q: 0.8, gain: 1.3, decay: 0.55 });
            c.noise({ t: 1.03, dur: 1.2, mode: "bp", c0: 1200, c1: 250, q: 0.8, gain: 0.5, decay: 0.35 });
            c.crackle(1.05, 1.4, 30, 0.35);
            c.drive(1.6);
        },
    },
    playerHit: {
        dur: 0.45,
        peak: 0.62,
        fadeOut: 0.03,
        build: (c) => {
            c.tone({ dur: 0.4, f0: 1100, f1: 160, sweep: 0.35, wave: "square", gain: 0.5, decay: 0.15, vibRate: 28, vibDepth: 0.08 });
            c.noise({ dur: 0.18, mode: "hp", c0: 2500, gain: 0.5, decay: 0.05 });
            c.fm({ dur: 0.35, f0: 1800, ratio: 2.76, idx0: 5, idx1: 0, idxTau: 0.08, gain: 0.25, decay: 0.09 });
            c.tone({ dur: 0.2, f0: 200, f1: 70, wave: "sine", gain: 0.5, decay: 0.06 });
        },
    },
    playerDie: {
        dur: 1.5,
        peak: 0.8,
        stereo: true,
        fadeOut: 0.1,
        build: (c) => {
            c.tone({ dur: 1.2, f0: 1400, f1: 70, sweep: 1.1, wave: "saw", gain: 0.25, decay: 0.45, vibRate: 18, vibDepth: 0.05 });
            c.noise({ dur: 0.08, mode: "hp", c0: 3000, gain: 0.6, decay: 0.02 });
            explosionBody(c, 0.02, 0.8);
            c.drive(1.6);
        },
    },
    bomb: {
        dur: 1.8,
        peak: 0.85,
        stereo: true,
        fadeOut: 0.12,
        build: (c) => {
            c.noise({ dur: 0.25, mode: "hp", c0: 800, c1: 6000, sweep: 0.2, gain: 0.5, attack: 0.002, decay: 0.08 });
            c.tone({ dur: 1.3, f0: 75, f1: 25, sweep: 0.9, wave: "sine", gain: 1.2, decay: 0.4 });
            c.noise({ dur: 1.78, mode: "lp", c0: 3500, c1: 150, sweep: 1.4, q: 0.7, gain: 1.1, decay: 0.5 });
            c.fm({ t: 0.02, dur: 1.2, f0: 880, f1: 660, ratio: 1.5, idx0: 3, idx1: 0.5, idxTau: 0.3, gain: 0.22, decay: 0.35 });
            c.crackle(0.1, 1.0, 16, 0.25);
            c.drive(1.7);
        },
    },
    graze: {
        dur: 0.05,
        peak: 0.14,
        build: (c) => {
            c.tone({ dur: 0.045, f0: 3520, f1: 3900, wave: "sine", gain: 0.6, decay: 0.012 });
            c.tone({ dur: 0.035, f0: 5280, f1: 5900, wave: "sine", gain: 0.35, decay: 0.008 });
        },
    },
    reload: {
        dur: 0.72,
        peak: 0.5,
        fadeOut: 0.04,
        build: (c) => {
            const notes = [69, 73, 76, 81, 85];
            notes.forEach((m, k) => {
                const f = midiToHz(m);
                c.tone({ t: k * 0.055, dur: 0.13, f0: f, wave: "pulse25", gain: 0.42, decay: 0.06 });
                c.tone({ t: k * 0.055, dur: 0.1, f0: f * 2, wave: "sine", gain: 0.12, decay: 0.04 });
            });
            const top = midiToHz(88);
            c.tone({ t: 0.275, dur: 0.44, f0: top, wave: "pulse25", gain: 0.42, decay: 0.22, vibRate: 7, vibDepth: 0.012, release: 0.03 });
            c.tone({ t: 0.275, dur: 0.44, f0: top * 1.004, wave: "pulse12", gain: 0.2, decay: 0.22, vibRate: 7, vibDepth: 0.012, release: 0.03 });
            c.fm({ t: 0.275, dur: 0.4, f0: midiToHz(93), ratio: 2, idx0: 1.5, idx1: 0, idxTau: 0.1, gain: 0.15, decay: 0.15 });
        },
    },
    chip: {
        dur: 0.09,
        peak: 0.3,
        build: (c) => {
            c.tone({ dur: 0.035, f0: 1046.5, wave: "square", gain: 0.5, decay: 0.03 });
            c.tone({ t: 0.035, dur: 0.05, f0: 1568, wave: "square", gain: 0.5, decay: 0.025 });
        },
    },
    pickup: {
        dur: 0.32,
        peak: 0.42,
        fadeOut: 0.02,
        build: (c) => {
            [76, 80, 83].forEach((m, k) => {
                const f = midiToHz(m);
                c.fm({ t: k * 0.06, dur: 0.2, f0: f, ratio: 2, idx0: 1.6, idx1: 0.2, idxTau: 0.1, gain: 0.5, decay: 0.09 });
                c.tone({ t: k * 0.06, dur: 0.08, f0: f, wave: "pulse25", gain: 0.15, decay: 0.03 });
            });
        },
    },
    powerUp: {
        dur: 0.62,
        peak: 0.52,
        fadeOut: 0.03,
        build: (c) => {
            const steps = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24];
            steps.forEach((s, k) => {
                c.tone({ t: k * 0.028, dur: 0.05, f0: midiToHz(60 + s), wave: "pulse25", gain: 0.4, decay: 0.03 });
            });
            c.tone({ dur: 0.42, f0: 400, f1: 1600, wave: "sine", gain: 0.2, attack: 0.05 });
            c.tone({ t: 0.42, dur: 0.18, f0: midiToHz(96), wave: "square", gain: 0.3, decay: 0.07 });
            c.fm({ t: 0.42, dur: 0.18, f0: midiToHz(84), ratio: 3, idx0: 1.2, idx1: 0, idxTau: 0.06, gain: 0.25, decay: 0.08 });
        },
    },
    modeSwitch: {
        dur: 0.055,
        peak: 0.34,
        build: (c) => {
            c.tone({ dur: 0.012, f0: 2200, wave: "square", gain: 0.6, decay: 0.005 });
            c.tone({ t: 0.022, dur: 0.03, f0: 1500, wave: "square", gain: 0.6, decay: 0.01 });
            c.noise({ dur: 0.006, mode: "hp", c0: 6000, gain: 0.4 });
        },
    },
    warning: {
        dur: 2.0,
        peak: 0.62,
        fadeOut: 0.02,
        build: (c) => {
            for (let k = 0; k < 8; k++) {
                const f = k % 2 === 0 ? 740 : 554.4;
                c.tone({ t: k * 0.25, dur: 0.245, f0: f, wave: "saw", gain: 0.4, attack: 0.006, release: 0.012 });
                c.tone({ t: k * 0.25, dur: 0.245, f0: f * 1.003, wave: "square", gain: 0.3, attack: 0.006, release: 0.012 });
                c.tone({ t: k * 0.25, dur: 0.245, f0: f / 2, wave: "tri", gain: 0.3, attack: 0.006, release: 0.012 });
            }
            c.am(0, 2.0, 16, 0.35);
            c.lowpass(3200);
        },
    },
    extend: {
        dur: 1.0,
        peak: 0.6,
        fadeOut: 0.05,
        build: (c) => {
            const g5 = midiToHz(79);
            c.tone({ dur: 0.08, f0: g5, wave: "pulse25", gain: 0.4, decay: 0.05 });
            c.tone({ t: 0.1, dur: 0.08, f0: g5, wave: "pulse25", gain: 0.4, decay: 0.05 });
            c.tone({ t: 0.2, dur: 0.75, f0: midiToHz(84), wave: "pulse25", gain: 0.42, decay: 0.4, vibRate: 6.5, vibDepth: 0.01, release: 0.05 });
            c.tone({ t: 0.2, dur: 0.75, f0: midiToHz(88), wave: "square", gain: 0.22, decay: 0.4, vibRate: 6.5, vibDepth: 0.01, release: 0.05 });
            c.tone({ t: 0.2, dur: 0.75, f0: midiToHz(72), wave: "tri", gain: 0.3, decay: 0.4, release: 0.05 });
            [96, 100, 103, 108].forEach((m, k) => {
                c.fm({ t: 0.26 + k * 0.05, dur: 0.25, f0: midiToHz(m), ratio: 2, idx0: 1, idx1: 0, idxTau: 0.08, gain: 0.12, decay: 0.08 });
            });
        },
    },
    menuMove: {
        dur: 0.04,
        peak: 0.28,
        build: (c) => {
            c.tone({ dur: 0.035, f0: 1760, f1: 1650, wave: "square", gain: 0.5, decay: 0.012 });
        },
    },
    menuSelect: {
        dur: 0.16,
        peak: 0.42,
        fadeOut: 0.01,
        build: (c) => {
            c.tone({ dur: 0.05, f0: 1318.5, wave: "pulse25", gain: 0.5, decay: 0.04 });
            c.tone({ t: 0.05, dur: 0.105, f0: 1975.5, wave: "pulse25", gain: 0.5, decay: 0.05 });
            c.tone({ t: 0.05, dur: 0.1, f0: 3951, wave: "sine", gain: 0.1, decay: 0.04 });
        },
    },
    coin: {
        dur: 0.42,
        peak: 0.45,
        fadeOut: 0.02,
        build: (c) => {
            c.tone({ dur: 0.06, f0: 1174.7, wave: "square", gain: 0.45, release: 0.003 });
            c.tone({ t: 0.06, dur: 0.35, f0: 1760, wave: "square", gain: 0.45, decay: 0.12 });
            c.fm({ t: 0.06, dur: 0.3, f0: 3520, ratio: 2, idx0: 1.2, idx1: 0, idxTau: 0.05, gain: 0.12, decay: 0.08 });
        },
    },
    pause: {
        dur: 0.16,
        peak: 0.32,
        fadeOut: 0.01,
        build: (c) => {
            c.tone({ dur: 0.06, f0: 880, wave: "pulse25", gain: 0.45, decay: 0.04 });
            c.tone({ t: 0.07, dur: 0.085, f0: 659.3, wave: "pulse25", gain: 0.45, decay: 0.04 });
        },
    },
    barrier: {
        dur: 0.5,
        peak: 0.42,
        fadeOut: 0.06,
        build: (c) => {
            c.tone({ dur: 0.5, f0: 110, wave: "saw", gain: 0.5, attack: 0.02, release: 0.08 });
            c.tone({ dur: 0.5, f0: 165.5, wave: "square", gain: 0.3, attack: 0.02, release: 0.08 });
            c.tone({ dur: 0.5, f0: 220.7, wave: "saw", gain: 0.2, attack: 0.02, release: 0.08, vibRate: 9, vibDepth: 0.01 });
            c.noise({ dur: 0.5, mode: "bp", c0: 2500, q: 2, gain: 0.25, attack: 0.02, release: 0.08 });
            c.am(0, 0.5, 30, 0.6);
            c.lowpass(1800);
        },
    },
};

export function renderSfx(id: SfxId, sampleRate: number): Rendered {
    const recipe = SFX[id];
    if (!recipe) throw new Error(`unknown sfx "${String(id)}"`);
    const count = recipe.stereo ? 2 : 1;
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < count; ch++) {
        const c = new Canvas(sampleRate, recipe.dur, hashSeed(`sfx:${id}:${ch}`));
        recipe.build(c, ch);
        channels.push(c.data);
    }
    finishOneShot(channels, sampleRate, recipe.peak, 0.0005, recipe.fadeOut ?? 0.006);
    return { sampleRate, channels, loop: false };
}

// ---------------------------------------------------------------------------
// Music engine: step sequencer rendering straight into a stereo bus.
// Loop tracks wrap every voice tail (and the echo) around the buffer end, so
// looped playback is identical to an endless render: the seam is seamless.
// ---------------------------------------------------------------------------

interface FmPatch {
    kind: "fm";
    ratio: number;
    idx0: number;
    idx1: number;
    idxTau: number;
    fb: number;
    a: number;
    d: number;
    s: number;
    r: number;
    vib: number;
    vibRate: number;
    vibDelay: number;
    drive: number;
    /** fraction of the written note length that is held */
    gate: number;
}

interface PulsePatch {
    kind: "pulse";
    duty: number;
    pwm: number;
    pwmRate: number;
    a: number;
    d: number;
    s: number;
    r: number;
    vib: number;
    vibRate: number;
    vibDelay: number;
    lp: number;
    gate: number;
}

interface SawPatch {
    kind: "saw";
    detune: number;
    lp: number;
    a: number;
    d: number;
    s: number;
    r: number;
    gate: number;
}

type Patch = FmPatch | PulsePatch | SawPatch;

const BASS: FmPatch = { kind: "fm", ratio: 1, idx0: 5.5, idx1: 1.3, idxTau: 0.05, fb: 0.5, a: 0.002, d: 0.15, s: 0.55, r: 0.035, vib: 0, vibRate: 0, vibDelay: 0, drive: 1.6, gate: 0.8 };
const BASS_HEAVY: FmPatch = { ...BASS, idx0: 7, idx1: 2.2, fb: 0.8, drive: 2.6, s: 0.7 };
const BASS_SOFT: FmPatch = { ...BASS, idx0: 2.5, idx1: 0.6, idxTau: 0.2, fb: 0.2, drive: 0, a: 0.03, d: 1.5, s: 0.6, r: 0.3, gate: 1 };
const BRASS: FmPatch = { kind: "fm", ratio: 1, idx0: 3.2, idx1: 1.7, idxTau: 0.18, fb: 0.35, a: 0.012, d: 0.35, s: 0.75, r: 0.12, vib: 0.006, vibRate: 5.6, vibDelay: 0.16, drive: 0, gate: 0.95 };
const BRASS_DARK: FmPatch = { ...BRASS, idx0: 4.2, idx1: 2.3, fb: 0.6, drive: 1.3 };
const STAB: FmPatch = { ...BRASS, idx0: 4, idx1: 1.5, idxTau: 0.06, a: 0.003, d: 0.1, s: 0.4, r: 0.06, vib: 0, gate: 0.7 };
const LEAD_PULSE: PulsePatch = { kind: "pulse", duty: 0.25, pwm: 0.1, pwmRate: 2.7, a: 0.004, d: 0.25, s: 0.7, r: 0.1, vib: 0.007, vibRate: 6, vibDelay: 0.14, lp: 5200, gate: 0.95 };
const LEAD_SAD: PulsePatch = { ...LEAD_PULSE, duty: 0.5, pwm: 0.08, lp: 2400, a: 0.02, r: 0.25, vib: 0.01, vibRate: 5 };
const ARP: PulsePatch = { kind: "pulse", duty: 0.125, pwm: 0, pwmRate: 0, a: 0.001, d: 0.07, s: 0.25, r: 0.04, vib: 0, vibRate: 0, vibDelay: 0, lp: 6500, gate: 0.6 };
const PAD: SawPatch = { kind: "saw", detune: 0.09, lp: 1500, a: 0.18, d: 1.2, s: 0.8, r: 0.25, gate: 1 };
const PAD_DARK: SawPatch = { ...PAD, lp: 900 };

interface Kit {
    kick: Float32Array;
    snare: Float32Array;
    hatC: Float32Array;
    hatO: Float32Array;
    crash: Float32Array;
    tomH: Float32Array;
    tomL: Float32Array;
}

function drumHit(sr: number, seed: string, dur: number, build: (c: Canvas) => void): Float32Array {
    const c = new Canvas(sr, dur, hashSeed(seed));
    build(c);
    const d = c.data;
    const fo = Math.round(0.004 * sr);
    for (let i = 0; i < fo; i++) d[d.length - 1 - i] = d[d.length - 1 - i]! * (i / fo);
    return d;
}

function makeKit(sr: number, name: string, heavy: boolean): Kit {
    const kd = heavy ? 0.12 : 0.11;
    return {
        kick: drumHit(sr, `${name}:kick`, heavy ? 0.36 : 0.26, (c) => {
            c.tone({ dur: heavy ? 0.36 : 0.26, f0: heavy ? 150 : 165, f1: heavy ? 40 : 48, sweep: 0.07, wave: "sine", gain: 1, attack: 0.0005, decay: kd });
            c.noise({ dur: 0.006, mode: "lp", c0: 4000, gain: 0.5, decay: 0.002 });
            c.drive(heavy ? 2 : 1.5);
        }),
        snare: drumHit(sr, `${name}:snare`, 0.2, (c) => {
            c.tone({ dur: 0.12, f0: 240, f1: 185, sweep: 0.02, wave: "sine", gain: 0.6, decay: 0.04 });
            c.noise({ dur: 0.2, mode: "hp", c0: 1400, gain: 0.85, decay: 0.065 });
            c.noise({ dur: 0.12, mode: "bp", c0: 3800, q: 0.8, gain: 0.35, decay: 0.04 });
        }),
        hatC: drumHit(sr, `${name}:hatC`, 0.05, (c) => {
            c.noise({ dur: 0.05, mode: "hp", c0: 7500, gain: 0.9, decay: 0.012 });
            c.tone({ dur: 0.04, f0: 5920, wave: "square", gain: 0.06, decay: 0.01 });
            c.tone({ dur: 0.04, f0: 8110, wave: "square", gain: 0.05, decay: 0.01 });
        }),
        hatO: drumHit(sr, `${name}:hatO`, 0.3, (c) => {
            c.noise({ dur: 0.3, mode: "hp", c0: 7000, gain: 0.9, decay: 0.09 });
            c.tone({ dur: 0.25, f0: 5920, wave: "square", gain: 0.05, decay: 0.07 });
            c.tone({ dur: 0.25, f0: 8110, wave: "square", gain: 0.04, decay: 0.07 });
        }),
        crash: drumHit(sr, `${name}:crash`, 1.6, (c) => {
            c.noise({ dur: 1.6, mode: "hp", c0: 3500, gain: 0.9, decay: 0.5 });
            c.noise({ dur: 1.2, mode: "bp", c0: 6500, q: 0.7, gain: 0.4, decay: 0.3 });
            c.tone({ dur: 1.0, f0: 4830, wave: "square", gain: 0.03, decay: 0.3 });
        }),
        tomH: drumHit(sr, `${name}:tomH`, 0.3, (c) => {
            c.tone({ dur: 0.3, f0: heavy ? 200 : 230, f1: heavy ? 140 : 165, sweep: 0.15, wave: "sine", gain: 1, decay: 0.12 });
            c.noise({ dur: 0.03, mode: "lp", c0: 3000, gain: 0.25, decay: 0.01 });
        }),
        tomL: drumHit(sr, `${name}:tomL`, 0.4, (c) => {
            c.tone({ dur: 0.4, f0: heavy ? 130 : 150, f1: heavy ? 85 : 100, sweep: 0.2, wave: "sine", gain: 1, decay: 0.16 });
            c.noise({ dur: 0.03, mode: "lp", c0: 2500, gain: 0.25, decay: 0.01 });
        }),
    };
}

interface ChordSlot {
    root: number; // pitch class
    tones: number[]; // intervals above the root
}

const CHORD_SHAPES: Record<string, number[]> = { "": [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6] };

function parseChord(name: string): ChordSlot {
    const m = /^([A-G])([#b])?(m|dim)?$/.exec(name);
    if (!m) throw new Error(`bad chord "${name}"`);
    const root = (PITCH_CLASS[m[1]!.toLowerCase()]! + accidental(m[2]) + 12) % 12;
    return { root, tones: CHORD_SHAPES[m[3] ?? ""]! };
}

/** Lowest MIDI note >= low with the given pitch class. */
function placeAbove(pc: number, low: number): number {
    return low + ((pc - (low % 12) + 12) % 12);
}

/** Chord tones voiced in [low, low + 12). */
function voicing(ch: ChordSlot, low: number): number[] {
    return ch.tones.map((iv) => placeAbove((ch.root + iv) % 12, low)).sort((a, b) => a - b);
}

interface NoteEv {
    s: number; // start step (16ths)
    l: number; // length in steps
    m: number; // midi
}

interface Ctx {
    sr: number;
    n: number;
    loop: boolean;
    step: number; // samples per 16th
    L: Float32Array;
    R: Float32Array;
    /** mono echo send bus */
    send: Float32Array;
    v: Float32Array;
    env: Float32Array;
    chords: ChordSlot[]; // per step
}

function makeCtx(sr: number, bpm: number, loopSteps: number, oneShotSeconds: number): Ctx {
    const step = (sr * 60) / bpm / 4;
    const loop = oneShotSeconds <= 0;
    const n = loop ? Math.round(loopSteps * step) : Math.round(oneShotSeconds * sr);
    return { sr, n, loop, step, L: new Float32Array(n), R: new Float32Array(n), send: new Float32Array(n), v: new Float32Array(sr), env: new Float32Array(sr), chords: [] };
}

function setChords(c: Ctx, perBar: string[]): void {
    c.chords = [];
    for (const bar of perBar) {
        const parts = bar.split("|").map(parseChord);
        const each = 16 / parts.length;
        for (const p of parts) for (let i = 0; i < each; i++) c.chords.push(p);
    }
}

function chordAt(c: Ctx, step: number): ChordSlot {
    const ch = c.chords[Math.min(step, c.chords.length - 1)];
    if (!ch) throw new Error("no chords set");
    return ch;
}

function fillEnv(env: Float32Array, n: number, gate: number, sr: number, a: number, d: number, s: number): void {
    const A = Math.max(1, Math.round(a * sr));
    const dc = Math.exp(-1 / (Math.max(d, 1e-4) * sr));
    const g = Math.min(gate, n);
    let lvl = 0;
    let dec = 1;
    for (let i = 0; i < g; i++) {
        if (i < A) lvl = i / A;
        else {
            lvl = s + (1 - s) * dec;
            dec *= dc;
        }
        env[i] = lvl;
    }
    const rel = n - g;
    for (let i = 0; i < rel; i++) {
        const t = 1 - i / rel;
        env[g + i] = lvl * t * t;
    }
}

function vibAt(i: number, start: number, ramp: number, depth: number, rate: number): number {
    if (depth <= 0 || i <= start) return 1;
    const w = i - start < ramp ? (i - start) / ramp : 1;
    return 1 + depth * w * sinc(i * rate);
}

function renderVoice(c: Ctx, p: Patch, n: number, gate: number, f: number, vel: number, detune: number): void {
    if (c.v.length < n) {
        c.v = new Float32Array(n);
        c.env = new Float32Array(n);
    }
    const { v, env, sr } = c;
    fillEnv(env, n, gate, sr, p.a, p.d, p.s);
    if (p.kind === "fm") {
        const dtc = f / sr;
        const dtm = (f * p.ratio) / sr;
        const idc = Math.exp(-1 / (p.idxTau * sr));
        const fbk = p.fb * INV_TAU;
        const vs = Math.round(p.vibDelay * sr);
        const vramp = Math.round(0.15 * sr);
        const vr = p.vibRate / sr;
        const dn = p.drive > 0 ? softClip(p.drive) : 1;
        let pc = 0;
        let pm = 0;
        let ie = 1;
        let mPrev = 0;
        for (let i = 0; i < n; i++) {
            const fm = vibAt(i, vs, vramp, p.vib, vr);
            pc += dtc * fm;
            pm += dtm * fm;
            const m = sinc(pm + fbk * mPrev);
            mPrev = m;
            const idx = p.idx1 + (p.idx0 - p.idx1) * ie;
            ie *= idc;
            let x = sinc(pc + idx * m * INV_TAU);
            if (p.drive > 0) x = softClip(x * p.drive) / dn;
            v[i] = x * env[i]! * vel;
        }
    } else if (p.kind === "pulse") {
        const base = f / sr;
        const vs = Math.round(p.vibDelay * sr);
        const vramp = Math.round(0.15 * sr);
        const vr = p.vibRate / sr;
        const pr = p.pwmRate / sr;
        const a = 1 - Math.exp((-TAU * p.lp) / sr);
        let ph = 0;
        let y1 = 0;
        let y2 = 0;
        for (let i = 0; i < n; i++) {
            const dt = base * vibAt(i, vs, vramp, p.vib, vr);
            ph += dt;
            if (ph >= 1) ph -= 1;
            const w = p.pwm > 0 ? p.duty + p.pwm * sinc(i * pr) : p.duty;
            y1 += a * (pulse(ph, dt, w) - y1);
            y2 += a * (y1 - y2);
            v[i] = y2 * env[i]! * vel;
        }
    } else {
        // two saws detuned by +/- detune semitones, summed in one voice
        const dta = (f * Math.pow(2, (p.detune + detune) / 12)) / sr;
        const dtb = (f * Math.pow(2, (detune - p.detune) / 12)) / sr;
        const a = 1 - Math.exp((-TAU * p.lp) / sr);
        let pa = 0.37;
        let pb = 0.81;
        let y1 = 0;
        let y2 = 0;
        for (let i = 0; i < n; i++) {
            pa += dta;
            if (pa >= 1) pa -= 1;
            pb += dtb;
            if (pb >= 1) pb -= 1;
            y1 += a * ((saw(pa, dta) + saw(pb, dtb)) * 0.5 - y1);
            y2 += a * (y1 - y2);
            v[i] = y2 * env[i]! * vel;
        }
    }
}

function mixVoice(c: Ctx, start: number, n: number, gain: number, pan: number, send: number): void {
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    const head = Math.min(n, c.n - start);
    addRange(c, 0, head, start, gl, gr, send);
    // loop tracks wrap the voice tail to the start of the buffer
    if (c.loop && n > head) addRange(c, head, n - head, 0, gl, gr, send);
}

function addRange(c: Ctx, from: number, count: number, at: number, gl: number, gr: number, send: number): void {
    const { L, R, v } = c;
    if (send > 0) {
        const bus = c.send;
        const sm = (gl + gr) * 0.5 * send;
        for (let i = 0; i < count; i++) {
            const x = v[from + i]!;
            const j = at + i;
            L[j] = L[j]! + gl * x;
            R[j] = R[j]! + gr * x;
            bus[j] = bus[j]! + sm * x;
        }
    } else {
        for (let i = 0; i < count; i++) {
            const x = v[from + i]!;
            const j = at + i;
            L[j] = L[j]! + gl * x;
            R[j] = R[j]! + gr * x;
        }
    }
}

function note(c: Ctx, p: Patch, ev: NoteEv, gain: number, pan: number, send: number, vel = 1, detune = 0): void {
    const start = Math.round(ev.s * c.step);
    if (start >= c.n && !c.loop) return;
    const gate = Math.max(1, Math.round(ev.l * c.step * p.gate));
    let n = gate + Math.round(p.r * c.sr);
    if (!c.loop) n = Math.min(n, c.n - start);
    if (n <= 0) return;
    renderVoice(c, p, n, gate, midiToHz(ev.m), vel, detune);
    mixVoice(c, start % c.n, n, gain, pan, send);
}

function hit(c: Ctx, buf: Float32Array, step: number, gain: number, pan: number): void {
    const start = Math.round(step * c.step) % c.n;
    if (c.v.length < buf.length) {
        c.v = new Float32Array(buf.length);
        c.env = new Float32Array(buf.length);
    }
    c.v.set(buf);
    mixVoice(c, start, buf.length, gain, pan, 0);
}

/** Parse note bars ("a4 - c5 ." with `res` steps per token) into events. */
function parseNotes(bars: string[], res: number, bar0: number, transpose = 0): NoteEv[] {
    const out: NoteEv[] = [];
    let pos = bar0 * 16;
    let cur: NoteEv | null = null;
    bars.forEach((bar, bi) => {
        const toks = bar.trim().split(/\s+/);
        if (toks.length * res !== 16 && bi !== bars.length - 1) throw new Error(`bar "${bar}" is not 16 steps`);
        for (const tok of toks) {
            if (tok === "-") {
                if (cur) cur.l += res;
            } else if (tok === ".") cur = null;
            else {
                cur = { s: pos, l: res, m: noteToMidi(tok) + transpose };
                out.push(cur);
            }
            pos += res;
        }
    });
    return out;
}

function melody(c: Ctx, p: Patch, bar0: number, bars: string[], res: number, gain: number, pan: number, send: number, transpose = 0): void {
    for (const ev of parseNotes(bars, res, bar0, transpose)) note(c, p, ev, gain, pan, send);
}

/** Bass from a chord-relative pattern: numbers are semitones above the chord root placed at/above `low`. */
function bassLine(c: Ctx, p: Patch, bar: number, pattern: string, res: number, low: number, gain: number): void {
    const toks = pattern.trim().split(/\s+/);
    if (toks.length * res !== 16) throw new Error(`bass pattern "${pattern}" is not 16 steps`);
    let cur: NoteEv | null = null;
    const evs: NoteEv[] = [];
    toks.forEach((tok, k) => {
        const s = bar * 16 + k * res;
        if (tok === "-") {
            if (cur) cur.l += res;
        } else if (tok === ".") cur = null;
        else {
            cur = { s, l: res, m: placeAbove(chordAt(c, s).root, low) + Number(tok) };
            evs.push(cur);
        }
    });
    for (const ev of evs) note(c, p, ev, gain, 0, 0, ev.s % 4 === 0 ? 1 : 0.8);
}

/** Arpeggio over the current chord: digits index chord tones (k -> tone k%3, octave k/3). */
function arp(c: Ctx, p: Patch, bar: number, pattern: string, low: number, gain: number, send: number): void {
    const toks = pattern.trim().split(/\s+/);
    if (toks.length !== 16) throw new Error(`arp pattern "${pattern}" is not 16 steps`);
    toks.forEach((tok, k) => {
        if (tok === ".") return;
        const s = bar * 16 + k;
        const idx = Number(tok);
        const vo = voicing(chordAt(c, s), low);
        const m = vo[idx % 3]! + 12 * Math.floor(idx / 3);
        note(c, p, { s, l: 1, m }, gain, k % 2 === 0 ? -0.45 : 0.45, send, k % 4 === 0 ? 1 : 0.75);
    });
}

/** Chord stabs: 'x' strikes the whole voiced chord, '-' holds, '.' rests. */
function stabs(c: Ctx, p: Patch, bar: number, pattern: string, low: number, gain: number, send: number): void {
    const toks = pattern.trim().split(/\s+/);
    if (toks.length !== 16) throw new Error(`stab pattern "${pattern}" is not 16 steps`);
    let cur: { s: number; l: number } | null = null;
    const evs: { s: number; l: number }[] = [];
    toks.forEach((tok, k) => {
        if (tok === "-") {
            if (cur) cur.l += 1;
        } else if (tok === ".") cur = null;
        else {
            cur = { s: bar * 16 + k, l: 1 };
            evs.push(cur);
        }
    });
    for (const e of evs) {
        voicing(chordAt(c, e.s), low).forEach((m, i) => note(c, p, { s: e.s, l: e.l, m }, gain, (i - 1) * 0.35, send));
    }
}

/** Sustained pad over chord changes: a detuned saw pair per chord tone, tones spread across the field. */
function pad(c: Ctx, p: SawPatch, fromBar: number, toBar: number, low: number, gain: number): void {
    let s = fromBar * 16;
    const end = toBar * 16;
    while (s < end) {
        const ch = chordAt(c, s);
        let l = 1;
        while (s + l < end && chordAt(c, s + l) === ch) l++;
        voicing(ch, low).forEach((m, i) => note(c, p, { s, l, m }, gain * 2, (i - 1) * 0.6, 0.15));
        s += l;
    }
}

interface DrumBar {
    k?: string;
    s?: string;
    h?: string;
    t?: string;
}

function drums(c: Ctx, kit: Kit, bar: number, pat: DrumBar, level = 1): void {
    const lane = (str: string | undefined, fn: (ch: string, step: number) => void): void => {
        if (!str) return;
        if (str.length !== 16) throw new Error(`drum lane "${str}" is not 16 steps`);
        for (let i = 0; i < 16; i++) if (str[i] !== ".") fn(str[i]!, bar * 16 + i);
    };
    lane(pat.k, (ch, s) => hit(c, kit.kick, s, level * (ch === "x" ? 0.95 : 0.45), 0));
    lane(pat.s, (ch, s) => hit(c, kit.snare, s, level * (ch === "x" ? 0.62 : 0.22), 0.05));
    lane(pat.h, (ch, s) => {
        if (ch === "o") hit(c, kit.hatO, s, level * 0.2, 0.3);
        else hit(c, kit.hatC, s, level * (ch === "x" ? 0.26 : 0.13), 0.3);
    });
    lane(pat.t, (ch, s) => {
        if (ch === "h") hit(c, kit.tomH, s, level * 0.55, -0.3);
        else if (ch === "l") hit(c, kit.tomL, s, level * 0.6, 0.3);
        else if (ch === "c") hit(c, kit.crash, s, level * 0.3, -0.2);
    });
}

function crash(c: Ctx, kit: Kit, bar: number, level = 1): void {
    hit(c, kit.crash, bar * 16, 0.32 * level, -0.2);
}

/** Ping-pong echo on the send bus; circular for loops so the seam stays continuous. */
function echo(c: Ctx, steps: number, fb: number, wet: number): void {
    const N = c.n;
    const D = Math.max(1, Math.round(steps * c.step));
    const zl = new Float32Array(N);
    const zr = new Float32Array(N);
    const a = 1 - Math.exp((-TAU * 3200) / c.sr);
    let lp = 0;
    const passes = c.loop ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
        for (let i = 0; i < N; i++) {
            let j = i - D;
            if (j < 0) j = c.loop ? j + N : -1;
            const back = j >= 0 ? zr[j]! : 0;
            lp += a * (back - lp);
            zl[i] = c.send[i]! + fb * lp;
            zr[i] = j >= 0 ? zl[j]! : 0;
        }
    }
    for (let i = 0; i < N; i++) {
        let j = i - D;
        if (j < 0) j = c.loop ? j + N : -1;
        if (j < 0) continue;
        c.L[i] = c.L[i]! + wet * zl[j]!;
        c.R[i] = c.R[i]! + wet * zr[j]!;
    }
}

function peakOf(L: Float32Array, R: Float32Array): number {
    let max = 1e-9;
    for (let i = 0; i < L.length; i++) {
        const l = Math.abs(L[i]!);
        const r = Math.abs(R[i]!);
        if (l > max) max = l;
        if (r > max) max = r;
    }
    return max;
}

function removeMean(...chs: Float32Array[]): void {
    for (const d of chs) {
        let sum = 0;
        for (const x of d) sum += x;
        const mean = sum / d.length;
        for (let i = 0; i < d.length; i++) d[i] = d[i]! - mean;
    }
}

function master(c: Ctx, peak: number, fadeOut = 0.06): Rendered {
    const { L, R, n } = c;
    // remove DC: a constant offset keeps the loop seam intact; one-shots get a gentle high-pass
    if (c.loop) removeMean(L, R);
    else {
        const r = Math.exp((-TAU * 10) / c.sr);
        for (const d of [L, R]) {
            let x1 = 0;
            let y1 = 0;
            for (let i = 0; i < n; i++) {
                const x = d[i]!;
                const y = x - x1 + r * y1;
                x1 = x;
                y1 = y;
                d[i] = y;
            }
        }
    }
    // glue: normalize, saturate gently, re-centre, normalize to the target peak
    const pre = 1.15 / peakOf(L, R);
    for (let i = 0; i < n; i++) {
        L[i] = softClip(L[i]! * pre);
        R[i] = softClip(R[i]! * pre);
    }
    if (c.loop) removeMean(L, R);
    const g = peak / peakOf(L, R);
    const fo = c.loop ? 0 : Math.round(fadeOut * c.sr);
    for (let i = 0; i < n; i++) {
        let k = g;
        if (fo > 0 && n - 1 - i < fo) k *= (n - 1 - i) / fo;
        L[i] = L[i]! * k;
        R[i] = R[i]! * k;
    }
    return { sampleRate: c.sr, channels: [L, R], loop: c.loop };
}

// ----- shared drum patterns (16 steps; k: x full / y soft, s: x / g ghost, h: x / - soft / o open, t: h l c) -----

const DR_INTRO: DrumBar = { k: "x.......x.......", h: "..x...x...x...x." };
const DR_DRIVE: DrumBar = { k: "x.....x...x.x...", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." };
const DR_DRIVE_B: DrumBar = { k: "x.....x.x.....x.", s: "....x..g....x..g", h: "x.x.x.xox.x.x.xo" };
const DR_FILL: DrumBar = { k: "x.....x.x.......", s: "....x.....g.xxxx", h: "x.x.x.x.x.x....." };
const DR_FILL_TOM: DrumBar = { k: "x...............", s: "....x.x.........", h: "x.x.x.x.........", t: "........hhh.lll." };
const DR_CITY: DrumBar = { k: "x..x..x.x..x..x.", s: "....x.......x...", h: "x-x-x-x-x-x-x-x-" };
const DR_CITY_B: DrumBar = { k: "x..x..x.x..x..x.", s: "....x..g....x.gg", h: "x-x-x-xox-x-x-xo" };
const DR_ORBIT: DrumBar = { k: "x.......x.x.....", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." };
const DR_ORBIT_B: DrumBar = { k: "x.......x.x...x.", s: "....x.......x...", h: "x-x-x-x-x-x-x-x-" };
const DR_BOSS: DrumBar = { k: "x..x..x.x..x..x.", s: "....x.......x...", h: "x-x-x-x-x-x-x-x-" };
const DR_BOSS_DBL: DrumBar = { k: "xyxyxyxyxyxyxyxy", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." };
const DR_BOSS_FILL: DrumBar = { k: "x.x.x.x.x.......", s: "....x...xxxxxxxx", h: "x.x.x.x........." };
const DR_HALF: DrumBar = { k: "x.......x.x.....", s: "........x.......", h: "x.x.x.x.x.x.x.x." };

function forBars(from: number, to: number, fn: (bar: number) => void): void {
    for (let b = from; b < to; b++) fn(b);
}

// ---------------------------------------------------------------------------
// Tracks (all melodies are original)
// ---------------------------------------------------------------------------

/** Title / attract: D minor, 140 BPM, 24 bars, heroic and spacious. */
function trackTitle(sr: number): Rendered {
    const c = makeCtx(sr, 140, 24 * 16, 0);
    const kit = makeKit(sr, "title", false);
    setChords(c, ["Dm", "Dm", "Bb", "C", "Dm", "Bb", "F", "C", "Dm", "Bb", "C", "A", "Gm", "Dm", "Bb", "A", "Gm", "C", "F", "A", "Bb", "C", "A", "A"]);
    const A = ["d5 - - - a4 - d5 e5", "f5 - - - e5 - d5 -", "c5 - - - a4 - c5 d5", "e5 - - - g5 - e5 -", "f5 - - e5 d5 - a5 -", "g5 - f5 - d5 - bb4 -", "c5 - e5 - g5 - e5 -", "c#5 - - - e5 - - -"];
    const B = ["bb5 - - a5 g5 - d5 -", "f5 - - e5 d5 - a4 -", "d5 - f5 - bb5 - a5 g5", "a5 - - - e5 - c#5 -", "g5 - - f5 d5 - bb4 -", "c5 - e5 - g5 - c6 -", "a5 - - g5 f5 - c5 -", "e5 - - - - - - -"];
    melody(c, BRASS, 4, A, 2, 0.4, 0, 0.3);
    melody(c, BRASS, 12, B, 2, 0.4, 0, 0.3);
    melody(c, LEAD_PULSE, 12, B, 2, 0.12, -0.35, 0.2, -12);
    pad(c, PAD, 0, 24, 55, 0.05);
    forBars(0, 24, (b) => arp(c, ARP, b, b < 4 || b >= 20 ? "0 . 1 . 2 . 3 . 4 . 3 . 2 . 1 ." : "0 1 2 3 2 1 0 1 2 3 4 3 2 1 2 3", 62, 0.13, 0.35));
    forBars(0, 24, (b) => {
        if (b < 2) bassLine(c, BASS, b, "0 - - - - - - -", 2, 28, 0.42);
        else if (b < 4) bassLine(c, BASS, b, "0 - - 0 - - 12 -", 2, 28, 0.42);
        else bassLine(c, BASS, b, "0 - 0 12 0 - 0 12", 2, 28, 0.42);
    });
    forBars(2, 24, (b) => {
        if (b === 3 || b === 11 || b === 23) drums(c, kit, b, DR_FILL);
        else if (b === 19) drums(c, kit, b, DR_FILL_TOM);
        else drums(c, kit, b, b < 4 ? DR_INTRO : DR_HALF);
    });
    [4, 12, 20].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.38, 0.5);
    return master(c, 0.85);
}

/** Area 1 CIRRUS LINE: A minor, 156 BPM, 32 bars, bright driving sky stage. */
function trackArea1(sr: number): Rendered {
    const c = makeCtx(sr, 156, 32 * 16, 0);
    const kit = makeKit(sr, "area1", false);
    setChords(c, ["Am", "Am", "F", "G", "Am", "F", "C", "G", "Am", "F", "G", "E", "Dm", "Am", "F", "E", "Dm", "G", "C", "E", "Am", "F", "C", "G", "Am", "F", "G", "E", "F", "G", "Am", "E"]);
    const A = ["e5 - - a4 c5 - e5 -", "f5 - e5 - c5 - a4 -", "g5 - - e5 c5 - g4 -", "d5 - - b4 d5 - g5 -", "a5 - - g5 e5 - c5 -", "f5 - e5 - d5 - c5 -", "b4 - c5 - d5 - b4 -", "g#4 - - - b4 - e5 -"];
    const B = ["d5 - f5 - a5 - - f5", "e5 - - c5 a4 - c5 e5", "f5 - - a5 g5 - f5 -", "e5 - - - d5 - b4 -", "a4 - d5 - f5 - e5 d5", "d5 - b4 - g4 - b4 d5", "e5 - g5 - c6 - b5 g5", "g#5 - - - - - . ."];
    const OUT = ["a5 - g5 - f5 - e5 -", "d5 - - - b4 - - -", "c5 - - - e5 - - -", "b4 - - - g#4 - - -"];
    melody(c, BRASS, 4, A, 2, 0.4, 0, 0.28);
    melody(c, BRASS, 12, B, 2, 0.4, 0, 0.28);
    melody(c, BRASS, 20, A, 2, 0.36, 0.1, 0.28);
    melody(c, LEAD_PULSE, 20, A, 2, 0.16, -0.4, 0.25, -12);
    melody(c, LEAD_PULSE, 28, OUT, 2, 0.22, -0.2, 0.3);
    pad(c, PAD, 12, 20, 57, 0.035);
    forBars(0, 32, (b) => arp(c, ARP, b, "0 1 2 3 4 3 2 1 0 1 2 3 4 3 2 1", 64, 0.12, 0.3));
    forBars(0, 32, (b) => bassLine(c, BASS, b, b < 2 ? "0 . . 0 . . 0 ." : "0 0 12 0 0 12 0 12", 2, 28, 0.45));
    forBars(0, 32, (b) => {
        if (b < 2) drums(c, kit, b, DR_INTRO);
        else if (b === 11 || b === 27 || b === 3) drums(c, kit, b, DR_FILL);
        else if (b === 19 || b === 31) drums(c, kit, b, DR_FILL_TOM);
        else drums(c, kit, b, (b >= 12 && b < 20) || b >= 28 ? DR_DRIVE_B : DR_DRIVE);
    });
    [0, 4, 12, 20, 28].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.35, 0.45);
    return master(c, 0.85);
}

/** Area 2 NEON GRID: E minor, 164 BPM, 32 bars, syncopated night-city drive. */
function trackArea2(sr: number): Rendered {
    const c = makeCtx(sr, 164, 32 * 16, 0);
    const kit = makeKit(sr, "area2", false);
    setChords(c, ["Em", "Em", "C", "D", "Em", "C", "D", "Em", "Am", "C", "B", "B", "Am", "Em", "C", "D", "Am", "C", "F", "B", "Em", "C", "D", "Em", "Am", "C", "B", "B", "C", "D", "B", "B"]);
    const A = ["e5 - - g5 - - b5 -", "c6 - b5 - g5 - e5 -", "f#5 - - a5 - - d6 -", "b5 - - - g5 - e5 -", "a5 - - c6 - - b5 a5", "g5 - - e5 - - c5 -", "d#5 - - f#5 - - b5 -", "a5 - g5 - f#5 - d#5 -"];
    const B = ["e5 - a5 - c6 - b5 -", "g5 - - - e5 - b4 -", "c5 - e5 - g5 - c6 -", "d6 - c6 - a5 - f#5 -", "e6 - - - c6 - a5 -", "g5 - e5 - c5 - e5 g5", "a5 - - - c6 - - -", "b5 - - - a5 - f#5 d#5"];
    melody(c, LEAD_PULSE, 4, A, 2, 0.3, 0.1, 0.3);
    melody(c, BRASS, 4, A, 2, 0.2, -0.1, 0.2, -12);
    melody(c, BRASS, 12, B, 2, 0.4, 0, 0.3);
    melody(c, BRASS, 20, A, 2, 0.4, 0, 0.3);
    melody(c, LEAD_PULSE, 20, A, 2, 0.15, 0.4, 0.3);
    forBars(28, 32, (b) => stabs(c, STAB, b, "x . . x . . x . . . x . x . . .", 64, 0.16, 0.25));
    forBars(0, 32, (b) => arp(c, ARP, b, b < 4 ? "0 . 2 . 4 . 2 . 1 . 3 . 5 . 3 ." : "0 2 4 2 1 3 5 3 0 2 4 2 1 3 5 3", 59, 0.11, 0.3));
    forBars(0, 32, (b) => bassLine(c, BASS, b, "0 . 0 12 . 0 . 12 0 . 0 12 . 0 7 12", 1, 28, 0.45));
    pad(c, PAD_DARK, 12, 20, 55, 0.04);
    forBars(0, 32, (b) => {
        if (b < 2) drums(c, kit, b, { k: "x..x..x.x..x..x.", h: "x-x-x-x-x-x-x-x-" });
        else if (b === 3 || b === 11 || b === 27) drums(c, kit, b, DR_FILL);
        else if (b === 19 || b === 31) drums(c, kit, b, DR_FILL_TOM);
        else drums(c, kit, b, (b >= 12 && b < 20) || b >= 28 ? DR_CITY_B : DR_CITY);
    });
    [0, 4, 12, 20, 28].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.35, 0.45);
    return master(c, 0.85);
}

/** Area 3 AURORA ORBIT: C minor (harmonic), 150 BPM, 32 bars, wide arpeggios. */
function trackArea3(sr: number): Rendered {
    const c = makeCtx(sr, 150, 32 * 16, 0);
    const kit = makeKit(sr, "area3", false);
    setChords(c, ["Cm", "Cm", "Ab", "Bb", "Cm", "Ab", "Eb", "Bb", "Fm", "Ab", "G", "G", "Fm", "Cm", "Ab", "Bb", "Fm", "Db", "G", "G", "Cm", "Ab", "Eb", "Bb", "Fm", "Ab", "G", "G", "Ab", "Bb", "G", "G"]);
    const A = ["g4 - c5 - eb5 - g5 -", "ab5 - - g5 eb5 - c5 -", "bb4 - eb5 - g5 - bb5 -", "ab5 - g5 - f5 - d5 -", "c5 - f5 - ab5 - c6 -", "bb5 - ab5 - g5 - eb5 -", "d5 - - - b4 - d5 -", "g5 - f5 - d5 - b4 -"];
    const B = ["f5 - - - ab5 - c6 -", "g5 - - - eb5 - c5 -", "c5 - eb5 - ab5 - g5 -", "f5 - - - d5 - bb4 -", "ab5 - - - g5 - f5 -", "f5 - - - ab5 - db6 -", "b5 - - - g5 - d5 -", "f5 - - - d5 - b4 -"];
    melody(c, BRASS, 4, A, 2, 0.38, 0, 0.35);
    melody(c, LEAD_PULSE, 12, B, 2, 0.3, 0.15, 0.4);
    melody(c, BRASS, 12, B, 2, 0.18, -0.2, 0.2, -12);
    melody(c, BRASS, 20, A, 2, 0.36, 0, 0.35);
    melody(c, LEAD_PULSE, 20, A, 2, 0.14, -0.4, 0.3, 12);
    pad(c, PAD, 0, 32, 55, 0.035);
    forBars(0, 32, (b) => arp(c, ARP, b, "0 1 2 3 4 5 4 3 0 1 2 3 4 5 4 3", 60, 0.12, 0.45));
    forBars(0, 32, (b) => bassLine(c, BASS, b, b < 2 ? "0 - - - - - - -" : "0 - 12 0 - 12 0 7", 2, 28, 0.45));
    forBars(2, 32, (b) => {
        if (b === 3 || b === 11 || b === 27) drums(c, kit, b, DR_FILL);
        else if (b === 19 || b === 31) drums(c, kit, b, DR_FILL_TOM);
        else if (b < 4) drums(c, kit, b, DR_INTRO);
        else drums(c, kit, b, (b >= 12 && b < 20) || b >= 28 ? DR_ORBIT_B : DR_ORBIT);
    });
    [4, 12, 20, 28].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.42, 0.55);
    return master(c, 0.85);
}

/** Boss: G minor with phrygian riffing, 168 BPM, 24 bars, heavy and dark. */
function trackBoss(sr: number): Rendered {
    const c = makeCtx(sr, 168, 24 * 16, 0);
    const kit = makeKit(sr, "boss", true);
    setChords(c, ["Gm", "Gm", "Gm", "Ab", "Gm", "Gm", "Eb", "D", "Gm", "Gm", "Ab", "D", "Cm", "Cm", "Gm", "Gm", "Eb", "Ab", "D", "D", "Gm", "Ab", "Gm", "D"]);
    const A = ["g5 - - - d5 - - -", "bb5 - a5 - g5 - f#5 -", "g5 - - - eb5 - bb4 -", "a5 - - - f#5 - d5 -", "g5 - - - d6 - - -", "c6 - bb5 - a5 - g5 -", "ab5 - - - eb5 - c5 -", "f#5 - - - - - - -"];
    const B = ["c6 - - bb5 - - g5 -", "eb5 - - d5 - - c5 -", "d5 - - bb4 - - g4 -", "g5 - a5 - bb5 - d6 -", "eb6 - - d6 - - bb5 -", "c6 - - - ab5 - eb5 -", "d6 - - c6 - - a5 -", "f#5 - - - a5 - d6 -"];
    melody(c, BRASS_DARK, 4, A, 2, 0.36, 0, 0.25);
    melody(c, LEAD_PULSE, 4, A, 2, 0.12, 0.4, 0.2, -12);
    melody(c, BRASS_DARK, 12, B, 2, 0.36, 0, 0.25);
    melody(c, BRASS_DARK, 12, B, 2, 0.16, -0.4, 0.2, -12);
    forBars(0, 24, (b) => {
        if (b < 4 || b >= 20) stabs(c, STAB, b, "x - . x - . x . . . x - x . . .", 55, 0.13, 0.2);
    });
    pad(c, PAD_DARK, 4, 20, 50, 0.04);
    forBars(4, 20, (b) => arp(c, ARP, b, "0 1 2 1 0 1 2 1 3 2 1 2 3 2 1 2", 67, 0.07, 0.3));
    // the riff climbs to the chord third (minor or major) so it never fights the harmony
    forBars(0, 24, (b) => bassLine(c, BASS_HEAVY, b, `0 0 12 0 . 0 1 0 . 0 12 0 ${chordAt(c, b * 16).tones[1]!} 0 1 -2`, 1, 31, 0.42));
    forBars(0, 24, (b) => {
        if (b === 3 || b === 11 || b === 23) drums(c, kit, b, DR_BOSS_FILL);
        else if (b === 19) drums(c, kit, b, DR_FILL_TOM);
        else drums(c, kit, b, b >= 12 && b < 20 ? DR_BOSS_DBL : DR_BOSS);
    });
    [0, 4, 12, 20].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.3, 0.35);
    return master(c, 0.86);
}

/** Final boss: D minor / harmonic, 176 BPM, 32 bars, relentless gallop. */
function trackFinalBoss(sr: number): Rendered {
    const c = makeCtx(sr, 176, 32 * 16, 0);
    const kit = makeKit(sr, "final", true);
    setChords(c, ["Dm", "Dm", "Bb", "A", "Dm", "Bb", "Gm", "A", "Dm", "Bb", "E", "A", "Gm", "Dm", "Bb", "A", "Gm", "Eb", "A", "A", "Dm", "Bb", "Gm", "A", "Dm", "Bb", "E", "A", "Bb", "A", "Bb", "A"]);
    const A = ["d5 - - a5 - - f5 -", "f5 - e5 - d5 - bb4 -", "g5 - - bb5 - - d6 -", "c#6 - - - a5 - e5 -", "f5 - - e5 - - d5 -", "d6 - - c6 - - bb5 -", "g#5 - - b5 - - e6 -", "a5 - - - - - . ."];
    const B = ["bb5 - - a5 g5 - d5 -", "a5 - - g5 f5 - d5 -", "f5 - g5 - a5 - bb5 -", "c#6 - - - e6 - - -", "d6 - - c6 bb5 - g5 -", "g5 - - - bb5 - eb6 -", "c#6 - - - - - a5 -", "e5 - g5 - bb5 - c#6 -"];
    melody(c, BRASS_DARK, 4, A, 2, 0.36, 0, 0.25);
    melody(c, BRASS_DARK, 12, B, 2, 0.36, 0, 0.25);
    melody(c, LEAD_PULSE, 12, B, 2, 0.14, 0.4, 0.25, -12);
    melody(c, BRASS_DARK, 20, A, 2, 0.34, 0.1, 0.25);
    melody(c, LEAD_PULSE, 20, A, 2, 0.16, -0.4, 0.25, -12);
    forBars(28, 32, (b) => stabs(c, STAB, b, "x - x - x . . x - x . . x . x .", 57, 0.13, 0.2));
    pad(c, PAD_DARK, 0, 32, 50, 0.04);
    forBars(0, 32, (b) => arp(c, ARP, b, "0 1 2 3 0 1 2 3 0 1 2 3 4 3 2 1", 62, 0.07, 0.3));
    forBars(0, 32, (b) => bassLine(c, BASS_HEAVY, b, "0 0 12 0 0 12 0 0 12 0 0 12 0 1 0 -1", 1, 26, 0.42));
    forBars(0, 32, (b) => {
        if (b === 3 || b === 11 || b === 27) drums(c, kit, b, DR_BOSS_FILL);
        else if (b === 19 || b === 31) drums(c, kit, b, DR_FILL_TOM);
        else if ((b >= 12 && b < 20) || b >= 28) drums(c, kit, b, DR_BOSS_DBL);
        else drums(c, kit, b, b < 2 ? { k: "x.x.x.x.x.x.x.x.", h: "x-x-x-x-x-x-x-x-" } : DR_BOSS);
    });
    [0, 4, 12, 20, 28].forEach((b) => crash(c, kit, b));
    echo(c, 3, 0.3, 0.35);
    return master(c, 0.86);
}

/** Area clear: A minor rising into an A major resolution, ~4 s. */
function jingleClear(sr: number): Rendered {
    const c = makeCtx(sr, 150, 0, 4.0);
    const kit = makeKit(sr, "clear", false);
    setChords(c, ["Am", "F|G", "A"]);
    const lead = ["a4 c5 e5 a5 g5 - - . e5 - g5 - c6 - - .", "c6 - - . a5 - c6 - d6 - - . b5 - d6 -", "c#6 - - - - -"];
    melody(c, BRASS, 0, lead, 1, 0.42, 0, 0.3);
    melody(c, LEAD_PULSE, 0, lead, 1, 0.14, -0.4, 0.2, -12);
    note(c, LEAD_PULSE, { s: 32, l: 6, m: noteToMidi("e6") }, 0.12, 0.4, 0.3);
    pad(c, PAD, 0, 2, 57, 0.04);
    voicing(parseChord("A"), 57).forEach((m, i) => note(c, PAD, { s: 32, l: 6, m }, 0.09, (i - 1) * 0.6, 0.15));
    bassLine(c, BASS, 0, "0 0 12 0 0 12 0 12", 2, 28, 0.45);
    bassLine(c, BASS, 1, "0 0 12 0 0 0 12 0", 2, 28, 0.45);
    note(c, BASS, { s: 32, l: 6, m: 33 }, 0.5, 0, 0);
    drums(c, kit, 0, { k: "x.......x.......", s: "....x.......x...", h: "x.x.x.x.x.x.x.x." });
    drums(c, kit, 1, { k: "x.......x.......", s: "....x...xgxgxxxx", h: "x.x.x.x........." });
    hit(c, kit.kick, 32, 0.95, 0);
    hit(c, kit.crash, 32, 0.35, -0.2);
    echo(c, 3, 0.3, 0.35);
    return master(c, 0.82, 0.15);
}

/** Game over: slow descending D minor lament, ~5 s. */
function jingleGameOver(sr: number): Rendered {
    const c = makeCtx(sr, 88, 0, 5.0);
    const kit = makeKit(sr, "gameover", true);
    setChords(c, ["Dm|Bb", "A|Dm"]);
    melody(c, LEAD_SAD, 0, ["d5 - a4 - bb4 - f4 -", "e4 - c#4 - d4 -"], 2, 0.38, 0, 0.35);
    pad(c, { ...PAD, a: 0.3, r: 0.4, lp: 1100 }, 0, 2, 50, 0.05);
    [{ s: 0, m: 38 }, { s: 8, m: 34 }, { s: 16, m: 33 }, { s: 24, m: 38 }].forEach((e) => note(c, BASS_SOFT, { s: e.s, l: e.s === 24 ? 4 : 8, m: e.m }, 0.4, 0, 0));
    [0, 8, 16, 24].forEach((s) => hit(c, kit.tomL, s, 0.45, 0));
    echo(c, 3, 0.35, 0.4);
    return master(c, 0.8, 0.5);
}

const MUSIC: Record<MusicId, (sr: number) => Rendered> = {
    title: trackTitle,
    area1: trackArea1,
    area2: trackArea2,
    area3: trackArea3,
    boss: trackBoss,
    finalBoss: trackFinalBoss,
    clear: jingleClear,
    gameOver: jingleGameOver,
};

export function renderMusic(id: MusicId, sampleRate: number): Rendered {
    const fn = MUSIC[id];
    if (!fn) throw new Error(`unknown music "${String(id)}"`);
    return fn(sampleRate);
}
