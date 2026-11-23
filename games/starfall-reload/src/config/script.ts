import type { EnemyInit } from "../ecs/spawn.ts";
import { DROP, FENCE, K, M } from "./enemies.ts";
import { FIELD_H, FIELD_W } from "./view.ts";

/** The edge a craft enters from. */
export type Entry = "top" | "left" | "right" | "rear";

/** Formation helper that produced a wave (one public helper call). */
export type Form =
    | "weave"
    | "loop"
    | "loopPair"
    | "dive"
    | "station"
    | "hornetLine"
    | "ground"
    | "line"
    | "debris"
    | "barrier"
    | "vee"
    | "sideSweep"
    | "echelon"
    | "crossfire"
    | "rearEntry"
    | "orbitRing";

/** Named placeholders for enemies and hazards that later tickets replace. */
export type Slot = "gunship" | "mortar" | "interceptor" | "mines" | "fence";

/** Authoring tags. The director ignores them; content tests read them. */
export interface WaveTag {
    /** One id per helper call, in authoring order. */
    readonly wave: number;
    readonly form: Form;
    readonly entry: Entry;
    readonly slot?: Slot;
}

/** Seconds a rear-entry glow shows before its craft appears. */
export const REAR_WARNING = 0.5;

/**
 * Encounter script vocabulary. An area script is a flat, time-sorted list of events built at
 * module load from small formation helpers. The director (sim/director.ts) executes them.
 */
export type ScriptEvent =
    | { at: number; type: "enemy"; init: EnemyInit; tag: WaveTag }
    | { at: number; type: "barrier"; y: number; gapX: number; gapW: number; fence?: FenceCycle; tag: WaveTag }
    | { at: number; type: "telegraph"; x: number; tag: WaveTag }
    | { at: number; type: "midboss"; id: "lancer" | "bastion" | "lantern" }
    | { at: number; type: "boss"; id: "halberd" | "cantor" | "seraph" }
    | { at: number; type: "banner"; text: string; sub: string };

/** A fence's on/off phase lengths (s). A barrier event that carries one is a laser fence. */
export interface FenceCycle {
    readonly on: number;
    readonly off: number;
}

type Point = readonly [x: number, y: number];

/** Stations of the four-hornet line. */
const HORNET_LINE: readonly Point[] = [
    [40, 70],
    [110, 100],
    [178, 100],
    [248, 70],
];

/** Interceptor flight: level speed (px/s) and turn rate (rad/s); the turn radius is speed / turn. */
const INTERCEPT = { speed: 200, turn: 6, inset: 70 } as const;

export class Script {
    readonly events: ScriptEvent[] = [];
    private waves = 0;
    private current: { form: Form; slot?: Slot; wave: number } | null = null;

    /** Runs `body` as one wave. Nested helper calls join the outer wave. */
    private wave(form: Form, slot: Slot | undefined, body: () => void): this {
        if (this.current) {
            body();
            return this;
        }
        this.current = { form, slot, wave: ++this.waves };
        try {
            body();
        } finally {
            this.current = null;
        }
        return this;
    }

    private tag(entry: Entry): WaveTag {
        const c = this.current!;
        return c.slot ? { wave: c.wave, form: c.form, entry, slot: c.slot } : { wave: c.wave, form: c.form, entry };
    }

    private enemy(at: number, init: EnemyInit, entry: Entry = "top"): void {
        this.events.push({ at, type: "enemy", init, tag: this.tag(entry) });
    }

    /** A column of darts weaving down from x. */
    weave(at: number, x: number, count: number, opts: { gap?: number; amp?: number; freq?: number; vy?: number; kind?: number } = {}): this {
        return this.wave("weave", undefined, () => {
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
        });
    }

    /** Darts sweeping in a loop from one side. side +1 = from the left half. */
    loop(at: number, side: 1 | -1, count: number, opts: { x?: number; radius?: number; speed?: number; gap?: number } = {}): this {
        return this.wave("loop", undefined, () => {
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
        });
    }

