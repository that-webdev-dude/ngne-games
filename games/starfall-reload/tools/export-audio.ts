// Renders every SFX cue and music track to 16-bit WAV for review and prints
// measured properties. Output goes to the given folder (default: the OS temp directory):
//   node --experimental-strip-types tools/export-audio.ts [sampleRate] [outDir]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MUSIC_IDS, renderMusic, renderSfx, SFX_IDS, type Rendered } from "../src/audio/synth.ts";

const sampleRate = Number(process.argv[2] ?? 44100);
const outDir = process.argv[3] ?? join(tmpdir(), "starfall-reload-audio");

function toWav(r: Rendered): Uint8Array {
    const chs = r.channels;
    const frames = chs[0]!.length;
    const blockAlign = chs.length * 2;
    const dataBytes = frames * blockAlign;
    const buf = new ArrayBuffer(44 + dataBytes);
    const v = new DataView(buf);
    const text = (at: number, s: string): void => {
        for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
    };
    text(0, "RIFF");
    v.setUint32(4, 36 + dataBytes, true);
    text(8, "WAVE");
    text(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, chs.length, true);
    v.setUint32(24, r.sampleRate, true);
    v.setUint32(28, r.sampleRate * blockAlign, true);
    v.setUint16(32, blockAlign, true);
    v.setUint16(34, 16, true);
    text(36, "data");
    v.setUint32(40, dataBytes, true);
    let o = 44;
    for (let i = 0; i < frames; i++) {
        for (const ch of chs) {
            const x = Math.max(-1, Math.min(1, ch[i]!));
            v.setInt16(o, Math.round(x * 32767), true);
            o += 2;
        }
    }
    return new Uint8Array(buf);
}

function measure(r: Rendered): string {
    const chs = r.channels;
    const frames = chs[0]!.length;
    let peak = 0;
    let sq = 0;
    let sum = 0;
    for (const ch of chs) {
        for (let i = 0; i < frames; i++) {
            const x = ch[i]!;
            peak = Math.max(peak, Math.abs(x));
            sq += x * x;
            sum += x;
        }
    }
    const n = frames * chs.length;
    const db = (x: number): string => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : "-inf");
    const seam = r.loop ? Math.max(...chs.map((ch) => Math.abs(ch[0]! - ch[frames - 1]!))) : NaN;
    return [
        `${(frames / r.sampleRate).toFixed(3)}s`,
        `${chs.length}ch`,
        `peak ${peak.toFixed(3)} (${db(peak)} dBFS)`,
        `rms ${db(Math.sqrt(sq / n))} dBFS`,
        `dc ${(sum / n).toExponential(1)}`,
        r.loop ? `loop seam ${seam.toExponential(2)}` : "one-shot",
    ].join("  ");
}

mkdirSync(outDir, { recursive: true });
const jobs: [string, () => Rendered][] = [
    ...SFX_IDS.map((id) => [`sfx-${id}`, () => renderSfx(id, sampleRate)] as [string, () => Rendered]),
    ...MUSIC_IDS.map((id) => [`music-${id}`, () => renderMusic(id, sampleRate)] as [string, () => Rendered]),
];
for (const [name, render] of jobs) {
    const t0 = performance.now();
    const r = render();
    const ms = performance.now() - t0;
    writeFileSync(join(outDir, `${name}.wav`), toWav(r));
    console.log(`${name.padEnd(18)} ${measure(r)}  render ${ms.toFixed(0)} ms`);
}
console.log(`wrote ${jobs.length} files to ${outDir}`);
