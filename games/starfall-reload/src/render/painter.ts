import type { Frame } from "@ngne/core";
import type { Atlas, Region } from "./atlas.ts";
import { ADVANCE, CELL_H, CELL_W, glyphIndex, textWidth } from "./font.ts";

export interface SpriteOptions {
    layer?: number;
    rotation?: number;
    alpha?: number;
    color?: number;
    flash?: boolean;
    screen?: boolean;
    sx?: number;
    sy?: number;
}

export interface TextOptions {
    color?: number;
    scale?: number;
    align?: "left" | "center" | "right";
    layer?: number;
    screen?: boolean;
    alpha?: number;
}

/** Thin drawing facade over one NGNE frame and the packed atlas. Centre-anchored, like NGNE. */
export class Painter {
    frame!: Frame;
    readonly atlas: Atlas;
    constructor(atlas: Atlas) {
        this.atlas = atlas;
    }

    region(r: Region, x: number, y: number, o: SpriteOptions = {}): void {
        this.frame.sprite({
            x,
            y,
            width: r.w * (o.sx ?? 1),
            height: r.h * (o.sy ?? 1),
            texture: this.atlas.id,
            u: r.u,
            v: r.v,
            uw: r.uw,
            vh: r.vh,
            rotation: o.rotation ?? 0,
            alpha: o.alpha ?? 1,
            color: o.color ?? 0xffffff,
            layer: o.layer ?? 0,
            screen: o.screen ?? false,
        });
    }

    spr(name: string, frame: number, x: number, y: number, o: SpriteOptions = {}): void {
        this.region(o.flash ? this.atlas.flashOf(name, frame) : this.atlas.get(name, frame), x, y, o);
    }

    /** Solid rectangle from its top-left corner (batched through the atlas). */
    rect(x: number, y: number, w: number, h: number, color: number, alpha = 1, layer = 0, screen = false): void {
        if (w <= 0 || h <= 0) return;
        const r = this.atlas.get("px");
        this.frame.sprite({ x: x + w / 2, y: y + h / 2, width: w, height: h, texture: this.atlas.id, u: r.u + r.uw * 0.25, v: r.v + r.vh * 0.25, uw: r.uw * 0.5, vh: r.vh * 0.5, color, alpha, layer, screen });
    }

    /** Line segment of thickness `t` (rotated quad). */
    line(x0: number, y0: number, x1: number, y1: number, t: number, color: number, alpha = 1, layer = 0, screen = false): void {
        const dx = x1 - x0,
            dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 0.01) return;
        const r = this.atlas.get("px");
        this.frame.sprite({
            x: (x0 + x1) / 2,
            y: (y0 + y1) / 2,
            width: len,
            height: t,
            rotation: Math.atan2(dy, dx),
            texture: this.atlas.id,
            u: r.u + r.uw * 0.25,
            v: r.v + r.vh * 0.25,
            uw: r.uw * 0.5,
            vh: r.vh * 0.5,
            color,
            alpha,
            layer,
            screen,
        });
    }

    /** Outlined bitmap text; (x, y) is the top of the line. */
    text(text: string, x: number, y: number, o: TextOptions = {}): number {
        const scale = o.scale ?? 1;
        const width = textWidth(text, scale);
        let cx = o.align === "center" ? x - width / 2 : o.align === "right" ? x - width : x;
        cx = Math.round(cx);
        for (const ch of text) {
            if (ch !== " ") {
                const r = this.atlas.get("font", glyphIndex(ch));
                this.frame.sprite({
                    x: cx + ((CELL_W - 2) * scale) / 2,
                    y: Math.round(y) + ((CELL_H - 2) * scale) / 2,
                    width: CELL_W * scale,
                    height: CELL_H * scale,
                    texture: this.atlas.id,
                    u: r.u,
                    v: r.v,
                    uw: r.uw,
                    vh: r.vh,
                    color: o.color ?? 0xffffff,
                    alpha: o.alpha ?? 1,
                    layer: o.layer ?? 0,
                    screen: o.screen ?? false,
                });
            }
            cx += ADVANCE * scale;
        }
        return width;
    }
}
