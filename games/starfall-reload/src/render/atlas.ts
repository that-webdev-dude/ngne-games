import type { ImageAsset } from "@ngne/core";
import { CELL_H, CELL_W, renderFont } from "./font.ts";
import { Pixels, context, makeCanvas, type Canvas2D } from "./pixels.ts";
import { generateTextures } from "./textures.ts";

/** Authored sprite sheets (horizontal strips) — sizes are the art specification's contract. */
export const SHEETS: Record<string, { w: number; h: number; frames: number }> = {
    player: { w: 24, h: 28, frames: 5 },
    "player-flame": { w: 8, h: 12, frames: 2 },
    halo: { w: 10, h: 10, frames: 2 },
    capsule: { w: 16, h: 16, frames: 4 },
    chip: { w: 8, h: 8, frames: 2 },
    "bomb-pickup": { w: 12, h: 12, frames: 2 },
    oneup: { w: 16, h: 12, frames: 1 },
    "icon-life": { w: 9, h: 10, frames: 1 },
    "icon-bomb": { w: 9, h: 10, frames: 1 },
    dart: { w: 16, h: 16, frames: 2 },
    hornet: { w: 20, h: 20, frames: 2 },
    skiff: { w: 28, h: 20, frames: 2 },
    "turret-base": { w: 22, h: 22, frames: 1 },
    "turret-barrel": { w: 8, h: 16, frames: 1 },
    crawler: { w: 24, h: 28, frames: 2 },
    pylon: { w: 16, h: 16, frames: 2 },
    "rock-large": { w: 32, h: 32, frames: 2 },
    "rock-small": { w: 16, h: 16, frames: 2 },
    sentry: { w: 16, h: 16, frames: 2 },
    lancer: { w: 56, h: 48, frames: 1 },
    bastion: { w: 64, h: 48, frames: 1 },
    lantern: { w: 56, h: 56, frames: 1 },
    halberd: { w: 176, h: 72, frames: 1 },
    "halberd-pod": { w: 32, h: 32, frames: 2 },
    cantor: { w: 160, h: 120, frames: 1 },
    "cantor-turret": { w: 28, h: 28, frames: 2 },
    seraph: { w: 192, h: 128, frames: 1 },
    "seraph-core": { w: 40, h: 40, frames: 2 },
    "seraph-wing": { w: 48, h: 64, frames: 1 },
};


export interface Region {
    u: number;
    v: number;
    uw: number;
    vh: number;
    w: number;
    h: number;
}

/** Packed regions by name; `flash` holds white silhouettes of authored sprites for hit flashes. */
export class Atlas {
    readonly id = "atlas";
    readonly regions = new Map<string, Region[]>();
    readonly flash = new Map<string, Region[]>();
    readonly missing: string[] = [];
    width = 0;
    height = 0;
    private readonly fallback: Region = { u: 0, v: 0, uw: 0, vh: 0, w: 1, h: 1 };

    get(name: string, frame = 0): Region {
        const list = this.regions.get(name);
        if (!list || list.length === 0) return this.fallback;
        return list[((frame % list.length) + list.length) % list.length]!;
    }
    flashOf(name: string, frame = 0): Region {
        const list = this.flash.get(name);
        if (!list || list.length === 0) return this.get(name, frame);
        return list[((frame % list.length) + list.length) % list.length]!;
    }
    frames(name: string): number {
        return this.regions.get(name)?.length ?? 0;
    }

