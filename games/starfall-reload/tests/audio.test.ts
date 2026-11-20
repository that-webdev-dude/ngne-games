import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MUSIC_IDS, renderMusic, renderSfx, SFX_IDS, type Rendered } from "../src/audio/synth.ts";

const SR = 44100;

function stats(r: Rendered): { peak: number; rms: number; mean: number; finite: boolean; frames: number } {
    let peak = 0;
    let sq = 0;
    let sum = 0;
    let finite = true;
    let count = 0;
    for (const ch of r.channels) {
        for (let i = 0; i < ch.length; i++) {
            const x = ch[i]!;
            if (!Number.isFinite(x)) finite = false;
            const a = Math.abs(x);
            if (a > peak) peak = a;
            sq += x * x;
            sum += x;
            count++;
        }
    }
    return { peak, rms: Math.sqrt(sq / count), mean: sum / count, finite, frames: r.channels[0]!.length };
}

function energy(r: Rendered): number {
    let e = 0;
    for (const ch of r.channels) for (let i = 0; i < ch.length; i++) e += ch[i]! * ch[i]!;
    return e / r.channels.length / r.sampleRate;
}

function sameBuffers(a: Rendered, b: Rendered): boolean {
    if (a.channels.length !== b.channels.length) return false;
    return a.channels.every((ch, k) => {
        const other = b.channels[k]!;
        if (ch.length !== other.length) return false;
        for (let i = 0; i < ch.length; i++) if (ch[i] !== other[i]) return false;
        return true;
    });
}

const sfx = new Map(SFX_IDS.map((id) => [id, renderSfx(id, SR)] as const));
const music = new Map(MUSIC_IDS.map((id) => [id, renderMusic(id, SR)] as const));

describe("sfx", () => {
    for (const id of SFX_IDS) {
        it(`${id} renders a short, clean, non-looping cue`, () => {
            const r = sfx.get(id)!;
            const s = stats(r);
            assert.equal(r.sampleRate, SR);
            assert.equal(r.loop, false);
            assert.ok(r.channels.length === 1 || r.channels.length === 2, "mono or stereo");
            assert.ok(r.channels.every((ch) => ch.length === s.frames), "channels share one length");
            assert.ok(s.finite, "finite samples");
            assert.ok(s.peak <= 0.95, `peak ${s.peak}`);
            assert.ok(s.rms > 0.005, `non-silent (rms ${s.rms})`);
            assert.ok(Math.abs(s.mean) < 0.005, `no DC offset (mean ${s.mean})`);
            assert.ok(s.frames / SR <= 3, `duration ${s.frames / SR}s`);
            for (const ch of r.channels) {
                assert.ok(Math.abs(ch[0]!) < 1e-3 && Math.abs(ch[ch.length - 1]!) < 1e-3, "faded ends");
            }
        });
    }

    it("meets per-cue duration targets", () => {
        const dur = (id: (typeof SFX_IDS)[number]): number => sfx.get(id)!.channels[0]!.length / SR;
        assert.ok(dur("shot") <= 0.06, "shot <= 60 ms");
        assert.ok(dur("hit") <= 0.05, "hit is a tiny tick");
        assert.ok(dur("graze") <= 0.08, "graze is tiny");
        assert.ok(dur("bossBreak") >= 2 && dur("bossBreak") <= 3, "bossBreak 2-3 s");
        assert.ok(dur("warning") >= 1.8 && dur("warning") <= 2.2, "warning ~2 s");
        assert.ok(dur("barrier") >= 0.4 && dur("barrier") <= 0.6, "barrier ~0.5 s");
    });

    it("tiers explosions by weight (duration, energy, peak)", () => {
        const s = sfx.get("explodeS")!;
        const m = sfx.get("explodeM")!;
        const l = sfx.get("explodeL")!;
        assert.ok(s.channels[0]!.length < m.channels[0]!.length && m.channels[0]!.length < l.channels[0]!.length);
        assert.ok(energy(s) < energy(m) && energy(m) < energy(l));
        assert.ok(stats(s).peak < stats(m).peak && stats(m).peak < stats(l).peak);
        assert.ok(energy(l) < energy(sfx.get("bossBreak")!));
    });

    it("keeps frequent cues quieter than impacts", () => {
        const p = (id: (typeof SFX_IDS)[number]): number => stats(sfx.get(id)!).peak;
        assert.ok(p("shot") < p("explodeS"));
        assert.ok(p("enemyShot") < p("shot"));
        assert.ok(p("graze") < p("shot"));
    });

    it("is deterministic", () => {
        for (const id of SFX_IDS) assert.ok(sameBuffers(sfx.get(id)!, renderSfx(id, SR)), id);
    });
});

describe("music", () => {
    const loops = ["title", "area1", "area2", "area3", "boss", "finalBoss"] as const;

    for (const id of MUSIC_IDS) {
        it(`${id} renders clean stereo`, () => {
            const r = music.get(id)!;
            const s = stats(r);
            assert.equal(r.sampleRate, SR);
            assert.equal(r.channels.length, 2);
            assert.equal(r.channels[0]!.length, r.channels[1]!.length);
            assert.ok(s.finite, "finite samples");
            assert.ok(s.peak <= 0.95, `peak ${s.peak}`);
            assert.ok(s.rms > 0.03, `non-silent (rms ${s.rms})`);
            assert.ok(Math.abs(s.mean) < 0.002, `no DC offset (mean ${s.mean})`);
        });
    }

    for (const id of loops) {
        it(`${id} loops seamlessly over 32-64 s`, () => {
            const r = music.get(id)!;
            assert.equal(r.loop, true);
            const sec = r.channels[0]!.length / SR;
            assert.ok(sec >= 32 && sec <= 64, `duration ${sec}s`);
            for (const ch of r.channels) {
                // the wrap step must look like any ordinary sample step inside the loop
                let maxStep = 0;
                for (let i = 1; i < ch.length; i++) maxStep = Math.max(maxStep, Math.abs(ch[i]! - ch[i - 1]!));
                const seam = Math.abs(ch[0]! - ch[ch.length - 1]!);
                assert.ok(seam < 0.1 && seam <= maxStep, `seam ${seam} (max in-loop step ${maxStep})`);
            }
        });
    }

    it("clear and gameOver are one-shot jingles of ~4 s and ~5 s", () => {
        const clear = music.get("clear")!;
        const over = music.get("gameOver")!;
        assert.equal(clear.loop, false);
        assert.equal(over.loop, false);
        const c = clear.channels[0]!.length / SR;
        const o = over.channels[0]!.length / SR;
        assert.ok(c >= 3.5 && c <= 4.5, `clear ${c}s`);
        assert.ok(o >= 4.5 && o <= 5.5, `gameOver ${o}s`);
        for (const r of [clear, over]) for (const ch of r.channels) assert.ok(Math.abs(ch[ch.length - 1]!) < 1e-3, "faded tail");
    });

    it("is deterministic", () => {
        for (const id of MUSIC_IDS) assert.ok(sameBuffers(music.get(id)!, renderMusic(id, SR)), id);
    });
});
