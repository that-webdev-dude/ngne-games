import type { ImageAsset } from "@ngne/core";
import { FIELD_W } from "../config/view.ts";
import { Pixels, bayer, makeNoise, mix, rampPick } from "./pixels.ts";

/**
 * Procedural area backdrops. Every layer is 288×512 and tiles vertically so it can scroll
 * forever; colours are quantised to small ramps with ordered dithering (no smooth gradients).
 */
export const TILE_W = 288,
    TILE_H = 512;

/** Vertical avenue centres in the city layer (render draws traffic along them). */
export const AVENUES = [47, 119, 175, 247] as const;

/** Sideways parallax: px of layer shift per px of ship offset from centre, per unit of vertical factor. */
export const PARALLAX = { strength: 0.05 } as const;

/**
 * Whole-pixel sideways shift of a backdrop layer whose vertical scroll factor is `factor`:
 * `−(shipX − FIELD_W / 2) × strength × factor`, rounded symmetrically; none under reduced motion.
 */
export function parallaxShift(shipX: number, factor: number, strength: number, calm: boolean): number {
    if (calm) return 0;
    const v = -(shipX - FIELD_W / 2) * strength * factor;
    return Math.sign(v) * Math.round(Math.abs(v)) + 0;
}

type Layer = () => Pixels;

const OCEAN = [0x081428, 0x0c1f3a, 0x12304f, 0x1b4466];
const CLOUD = [0x2e3658, 0x48527a, 0x6a76a0, 0x95a2c6, 0xc6d0e8, 0xf2f0f4];
const DAWN = 0xffd9a8;

const cirrusFar: Layer = () => {
    const n = makeNoise(21);
    const p = new Pixels(TILE_W, TILE_H);
    for (let y = 0; y < TILE_H; y++)
        for (let x = 0; x < TILE_W; x++) {
            const v = n(x, y, 3, 5, 5, TILE_W, TILE_H);
            const glint = Math.max(0, n(x, y, 6, 10, 3, TILE_W, TILE_H) - 0.62) * 3;
            p.set(x, y, rampPick(OCEAN, v * 0.9 + glint, x, y));
        }
    return p;
};

/** Cloud deck: density field, embossed from the top-left light, warm dawn rims, dithered edges. */
function clouds(seed: number, coverage: number, cells: number, wisp: boolean): Pixels {
    const n = makeNoise(seed);
    const p = new Pixels(TILE_W, TILE_H);
    const field = new Float32Array(TILE_W * TILE_H);
    for (let y = 0; y < TILE_H; y++)
        for (let x = 0; x < TILE_W; x++) field[y * TILE_W + x] = n(x, y, cells, Math.round((cells * TILE_H) / TILE_W), 5, TILE_W, TILE_H);
    const at = (x: number, y: number) => field[(((y % TILE_H) + TILE_H) % TILE_H) * TILE_W + (((x % TILE_W) + TILE_W) % TILE_W)]!;
    for (let y = 0; y < TILE_H; y++)
        for (let x = 0; x < TILE_W; x++) {
            const d = at(x, y);
            const edge = d - coverage;
            if (edge < 0) continue;
            if (edge < 0.035 && bayer(x, y) > edge / 0.035) continue;
            if (wisp) {
                p.set(x, y, edge > 0.06 ? 0xe8eefa : 0xaab6d6, edge > 0.06 ? 150 : 90);
                continue;
            }
            const light = (at(x - 3, y - 3) - at(x + 3, y + 3)) * 6;
            const body = Math.min(1, edge * 3.2);
            let c = rampPick(CLOUD, 0.25 + body * 0.35 - light * 0.35, x, y);
            if (light < -0.22 && edge < 0.12) c = mix(c, DAWN, 0.55);
            p.set(x, y, c);
        }
    return p;
}

const BLOCKS = [0x161b2e, 0x1c2238, 0x222a44, 0x1a1f33, 0x252b48];

