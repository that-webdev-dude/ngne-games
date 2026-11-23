import type { Entity } from "@ngne/core";
import { Enemy, Pose, Wall } from "../ecs/components.ts";
import { FENCE } from "../config/enemies.ts";
import { L } from "../config/view.ts";
import type { Sim } from "./context.ts";

/** Copies every current pose to its previous pose. Runs first each ordinary tick. */
export function beginTick(sim: Sim): void {
    sim.q.poses.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        for (let row = 0, n = chunk.count; row < n; row++) {
            pose.px[row] = pose.x[row]!;
            pose.py[row] = pose.y[row]!;
        }
    });
}

/** Integrates Motion (velocity, acceleration, drag) for bullets, shots and items. */
export function integrate(sim: Sim, dt: number): void {
    sim.q.movers.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const m = chunk.views.motion;
        for (let row = 0, n = chunk.count; row < n; row++) {
            m.vx[row] = m.vx[row]! + m.ax[row]! * dt;
            m.vy[row] = m.vy[row]! + m.ay[row]! * dt;
            const drag = m.drag[row]!;
            if (drag > 0) {
                const k = Math.max(0, 1 - drag * dt);
                m.vx[row] = m.vx[row]! * k;
                m.vy[row] = m.vy[row]! * k;
            }
            pose.x[row] = pose.x[row]! + m.vx[row]! * dt;
            pose.y[row] = pose.y[row]! + m.vy[row]! * dt;
        }
    });
}

/** Particles keep animating through hitstop; they own their previous pose in this system. */
export function updateFx(sim: Sim, dt: number, frozen: boolean): void {
    const { world } = sim;
    // During hitstop particles crawl, which sells the freeze without stopping the world dead.
    const step = frozen ? dt * 0.25 : dt;
    sim.q.fx.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const f = chunk.views.fx;
        for (let row = 0, n = chunk.count; row < n; row++) {
            pose.px[row] = pose.x[row]!;
            pose.py[row] = pose.y[row]!;
            const age = (f.age[row] = f.age[row]! + step);
            if (age >= f.life[row]!) {
                world.despawn(chunk.entityAt(row));
                continue;
            }
            f.vx[row] = f.vx[row]! + f.ax[row]! * step;
            f.vy[row] = f.vy[row]! + f.ay[row]! * step;
            const drag = f.drag[row]!;
            if (drag > 0) {
                const k = Math.max(0, 1 - drag * step);
                f.vx[row] = f.vx[row]! * k;
                f.vy[row] = f.vy[row]! * k;
            }
            pose.x[row] = pose.x[row]! + f.vx[row]! * step;
            pose.y[row] = pose.y[row]! + f.vy[row]! * step;
            f.rot[row] = f.rot[row]! + f.spin[row]! * step;
            if (f.layer[row] === 0) f.layer[row] = L.fx;
        }
    });
    const fb = sim.feedback;
    for (const b of fb.banners) b.t += dt;
    fb.banners = fb.banners.filter((b) => b.t < b.life);
    for (const p of fb.popups) p.t += dt;
    fb.popups = fb.popups.filter((p) => p.t < 0.8);
    fb.shake = Math.max(0, fb.shake - dt * 10 * Math.max(1, fb.shake * 0.5));
    fb.flash = Math.max(0, fb.flash - dt * 2.4);
}

/** A laser fence's phase: off (draws nothing, harmless), flicker (telegraph, harmless) or on (hurts). */
export const FENCE_PHASE = { off: 0, flicker: 1, on: 2 } as const;

/**
 * Phase of a fence `cycle` s into its cycle. Each cycle starts with `off` s off, the last
 * FENCE.flicker s of which flicker, then `on` s on.
 */
export function fencePhase(cycle: number, on: number, off: number): number {
    const t = cycle % (on + off);
    if (t >= off) return FENCE_PHASE.on;
    return t >= off - FENCE.flicker ? FENCE_PHASE.flicker : FENCE_PHASE.off;
}

/**
 * Barrier walls warm up (telegraph) before they become solid; they die with either pylon. A fence's
 * clock starts when a plain wall would start warming; its pylons pulse while it flickers or is on.
 */
export function updateWalls(sim: Sim, dt: number): void {
    const { world } = sim;
    sim.q.walls.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const wall = chunk.views.wall;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const self = chunk.entityAt(row);
            const left = world.read(self, Wall, "left");
            const right = world.read(self, Wall, "right");
            const leftAlive = !!left && world.has(left) && (world.read(left, Enemy, "hp") ?? 0) > 0;
            const rightAlive = !!right && world.has(right) && (world.read(right, Enemy, "hp") ?? 0) > 0;
            const fence = wall.on[row]! > 0;
            if (!leftAlive || !rightAlive) {
                if (fence) for (const end of [left, right]) if (end && world.has(end)) world.write(end, Enemy, "frame", 0);
                world.despawn(self);
                continue;
            }
            wall.age[row] = wall.age[row]! + dt;
            const ly = world.read(left!, Pose, "y") ?? 0;
            if (ly > 10) wall.warm[row] = Math.min(1, wall.warm[row]! + dt / 0.7);
            pose.y[row] = ly;
            pose.x[row] = ((world.read(left!, Pose, "x") ?? 0) + (world.read(right!, Pose, "x") ?? 0)) / 2;
            if (fence) {
                if (ly > 10) wall.cycle[row] = wall.cycle[row]! + dt;
                pulsePylons(world, left!, right!, fencePhase(wall.cycle[row]!, wall.on[row]!, wall.off[row]!) !== FENCE_PHASE.off);
            }
        }
    });
}

function pulsePylons(world: Sim["world"], left: Entity, right: Entity, live: boolean): void {
    const frame = live ? 1 : 0;
    world.write(left, Enemy, "frame", frame);
    world.write(right, Enemy, "frame", frame);
}
