import type { EnemyInit } from "../ecs/spawn.ts";
import { DROP, K, M } from "./enemies.ts";
import { FIELD_W } from "./view.ts";

/**
 * Encounter script vocabulary. An area script is a flat, time-sorted list of events built at
 * module load from small formation helpers. The director (sim/director.ts) executes them.
 */
export type ScriptEvent =
    | { at: number; type: "enemy"; init: EnemyInit }
    | { at: number; type: "barrier"; y: number; gapX: number; gapW: number }
    | { at: number; type: "midboss"; id: "lancer" | "bastion" | "lantern" }
    | { at: number; type: "boss"; id: "halberd" | "cantor" | "seraph" }
    | { at: number; type: "banner"; text: string; sub: string };

export class Script {
    readonly events: ScriptEvent[] = [];

    enemy(at: number, init: EnemyInit): this {
        this.events.push({ at, type: "enemy", init });
        return this;
    }

    /** A column of darts weaving down from x. */
    weave(at: number, x: number, count: number, opts: { gap?: number; amp?: number; freq?: number; vy?: number; kind?: number } = {}): this {
        for (let i = 0; i < count; i++)
            this.enemy(at + i * (opts.gap ?? 0.22), {
                kind: opts.kind ?? K.dart,
                x,
                y: -14,
                mover: M.sine,
                m0: x,
                m1: opts.amp ?? 40,
                m2: opts.freq ?? 2.4,
                m3: opts.vy ?? 95,
            });
        return this;
    }

    /** Darts sweeping in a loop from one side. side +1 = from the left half. */
    loop(at: number, side: 1 | -1, count: number, opts: { x?: number; radius?: number; speed?: number; gap?: number } = {}): this {
        const x = opts.x ?? (side > 0 ? 50 : FIELD_W - 50);
        for (let i = 0; i < count; i++)
            this.enemy(at + i * (opts.gap ?? 0.18), {
                kind: K.dart,
                x,
                y: -16,
                mover: M.arc,
                m0: side,
                m1: opts.radius ?? 70,
                m2: opts.speed ?? 2.1,
                m3: 22,
                ox: x,
            });
        return this;
    }

    /** Hornets that drop in, pause, then dive at the player. */
    dive(at: number, xs: readonly number[], opts: { y?: number; hold?: number; gap?: number; kind?: number } = {}): this {
        xs.forEach((x, i) =>
            this.enemy(at + i * (opts.gap ?? 0.3), { kind: opts.kind ?? K.hornet, x, y: -16, mover: M.dive, m1: opts.y ?? 70, m2: opts.hold ?? 0.9, m3: 160 }),
        );
        return this;
    }

    /** Craft that move to a station, fight, then leave. */
    station(at: number, kind: number, x: number, y: number, hold: number, opts: { drop?: number; leave?: number; fromX?: number } = {}): this {
        return this.enemy(at, { kind, x: opts.fromX ?? x, y: -24, mover: M.hover, m0: x, m1: y, m2: hold, m3: opts.leave ?? 70, drop: opts.drop });
    }

    /** Ground targets scrolling with the terrain. */
    ground(at: number, kind: number, xs: readonly number[], opts: { vx?: number; drop?: number } = {}): this {
        for (const x of xs) this.enemy(at, { kind, x, y: -16, mover: M.ground, m0: opts.vx ?? 0, drop: opts.drop });
        return this;
    }

    /** Straight-line flyers. */
    line(at: number, kind: number, x: number, vx: number, vy: number, count = 1, gap = 0.3): this {
        for (let i = 0; i < count; i++) this.enemy(at + i * gap, { kind, x, y: -16, mover: M.straight, m0: vx, m1: vy });
        return this;
    }

    /** Drifting debris field. `seed` keeps layouts deterministic without RNG. */
    debris(at: number, count: number, seed: number, opts: { duration?: number; small?: number } = {}): this {
        const duration = opts.duration ?? 6;
        for (let i = 0; i < count; i++) {
            const h = hash(seed * 131 + i * 17);
            const large = h % 3 !== 0 && (opts.small ?? 0) <= (h % 10) / 10;
            this.enemy(at + (i / count) * duration, {
                kind: large ? K.rockL : K.rockS,
                x: 20 + (h % (FIELD_W - 40)),
                y: -24,
                mover: M.drift,
                m0: ((h >>> 3) % 40) - 20,
                m1: 45 + ((h >>> 5) % 45),
                m2: (((h >>> 7) % 20) - 10) / 6,
                frame: (h >>> 2) % 2,
                drop: large && h % 5 === 0 ? DROP.chip : DROP.none,
            });
        }
        return this;
    }

    /** An energy barrier with a gap. Pylons stand at the edges and at both gap sides. */
    barrier(at: number, gapX: number, gapW = 64): this {
        this.events.push({ at, type: "barrier", y: -16, gapX, gapW });
        return this;
    }

    midboss(at: number, id: "lancer" | "bastion" | "lantern"): this {
        this.events.push({ at, type: "midboss", id });
        return this;
    }

    boss(at: number, id: "halberd" | "cantor" | "seraph"): this {
        this.events.push({ at, type: "boss", id });
        return this;
    }

    banner(at: number, text: string, sub: string): this {
        this.events.push({ at, type: "banner", text, sub });
        return this;
    }

    build(): readonly ScriptEvent[] {
        return [...this.events].sort((a, b) => a.at - b.at);
    }
}

function hash(n: number): number {
    let x = (n | 0) ^ 0x9e3779b9;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return (x ^ (x >>> 16)) >>> 0;
}