    /** NGNE image asset that builds and uploads this atlas during scene preparation. */
    asset(): ImageAsset {
        return {
            id: this.id,
            kind: "image",
            load: async (signal) => {
                const canvas = await this.build(signal);
                return createImageBitmap(canvas, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
            },
            dispose: (bitmap) => bitmap.close(),
        };
    }

    private async build(signal: AbortSignal): Promise<Canvas2D> {
        type Item = { name: string; frame: number; source: Canvas2D | ImageBitmap; sx: number; sy: number; w: number; h: number; flash: boolean };
        const items: Item[] = [];
        for (const [name, sheet] of Object.entries(SHEETS)) {
            const bitmap = await loadSheet(name, signal);
            if (!bitmap || bitmap.width < sheet.w * sheet.frames || bitmap.height < sheet.h) {
                this.missing.push(name);
                const placeholder = placeholderSheet(sheet.w, sheet.h, sheet.frames).toCanvas();
                for (let f = 0; f < sheet.frames; f++) items.push({ name, frame: f, source: placeholder, sx: f * sheet.w, sy: 0, w: sheet.w, h: sheet.h, flash: true });
                continue;
            }
            for (let f = 0; f < sheet.frames; f++) items.push({ name, frame: f, source: bitmap, sx: f * sheet.w, sy: 0, w: sheet.w, h: sheet.h, flash: true });
        }
        for (const g of generateTextures())
            g.frames.forEach((p, f) => items.push({ name: g.name, frame: f, source: p.toCanvas(), sx: 0, sy: 0, w: p.w, h: p.h, flash: false }));
        const font = renderFont().toCanvas();
        const glyphs = Math.floor(font.width / CELL_W);
        for (let i = 0; i < glyphs; i++) items.push({ name: "font", frame: i, source: font, sx: i * CELL_W, sy: 0, w: CELL_W, h: CELL_H, flash: false });

        // Shelf-pack (tallest first) with 2 px gutters; authored sprites also get a flash copy.
        const pad = 2;
        const boxes = items.flatMap((it) => (it.flash ? [{ it, white: false }, { it, white: true }] : [{ it, white: false }]));
        boxes.sort((a, b) => b.it.h - a.it.h || b.it.w - a.it.w);
        const size = 1024;
        let x = pad,
            y = pad,
            shelf = 0;
        const placed: { box: (typeof boxes)[number]; x: number; y: number }[] = [];
        for (const box of boxes) {
            if (x + box.it.w + pad > size) {
                x = pad;
                y += shelf + pad;
                shelf = 0;
            }
            placed.push({ box, x, y });
            x += box.it.w + pad;
            shelf = Math.max(shelf, box.it.h);
        }
        const height = Math.max(64, nextPow2(y + shelf + pad));
        if (height > 4096) throw new Error("Sprite atlas overflow");
        const canvas = makeCanvas(size, height);
        const ctx = context(canvas);
        const tmp = makeCanvas(256, 256);
        const tctx = context(tmp);
        this.width = size;
        this.height = height;
        for (const { box, x: px, y: py } of placed) {
            const { it, white } = box;
            if (white) {
                tctx.clearRect(0, 0, it.w, it.h);
                tctx.globalCompositeOperation = "source-over";
                tctx.drawImage(it.source as CanvasImageSource, it.sx, it.sy, it.w, it.h, 0, 0, it.w, it.h);
                tctx.globalCompositeOperation = "source-in";
                tctx.fillStyle = "#ffffff";
                tctx.fillRect(0, 0, it.w, it.h);
                tctx.globalCompositeOperation = "source-over";
                ctx.drawImage(tmp as CanvasImageSource, 0, 0, it.w, it.h, px, py, it.w, it.h);
            } else ctx.drawImage(it.source as CanvasImageSource, it.sx, it.sy, it.w, it.h, px, py, it.w, it.h);
            const region: Region = { u: px / size, v: py / height, uw: it.w / size, vh: it.h / height, w: it.w, h: it.h };
            const map = white ? this.flash : this.regions;
            const list = map.get(it.name) ?? [];
            list[it.frame] = region;
            map.set(it.name, list);
        }
        if (this.missing.length) console.warn(`Starfall Reload: placeholder art for ${this.missing.join(", ")}`);
        return canvas;
    }
}

const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(n));

async function loadSheet(name: string, signal: AbortSignal): Promise<ImageBitmap | null> {
    // Resolved lazily so headless (Node) imports of the render modules never touch Vite APIs.
    const urls = import.meta.glob("../assets/sprites/*.png", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
    const url = urls[`../assets/sprites/${name}.png`];
    if (!url) return null;
    try {
        const response = await fetch(url, { signal });
        if (!response.ok) return null;
        return await createImageBitmap(await response.blob(), { premultiplyAlpha: "none", colorSpaceConversion: "none" });
    } catch (error) {
        if (signal.aborted) throw error;
        return null;
    }
}

function placeholderSheet(w: number, h: number, frames: number): Pixels {
    const p = new Pixels(w * frames, h);
    for (let f = 0; f < frames; f++) {
        p.rect(f * w + 1, 1, w - 2, h - 2, 0x6f37a0);
        p.rect(f * w + 3, 3, w - 6, h - 6, 0xa964d2);
    }
    p.outline(0x0b0d1a);
    return p;
}
