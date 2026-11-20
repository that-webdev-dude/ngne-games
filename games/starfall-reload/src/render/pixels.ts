/** Tiny pixel-buffer toolkit for procedural textures (effects, fonts, backgrounds). */
export type Canvas2D = OffscreenCanvas | HTMLCanvasElement;

export function makeCanvas(w: number, h: number): Canvas2D {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

export function context(c: Canvas2D): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
    const ctx = c.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
    if (!ctx) throw new Error("2D canvas unavailable");
    ctx.imageSmoothingEnabled = false;
    return ctx;
}

/** RGBA pixel buffer with integer helpers. */
export class Pixels {
    readonly data: Uint8ClampedArray;
    readonly w: number;
    readonly h: number;
    constructor(w: number, h: number) {
        this.w = w;
        this.h = h;
        this.data = new Uint8ClampedArray(w * h * 4);
    }
    set(x: number, y: number, rgb: number, a = 255): void {
        x |= 0;
        y |= 0;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
        const i = (y * this.w + x) * 4;
        this.data[i] = (rgb >> 16) & 255;
        this.data[i + 1] = (rgb >> 8) & 255;
        this.data[i + 2] = rgb & 255;
        this.data[i + 3] = a;
    }
    alpha(x: number, y: number): number {
        if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
        return this.data[(y * this.w + x) * 4 + 3]!;
    }
    rect(x: number, y: number, w: number, h: number, rgb: number, a = 255): void {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, rgb, a);
    }
    /** Adds a 1-px outline in `rgb` around every opaque pixel. */
    outline(rgb: number, a = 255): void {
        const mask = new Uint8Array(this.w * this.h);
        for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) mask[y * this.w + x] = this.alpha(x, y) > 0 ? 1 : 0;
        for (let y = 0; y < this.h; y++)
            for (let x = 0; x < this.w; x++) {
                if (mask[y * this.w + x]) continue;
                const near =
                    (x > 0 && mask[y * this.w + x - 1]) ||
                    (x < this.w - 1 && mask[y * this.w + x + 1]) ||
                    (y > 0 && mask[(y - 1) * this.w + x]) ||
                    (y < this.h - 1 && mask[(y + 1) * this.w + x]);
                if (near) this.set(x, y, rgb, a);
            }
    }
    toCanvas(): Canvas2D {
        const c = makeCanvas(this.w, this.h);
        const ctx = context(c);
        const image = ctx.createImageData(this.w, this.h);
        image.data.set(this.data);
        ctx.putImageData(image, 0, 0);
        return c;
    }
}

/** 4×4 Bayer threshold in [0, 1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number): number => BAYER[(y & 3) * 4 + (x & 3)]! / 16;

/** Picks a ramp entry for value v in [0, 1] with ordered dithering between neighbours. */
export function rampPick(ramp: readonly number[], v: number, x: number, y: number): number {
    const f = Math.max(0, Math.min(0.9999, v)) * (ramp.length - 1);
    const i = Math.floor(f);
    return f - i > bayer(x, y) ? ramp[Math.min(ramp.length - 1, i + 1)]! : ramp[i]!;
}

/** Deterministic value noise with smooth interpolation; wraps on `period` when given. */
export function makeNoise(seed: number) {
    const hash = (x: number, y: number): number => {
        let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const value = (x: number, y: number, px: number, py: number): number => {
        const x0 = Math.floor(x),
            y0 = Math.floor(y);
        const fx = smooth(x - x0),
            fy = smooth(y - y0);
        const wrap = (v: number, p: number) => (p > 0 ? ((v % p) + p) % p : v);
        const a = hash(wrap(x0, px), wrap(y0, py)),
            b = hash(wrap(x0 + 1, px), wrap(y0, py));
        const c = hash(wrap(x0, px), wrap(y0 + 1, py)),
            d = hash(wrap(x0 + 1, px), wrap(y0 + 1, py));
        return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
    };
    /** Fractal noise; frequencies are cells per texture so wrapping stays seamless. */
    return (x: number, y: number, cellsX: number, cellsY: number, octaves = 4, w = 1, h = 1): number => {
        let sum = 0,
            amp = 0.5,
            norm = 0;
        let fx = cellsX,
            fy = cellsY;
        for (let o = 0; o < octaves; o++) {
            sum += value((x / w) * fx, (y / h) * fy, Math.round(fx), Math.round(fy)) * amp;
            norm += amp;
            amp *= 0.5;
            fx *= 2;
            fy *= 2;
        }
        return sum / norm;
    };
}

export const mix = (a: number, b: number, t: number): number => {
    const k = Math.max(0, Math.min(1, t));
    const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * k);
    const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * k);
    const bl = (a & 255) + (((b & 255) - (a & 255)) * k);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