    /** Mirrored loops from both halves, the right one 0.3 s behind. */
    loopPair(at: number, count: number, opts: { radius?: number; speed?: number; gap?: number } = {}): this {
        return this.wave("loopPair", undefined, () => this.loop(at, 1, count, opts).loop(at + 0.3, -1, count, opts));
    }

    /** Hornets that drop in, pause, then dive at the player. */
    dive(at: number, xs: readonly number[], opts: { y?: number; hold?: number; gap?: number; kind?: number; drop?: number } = {}): this {
        return this.wave("dive", undefined, () =>
            xs.forEach((x, i) =>
                this.enemy(at + i * (opts.gap ?? 0.3), {
                    kind: opts.kind ?? K.hornet,
                    x,
                    y: -16,
                    mover: M.dive,
                    m1: opts.y ?? 70,
                    m2: opts.hold ?? 0.9,
                    m3: 160,
                    drop: opts.drop,
                }),
            ),
        );
    }

    /** Craft that move to a station, fight, then leave. */
    station(at: number, kind: number, x: number, y: number, hold: number, opts: { drop?: number; leave?: number; fromX?: number } = {}): this {
        return this.wave("station", undefined, () =>
            this.enemy(at, { kind, x: opts.fromX ?? x, y: -24, mover: M.hover, m0: x, m1: y, m2: hold, m3: opts.leave ?? 70, drop: opts.drop }),
        );
    }

    /** Several stations taken at once, `stagger` s apart; one wave. */
    stations(at: number, kind: number, points: readonly Point[], hold: number, opts: { stagger?: number; leave?: number; drop?: number } = {}): this {
        return this.wave("station", undefined, () =>
            points.forEach(([x, y], i) => this.station(at + i * (opts.stagger ?? 0.2), kind, x, y, hold, { leave: opts.leave, drop: opts.drop })),
        );
    }

    /** The four-hornet line: stations at x 40/110/178/248, y 70/100/100/70. */
    hornetLine(at: number, kind: number = K.hornet, hold = 5, opts: { drop?: number } = {}): this {
        return this.wave("hornetLine", undefined, () => this.stations(at, kind, HORNET_LINE, hold, opts));
    }

    /** Ground targets scrolling with the terrain. */
    ground(at: number, kind: number, xs: readonly number[], opts: { vx?: number; drop?: number } = {}): this {
        return this.wave("ground", undefined, () => {
            for (const x of xs) this.enemy(at, { kind, x, y: -16, mover: M.ground, m0: opts.vx ?? 0, drop: opts.drop });
        });
    }

    /** Straight-line flyers. */
    line(at: number, kind: number, x: number, vx: number, vy: number, count = 1, gap = 0.3): this {
        return this.wave("line", undefined, () => {
            for (let i = 0; i < count; i++) this.enemy(at + i * gap, { kind, x, y: -16, mover: M.straight, m0: vx, m1: vy });
        });
    }

    /** Drifting debris field. `seed` keeps layouts deterministic without RNG. */
    debris(at: number, count: number, seed: number, opts: { duration?: number; small?: number } = {}): this {
        return this.wave("debris", undefined, () => {
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
        });
    }

    /** An energy barrier with a gap. Pylons stand at the edges and at both gap sides. */
    barrier(at: number, gapX: number, gapW = 64): this {
        return this.wave("barrier", undefined, () => this.wall(at, gapX, gapW));
    }

    private wall(at: number, gapX: number, gapW: number, fence?: FenceCycle): void {
        this.events.push({ at, type: "barrier", y: -16, gapX, gapW, ...(fence ? { fence } : {}), tag: this.tag("top") });
    }

