import { Pixels, bayer, makeNoise, rampPick } from "./pixels.ts";

/** Procedural effect textures, generated once at boot. Pixel-quantised, palette-bound. */
export interface Generated {
    name: string;
    frames: Pixels[];
}

const FIRE = [0xffffff, 0xfff0b8, 0xffb347, 0xec7424, 0xa8401a, 0x5c1d12];
const SMOKE = [0x6f5a78, 0x4a3a58, 0x342840, 0x261338];

function disc(size: number, paint: (dx: number, dy: number, d: number, x: number, y: number, p: Pixels) => void): Pixels {
    const p = new Pixels(size, size);
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
            const dx = x - c,
                dy = y - c;
            paint(dx, dy, Math.hypot(dx, dy), x, y, p);
        }
    return p;
}

/** Enemy bullet: dark rim for contrast on bright clouds, coloured body, white core. */
function bullet(size: number, body: number, rim: number): Pixels {
    const r = size / 2;
    return disc(size, (_dx, _dy, d, x, y, p) => {
        if (d > r) return;
        if (d > r - 1) p.set(x, y, 0x1a0820);
        else if (d > r - 2) p.set(x, y, rim);
        else if (d > r * 0.45) p.set(x, y, body);
        else p.set(x, y, 0xffffff);
    });
}

function needle(): Pixels {
    const p = new Pixels(5, 12);
    for (let y = 0; y < 12; y++) {
        const half = y < 2 || y > 9 ? 0 : y < 4 || y > 7 ? 1 : 1.6;
        for (let x = 0; x < 5; x++) {
            const dx = Math.abs(x - 2);
            if (dx <= half) p.set(x, y, dx < 0.5 && y > 2 && y < 9 ? 0xffffff : 0xff6fae);
            else if (dx <= half + 1) p.set(x, y, 0x1a0820);
        }
    }
    return p;
}

function glow(size: number): Pixels {
    const r = size / 2;
    return disc(size, (_dx, _dy, d, x, y, p) => {
        const t = 1 - d / r;
        if (t <= 0) return;
        // Four alpha steps with a dithered edge: reads as light, stays pixel-crisp.
        const a = t > 0.75 ? 200 : t > 0.5 ? 130 : t > 0.25 ? 70 : bayer(x, y) < t * 3 ? 30 : 0;
        if (a) p.set(x, y, 0xffffff, a);
    });
}

function ring(size: number, thickness: number): Pixels {
    const r = size / 2 - 0.5;
    return disc(size, (_dx, _dy, d, x, y, p) => {
        if (d <= r && d > r - thickness) p.set(x, y, 0xffffff);
    });
}

function explosionFrames(): Pixels[] {
    const noise = makeNoise(7);
    const frames: Pixels[] = [];
    const n = 8,
        size = 48;
    for (let f = 0; f < n; f++) {
        const t = f / (n - 1);
        const radius = 7 + 16 * Math.sqrt(t);
        frames.push(
            disc(size, (dx, dy, d, x, y, p) => {
                const wobble = (noise(x + f * 13, y, 6, 6, 3, size, size) - 0.5) * 9;
                const rr = d + wobble;
                if (rr > radius) return;
                const edge = rr / radius;
                // Hollowing smoke ring late in the animation.
                if (t > 0.55 && edge < (t - 0.55) * 2.2) return;
                const heat = 0.92 - t * 1.25 - edge * 0.85 + (noise(x, y + f * 7, 8, 8, 2, size, size) - 0.5) * 0.35;
                if (heat > 0.05) p.set(x, y, rampPick(FIRE, 1 - heat, x, y));
                else p.set(x, y, rampPick(SMOKE, Math.min(1, -heat * 2 + t * 0.4), x, y));
                void dx;
                void dy;
            }),
        );
    }
    return frames;
}

function smoke(): Pixels {
    const noise = makeNoise(11);
    return disc(32, (_dx, _dy, d, x, y, p) => {
        const v = d / 15 + (noise(x, y, 5, 5, 3, 32, 32) - 0.5) * 0.6;
        if (v < 1) p.set(x, y, rampPick(SMOKE, v, x, y), 255);
    });
}

function star(size: number): Pixels {
    const p = new Pixels(size, size);
    const c = Math.floor(size / 2);
    for (let i = 0; i < size; i++) {
        const fade = Math.abs(i - c) / c;
        const col = fade < 0.3 ? 0xffffff : 0xb2f4ff;
        p.set(c, i, col, fade < 0.8 ? 255 : 120);
        p.set(i, c, col, fade < 0.8 ? 255 : 120);
    }
    p.set(c - 1, c - 1, 0xffffff, 160);
    p.set(c + 1, c - 1, 0xffffff, 160);
    p.set(c - 1, c + 1, 0xffffff, 160);
    p.set(c + 1, c + 1, 0xffffff, 160);
    return p;
}

/** Player shots: bright, slightly translucent so they never hide enemy bullets. */
function shot(w: number, h: number, core: number, edge: number, taper = true): Pixels {
    const p = new Pixels(w, h);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const cx = Math.abs(x - (w - 1) / 2) / (w / 2);
            const ty = taper ? Math.min(1, y / 2, (h - 1 - y) / 3) : 1;
            if (cx > ty + 0.15) continue;
            p.set(x, y, cx < 0.4 ? core : edge, cx < 0.4 ? 235 : 190);
        }
    return p;
}

export function generateTextures(): Generated[] {
    return [
        { name: "px", frames: [(() => { const p = new Pixels(2, 2); p.rect(0, 0, 2, 2, 0xffffff); return p; })()] },
        { name: "b-pink", frames: [bullet(7, 0xff4fa0, 0xff9ccc)] },
        { name: "b-orange", frames: [bullet(7, 0xff8a2a, 0xffc070)] },
        { name: "b-violet", frames: [bullet(9, 0xb35cff, 0xe0b0ff)] },
        { name: "b-needle", frames: [needle()] },
        { name: "b-big", frames: [bullet(14, 0xff3355, 0xff9ab0)] },
        { name: "b-gold", frames: [bullet(8, 0xffd23a, 0xfff2a8)] },
        { name: "glow", frames: [glow(32)] },
        { name: "glow-s", frames: [glow(16)] },
        { name: "ring", frames: [ring(64, 2)] },
        { name: "ring-thin", frames: [ring(64, 1)] },
        { name: "explosion", frames: explosionFrames() },
        { name: "smoke", frames: [smoke()] },
        { name: "star", frames: [star(9)] },
        { name: "s-vulcan", frames: [shot(4, 11, 0xfff6c8, 0xffc94a)] },
        { name: "s-rail", frames: [shot(5, 26, 0xffffff, 0x46c8ee, false)] },
        { name: "s-seek", frames: [shot(5, 9, 0xffffff, 0x7fe0ff)] },
        { name: "s-bead", frames: [shot(4, 7, 0xf2ffe0, 0x9bf27a)] },
        { name: "s-shell", frames: [bullet(8, 0xff9a6a, 0xffd6b8)] },
        { name: "s-frag", frames: [shot(3, 5, 0xffffff, 0xff7a5c)] },
        { name: "s-twin", frames: [shot(3, 13, 0xffffff, 0x9bf27a)] },
    ];
}
