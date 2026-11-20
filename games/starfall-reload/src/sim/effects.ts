import { spawnFx } from "../ecs/spawn.ts";
import { FEEL } from "../config/tuning.ts";
import { L } from "../config/view.ts";
import { cue, flash, hitstop, shake, type Sim } from "./context.ts";

/** Fx.kind values. Rendering lives in render/world.ts. */
export const FX = {
    spark: 0,
    explosion: 1,
    smoke: 2,
    ring: 3,
    glow: 4,
    debris: 5,
    muzzle: 6,
    twinkle: 7,
    streak: 8,
} as const;

const HOT = [0xffffff, 0xfff0b8, 0xffb347, 0xec7424];

export function sparks(sim: Sim, x: number, y: number, count: number, speed: number, colors: readonly number[] = HOT, dir = Math.PI, spread = Math.PI): void {
    const r = sim.fxRng;
    for (let i = 0; i < count; i++) {
        const a = dir + (r.next() * 2 - 1) * spread;
        const v = speed * (0.35 + r.next() * 0.9);
        spawnFx(sim.world, {
            kind: FX.spark,
            x,
            y,
            vx: Math.sin(a) * v,
            vy: Math.cos(a) * v,
            drag: 4,
            life: 0.18 + r.next() * 0.25,
            size: 1 + Math.floor(r.next() * 2),
            size2: 3 + r.next() * 5,
            color: colors[Math.floor(r.next() * colors.length)]!,
            layer: L.fx,
        });
    }
}

/** Small impact on an enemy that survives the hit. */
export function impact(sim: Sim, x: number, y: number, color = 0xfff0b8): void {
    spawnFx(sim.world, { kind: FX.glow, x, y, life: 0.08, size: 9, size2: 4, color, layer: L.fx });
    if (sim.fxRng.next() < 0.4) sparks(sim, x, y, 2, 140, HOT, Math.PI, 0.9);
}

export function explosion(sim: Sim, x: number, y: number, size: "s" | "m" | "l" | "boss", hull = 0x7e9a78): void {
    const r = sim.fxRng;
    const scale = size === "s" ? 1 : size === "m" ? 1.6 : size === "l" ? 2.4 : 3.2;
    spawnFx(sim.world, { kind: FX.glow, x, y, life: 0.12, size: 30 * scale, size2: 10 * scale, color: 0xffffff, layer: L.fx });
    spawnFx(sim.world, { kind: FX.explosion, x, y, life: 0.5 + 0.08 * scale, size: 30 * scale, layer: L.fx, rot: r.next() * 6.28 });
    spawnFx(sim.world, { kind: FX.ring, x, y, life: 0.3 + 0.05 * scale, size: 6 * scale, size2: 34 * scale, color: 0xfff0b8, layer: L.fx });
    sparks(sim, x, y, Math.round(6 * scale), 120 + 60 * scale);
    const debris = size === "s" ? 2 : Math.round(3 * scale);
    for (let i = 0; i < debris; i++) {
        const a = r.next() * Math.PI * 2;
        const v = 40 + r.next() * 90 * scale;
        spawnFx(sim.world, {
            kind: FX.debris,
            x,
            y,
            vx: Math.sin(a) * v,
            vy: Math.cos(a) * v + 30,
            drag: 1.2,
            life: 0.6 + r.next() * 0.5,
            size: 2 + Math.floor(r.next() * 2 * scale),
            color: hull,
            spin: (r.next() - 0.5) * 18,
            layer: L.fx,
        });
    }
    if (size !== "s") {
        for (let i = 0; i < Math.round(2 * scale); i++) {
            const ox = (r.next() - 0.5) * 18 * scale;
            const oy = (r.next() - 0.5) * 18 * scale;
            spawnFx(sim.world, {
                kind: FX.explosion,
                x: x + ox,
                y: y + oy,
                life: 0.45 + r.next() * 0.3,
                size: (16 + r.next() * 14) * scale * 0.6,
                layer: L.fx,
                rot: r.next() * 6.28,
                vy: 20,
            });
        }
        spawnFx(sim.world, { kind: FX.smoke, x, y, vy: 25, life: 0.9, size: 14 * scale, size2: 34 * scale, color: 0x261338, layer: L.fx });
    }
    if (size === "s") cue(sim, "explodeS");
    else if (size === "m") {
        cue(sim, "explodeM");
        shake(sim, FEEL.shakeSmall);
    } else {
        cue(sim, "explodeL");
        shake(sim, size === "boss" ? FEEL.shakeBoss : FEEL.shakeLarge);
        hitstop(sim, FEEL.killHitstopLarge);
        flash(sim, size === "boss" ? 0.5 : 0.18);
    }
}

export function muzzle(sim: Sim, x: number, y: number, color: number, size = 7): void {
    spawnFx(sim.world, { kind: FX.muzzle, x, y, life: 0.05, size, size2: size * 0.5, color, layer: L.shot });
}

/** Expanding ring used for armour breaks, bombs and pickups. */
export function ring(sim: Sim, x: number, y: number, from: number, to: number, life: number, color: number, layer: number = L.fx): void {
    spawnFx(sim.world, { kind: FX.ring, x, y, life, size: from, size2: to, color, layer });
}

export function twinkle(sim: Sim, x: number, y: number, color: number): void {
    spawnFx(sim.world, { kind: FX.twinkle, x, y, life: 0.3, size: 7, color, layer: L.fx, vy: -20 });
}