    /** V formation: a lead at x with ranks trailing up and out on both sides, flying straight down. */
    vee(at: number, x: number, count: number, opts: { kind?: number; spread?: number; depth?: number; vy?: number; drop?: number } = {}): this {
        return this.wave("vee", undefined, () => {
            for (let i = 0; i < count; i++) {
                const rank = Math.ceil(i / 2);
                const side = i % 2 === 1 ? -1 : 1;
                this.enemy(at, {
                    kind: opts.kind ?? K.dart,
                    x: x + side * rank * (opts.spread ?? 22),
                    y: -16 - rank * (opts.depth ?? 16),
                    mover: M.straight,
                    m0: 0,
                    m1: opts.vy ?? 90,
                    drop: opts.drop,
                });
            }
        });
    }

    /**
     * Side sweep: a file of craft entering from the left (side +1) or right edge at height y,
     * curving down and back out through the same edge.
     */
    sideSweep(at: number, side: 1 | -1, count: number, opts: { y?: number; radius?: number; speed?: number; gap?: number; kind?: number } = {}): this {
        return this.wave("sideSweep", undefined, () => {
            const y = opts.y ?? 40;
            const r = opts.radius ?? 110;
            const ox = side > 0 ? -16 : FIELD_W + 16;
            for (let i = 0; i < count; i++)
                this.enemy(
                    at + i * (opts.gap ?? 0.25),
                    { kind: opts.kind ?? K.dart, x: ox, y, mover: M.orbit, m0: 0, m1: r, m2: side * (opts.speed ?? 1.4), m3: 0, ox, oy: y + r },
                    side > 0 ? "left" : "right",
                );
        });
    }

    /**
     * Echelon: a diagonal line of craft sliding in from one side (+1 = left) to stations that step
     * down and inward, holding, then leaving down.
     */
    echelon(
        at: number,
        side: 1 | -1,
        kind: number,
        count: number,
        opts: { x0?: number; y0?: number; dx?: number; dy?: number; hold?: number; gap?: number; drop?: number } = {},
    ): this {
        return this.wave("echelon", undefined, () => {
            const gap = opts.gap ?? 0.25;
            for (let i = 0; i < count; i++) {
                const reach = (opts.x0 ?? 40) + i * (opts.dx ?? 34);
                const y = (opts.y0 ?? 50) + i * (opts.dy ?? 18);
                this.enemy(
                    at + i * gap,
                    {
                        kind,
                        x: side > 0 ? -20 : FIELD_W + 20,
                        y,
                        mover: M.hover,
                        m0: side > 0 ? reach : FIELD_W - reach,
                        m1: y,
                        m2: (opts.hold ?? 5) - i * gap,
                        m3: 70,
                        drop: opts.drop,
                    },
                    side > 0 ? "left" : "right",
                );
            }
        });
    }

    /**
     * Crossfire pair: two craft enter from opposite edges, hold near them and fire across, then
     * leave up. `drop` overrides the left craft's drop, `drop2` the right one's.
     */
    crossfire(at: number, kind: number, y: number, opts: { y2?: number; inset?: number; hold?: number; drop?: number; drop2?: number } = {}): this {
        return this.wave("crossfire", undefined, () => {
            const inset = opts.inset ?? 36;
            const hold = opts.hold ?? 5;
            this.enemy(at, { kind, x: -24, y, mover: M.hover, m0: inset, m1: y, m2: hold, m3: -60, drop: opts.drop }, "left");
            const y2 = opts.y2 ?? y;
            this.enemy(at, { kind, x: FIELD_W + 24, y: y2, mover: M.hover, m0: FIELD_W - inset, m1: y2, m2: hold, m3: -60, drop: opts.drop2 }, "right");
        });
    }

    /**
     * Rear entry: non-firing darts rising from below the field past the ship. Each is preceded by
     * a REAR_WARNING glow at the bottom edge where it will appear.
     */
    rearEntry(at: number, xs: readonly number[], opts: { gap?: number; vy?: number } = {}): this {
        return this.wave("rearEntry", undefined, () =>
            xs.forEach((x, i) => {
                const t = at + i * (opts.gap ?? 0.35);
                this.events.push({ at: t, type: "telegraph", x, tag: this.tag("rear") });
                this.enemy(t + REAR_WARNING, { kind: K.dart, x, y: FIELD_H + 16, mover: M.straight, m0: 0, m1: -(opts.vy ?? 120) }, "rear");
            }),
        );
    }