const gridCity: Layer = () => {
    const p = new Pixels(TILE_W, TILE_H);
    p.rect(0, 0, TILE_W, TILE_H, 0x0d1020);
    // Horizontal streets at fixed rows (sums to 512 for a seamless wrap).
    const rows = [0, 58, 120, 166, 230, 300, 352, 420, 470];
    const cols = [0, 50, 122, 178, 250, 288];
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let r = 0; r < rows.length; r++) {
        const top = rows[r]! + 5,
            bottom = (rows[r + 1] ?? TILE_H) - 1;
        for (let c = 0; c < cols.length - 1; c++) {
            const left = cols[c]! + 6,
                right = cols[c + 1]! - 1;
            // Subdivide each block into 1–3 roofs.
            let x = left;
            while (x < right - 6) {
                const w = Math.min(right - x, 14 + Math.floor(rand() * 26));
                let y = top;
                while (y < bottom - 6) {
                    const h = Math.min(bottom - y, 12 + Math.floor(rand() * 30));
                    roof(p, x, y, w - 2, h - 2, BLOCKS[Math.floor(rand() * BLOCKS.length)]!, rand);
                    y += h;
                }
                x += w;
            }
        }
    }
    // Streets: dark asphalt with amber lamps; avenues get centre dashes.
    for (const y0 of rows) {
        for (let x = 0; x < TILE_W; x++) for (let k = 0; k < 5; k++) p.set(x, y0 + k, 0x10131f);
        for (let x = 4; x < TILE_W; x += 9) p.set(x, y0, 0x8a5a2a);
    }
    for (const x0 of cols.slice(1, -1)) {
        for (let y = 0; y < TILE_H; y++) for (let k = 0; k < 6; k++) p.set(x0 + k, y, 0x10131f);
        for (let y = 3; y < TILE_H; y += 10) {
            p.set(x0, y, 0x8a5a2a);
            p.set(x0 + 5, y + 5, 0x8a5a2a);
        }
        for (let y = 0; y < TILE_H; y += 6) p.set(x0 + 3, y, 0x2a2f45);
    }
    return p;
};

function roof(p: Pixels, x: number, y: number, w: number, h: number, base: number, rand: () => number): void {
    if (w < 4 || h < 4) return;
    // Taller buildings cast a longer shadow to the lower right and catch more light.
    const tall = rand() < 0.22;
    const drop = tall ? 4 : 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (i >= w - drop || j >= h - drop) p.set(x + i + drop, y + j + drop, 0x07080f);
    if (tall) base = mix(base, 0x4a5a82, 0.35);
    p.rect(x, y, w, h, base);
    // Bevel: lit top-left edge, shadow bottom-right (planar read from altitude).
    for (let i = 0; i < w; i++) {
        p.set(x + i, y, mix(base, 0x5a6a96, 0.5));
        p.set(x + i, y + h - 1, 0x090b14);
    }
    for (let j = 0; j < h; j++) {
        p.set(x, y + j, mix(base, 0x5a6a96, 0.35));
        p.set(x + w - 1, y + j, 0x090b14);
    }
    const kind = rand();
    if (kind < 0.25 && w > 10 && h > 10) {
        // Rooftop plant boxes.
        p.rect(x + 3, y + 3, 4, 3, 0x2f3a5a);
        p.rect(x + w - 8, y + h - 7, 5, 4, 0x2f3a5a);
    } else if (kind < 0.4) {
        // Lit windows / skylights.
        for (let j = 3; j < h - 3; j += 4) for (let i = 3; i < w - 3; i += 3) if (rand() < 0.35) p.set(x + i, y + j, rand() < 0.7 ? 0x9a7a44 : 0x3a7a96);
    } else if (kind < 0.5 && w > 12 && h > 12) {
        // Helipad.
        p.rect(x + w / 2 - 4, y + h / 2 - 4, 8, 8, 0x2a3350);
        p.set(x + w / 2 - 1, y + h / 2 - 1, 0xe8c252);
        p.set(x + w / 2, y + h / 2, 0xe8c252);
    } else if (kind < 0.58) {
        // Park.
        p.rect(x + 1, y + 1, w - 2, h - 2, 0x17261f);
        for (let k = 0; k < (w * h) / 30; k++) p.set(x + 2 + rand() * (w - 4), y + 2 + rand() * (h - 4), 0x2c4636);
    }
    if (rand() < 0.18) p.set(x + 2, y + 2, 0xff3d4f); // aviation light
}

const gridHaze: Layer = () => clouds(44, 0.6, 3, true);

const EARTH = [0x040a16, 0x07122a, 0x0c1d3c, 0x14294f];
const AURORA = [0x0f3a3a, 0x1d6a58, 0x2fae7a, 0x7affc0];

const auroraEarth: Layer = () => {
    const n = makeNoise(55);
    const p = new Pixels(TILE_W, TILE_H);
    for (let y = 0; y < TILE_H; y++)
        for (let x = 0; x < TILE_W; x++) {
            const sea = n(x, y, 3, 5, 4, TILE_W, TILE_H);
            let c = rampPick(EARTH, sea * 0.8, x, y);
            const cloud = n(x + 400, y, 4, 7, 5, TILE_W, TILE_H);
            if (cloud > 0.58) c = rampPick([0x1d2a48, 0x2e3e62, 0x44587e], (cloud - 0.58) * 4, x, y);
            // Curtain bands: wavy lanes running down-screen.
            const wave = Math.sin((x / TILE_W) * Math.PI * 4 + n(x, y, 2, 4, 3, TILE_W, TILE_H) * 6 + (y / TILE_H) * Math.PI * 2);
            // Thin curtains: only the crest of each wave glows, dithered out at the edges.
            const band = Math.max(0, wave - 0.86) * 7 * n(x, y + 90, 2, 6, 3, TILE_W, TILE_H) * 1.5;
            if (band > 0.08 && bayer(x, y) < band * 1.6) c = rampPick(AURORA, Math.min(1, band), x, y);
            if (band > 0.8 && bayer(x, y) < 0.2) c = 0xff8ad8;
            // Sparse city lights on the night side.
            const city = n(x + 900, y + 900, 10, 18, 2, TILE_W, TILE_H);
            if (city > 0.78 && bayer(x, y) < (city - 0.78) * 2) c = 0xffc070;
            p.set(x, y, c);
        }
    return p;
};

const auroraStars: Layer = () => {
    const n = makeNoise(77);
    const p = new Pixels(TILE_W, TILE_H);
    for (let y = 0; y < TILE_H; y++)
        for (let x = 0; x < TILE_W; x++) {
            const v = n(x, y, 2, 4, 5, TILE_W, TILE_H);
            p.set(x, y, rampPick([0x04030a, 0x0a0820, 0x170f36, 0x2a1650], Math.max(0, v - 0.3) * 1.6, x, y));
        }
    let s = 9;
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 520; i++) {
        const x = Math.floor(rand() * TILE_W),
            y = Math.floor(rand() * TILE_H);
        const b = rand();
        p.set(x, y, b > 0.92 ? 0xffffff : b > 0.6 ? 0xb2c8ff : 0x6a6aa8);
        if (b > 0.985) {
            p.set(x - 1, y, 0x8aa0e0);
            p.set(x + 1, y, 0x8aa0e0);
            p.set(x, y - 1, 0x8aa0e0);
            p.set(x, y + 1, 0x8aa0e0);
        }
    }
    return p;
};

/** Cabinet side panels: brushed dark metal, bevels, rivets and vents. Left and right halves. */
const panels = (): Pixels => {
    const W = 176,
        H = 360;
    const n = makeNoise(91);
    const p = new Pixels(W * 2, H);
    for (let side = 0; side < 2; side++) {
        const ox = side * W;
        for (let y = 0; y < H; y++)
            for (let x = 0; x < W; x++) {
                const brushed = n(x * 0.2, y * 3, 3, 40, 3, W, H);
                p.set(ox + x, y, rampPick([0x0a0c18, 0x0e1122, 0x12162a, 0x171c34], 0.35 + brushed * 0.45, x, y));
            }
        // Bevelled frame plates.
        const inner = side === 0 ? W - 8 : 0;
        p.rect(ox + inner, 0, 8, H, 0x0a0c18);
        for (let y = 0; y < H; y++) {
            p.set(ox + inner + (side === 0 ? 0 : 7), y, 0x2a3354);
            p.set(ox + inner + (side === 0 ? 7 : 0), y, 0x05060c);
        }
        // Rivets.
        for (const ry of [6, H - 8])
            for (const rx of [10, W / 2, W - 20]) {
                p.rect(ox + rx, ry, 3, 3, 0x2e385c);
                p.set(ox + rx, ry, 0x5a6a96);
                p.set(ox + rx + 2, ry + 2, 0x05060c);
            }
        // Vent slots near the bottom.
        for (let i = 0; i < 6; i++) {
            const vy = H - 46 + i * 6;
            const vx = side === 0 ? 14 : 32;
            p.rect(ox + vx, vy, 126, 2, 0x05060c);
            for (let k = 0; k < 126; k++) p.set(ox + vx + k, vy + 2, 0x232a46);
        }
        // Hazard chevrons at the very bottom.
        for (let y = H - 10; y < H - 4; y++)
            for (let x = 8; x < W - 8; x++) if (((x + y) >> 2) % 2 === 0) p.set(ox + x, y, 0x3a2e14);
    }
    return p;
};

const LAYERS: Record<string, Layer> = {
    "bg-cirrus-far": cirrusFar,
    "bg-cirrus-clouds": () => clouds(12, 0.5, 4, false),
    "bg-cirrus-wisps": () => clouds(13, 0.64, 3, true),
    "bg-grid-city": gridCity,
    "bg-grid-haze": gridHaze,
    "bg-aurora-earth": auroraEarth,
    "bg-aurora-stars": auroraStars,
    panels,
};

export function backdropAssets(): ImageAsset[] {
    return Object.entries(LAYERS).map(([id, make]) => ({
        id,
        kind: "image",
        load: async () => createImageBitmap(make().toCanvas(), { premultiplyAlpha: "none", colorSpaceConversion: "none" }),
        dispose: (bitmap: ImageBitmap) => bitmap.close(),
    }));
}