    /** Orbit ring: craft circling a centre that sinks into the field from above and drifts through it. */
    orbitRing(at: number, x: number, count: number, opts: { kind?: number; radius?: number; spin?: number; sink?: number; y0?: number } = {}): this {
        return this.wave("orbitRing", undefined, () => {
            const r = opts.radius ?? 42;
            const y0 = opts.y0 ?? -50;
            for (let i = 0; i < count; i++) {
                const phase = (i / count) * Math.PI * 2;
                this.enemy(at, {
                    kind: opts.kind ?? K.sentry,
                    x: x + r * Math.sin(phase),
                    y: y0 - r * Math.cos(phase),
                    mover: M.orbit,
                    m0: phase,
                    m1: r,
                    m2: opts.spin ?? 1.1,
                    m3: opts.sink ?? 20,
                    ox: x,
                    oy: y0,
                });
            }
        });
    }

    // Named slots: each holds its own enemy or hazard.

    /** Gunship slot (Area 1): a carrier takes station, launches dart pairs while it holds, then pulls back up. */
    gunship(at: number, x: number, y: number, hold: number, opts: { drop?: number } = {}): this {
        return this.wave("station", "gunship", () => this.station(at, K.gunship, x, y, hold, { drop: opts.drop, leave: -50 }));
    }

    /** Mortar slot (Area 2): a ground mortar scrolling with the terrain. */
    mortar(at: number, x: number, opts: { drop?: number } = {}): this {
        return this.wave("ground", "mortar", () => this.ground(at, K.mortar, [x], opts));
    }

    /**
     * Interceptor slot (Area 3): craft entering one after another from the left (side +1) or right
     * edge at height y. Each turns down into the next lane further from its edge, fires once at the
     * turn and dives out through the bottom.
     */
    interceptor(at: number, side: 1 | -1, count: number, opts: { y?: number; gap?: number } = {}): this {
        return this.wave("sideSweep", "interceptor", () => {
            const { speed, turn, inset } = INTERCEPT;
            const span = FIELD_W - inset * 2;
            for (let i = 0; i < count; i++) {
                const fromEdge = inset + (count > 1 ? (i * span) / (count - 1) : span / 2);
                const lane = side > 0 ? fromEdge : FIELD_W - fromEdge;
                this.enemy(
                    at + i * (opts.gap ?? 0.35),
                    { kind: K.interceptor, x: side > 0 ? -16 : FIELD_W + 16, y: opts.y ?? 50, mover: M.intercept, m0: side, m1: lane - (side * speed) / turn, m2: speed, m3: turn },
                    side > 0 ? "left" : "right",
                );
            }
        });
    }

    /**
     * Mine-field slot (Area 3): `count` mines entering over `duration` s, drifting down with the scroll
     * and a little sideways. Laid out like debris; `seed` keeps the layout deterministic.
     */
    mines(at: number, count: number, seed: number, opts: { duration?: number } = {}): this {
        return this.wave("debris", "mines", () => {
            const duration = opts.duration ?? 6;
            for (let i = 0; i < count; i++) {
                const h = hash(seed * 131 + i * 17);
                this.enemy(at + (i / count) * duration, { kind: K.mine, x: 20 + (h % (FIELD_W - 40)), y: -12, mover: M.ground, m0: ((h >>> 3) % 21) - 10 });
            }
        });
    }

    /** Fence slot (Area 3): a laser fence, an Area 2 barrier layout whose walls cycle off and on (FENCE). */
    fence(at: number, gapX: number, gapW = 64): this {
        return this.wave("barrier", "fence", () => this.wall(at, gapX, gapW, { on: FENCE.on, off: FENCE.off }));
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
