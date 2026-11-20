import { FIELD_H, FIELD_W } from "../config/view.ts";
import { spawnBullet, spawnFx } from "../ecs/spawn.ts";
import { B } from "../config/enemies.ts";
import { L } from "../config/view.ts";
import type { Sim } from "./context.ts";
import { FX } from "./effects.ts";
import { addScore } from "./rules.ts";

const MARGIN = 24;

/** Advances hostile bullets: delayed re-aim, homing turn, off-screen culling. Motion integrates position. */
export function updateBullets(sim: Sim, dt: number): void {
    const { world } = sim;
    const splits: { x: number; y: number; n: number; speed: number }[] = [];
    sim.q.bullets.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const motion = chunk.views.motion;
        const bullet = chunk.views.bullet;
        for (let row = 0, n = chunk.count; row < n; row++) {
            bullet.age[row]! += dt;
            const delay = bullet.delay[row]!;
            if (delay > 0 && bullet.age[row]! >= delay && bullet.split[row]! > 0) {
                splits.push({ x: pose.x[row]!, y: pose.y[row]!, n: bullet.split[row]!, speed: bullet.speed2[row]! });
                world.despawn(chunk.entityAt(row));
                continue;
            }
            if (delay > 0 && bullet.age[row]! >= delay) {
                bullet.delay[row] = 0;
                const a = Math.atan2(sim.px - pose.x[row]!, sim.py - pose.y[row]!);
                const s = bullet.speed2[row]!;
                motion.vx[row] = Math.sin(a) * s;
                motion.vy[row] = Math.cos(a) * s;
            }
            const turn = bullet.turn[row]!;
            if (turn !== 0) {
                const vx = motion.vx[row]!,
                    vy = motion.vy[row]!;
                const c = Math.cos(turn * dt),
                    s = Math.sin(turn * dt);
                motion.vx[row] = vx * c - vy * s;
                motion.vy[row] = vx * s + vy * c;
            }
            const x = pose.x[row]!,
                y = pose.y[row]!;
            if (x < -MARGIN || x > FIELD_W + MARGIN || y < -MARGIN * 3 || y > FIELD_H + MARGIN) world.despawn(chunk.entityAt(row));
        }
    });
    for (const s of splits) {
        const offset = Math.atan2(sim.px - s.x, sim.py - s.y);
        for (let i = 0; i < s.n; i++) spawnBullet(world, s.x, s.y, offset + (i / s.n) * Math.PI * 2, s.speed, B.pink);
        spawnFx(world, { kind: FX.ring, x: s.x, y: s.y, life: 0.2, size: 4, size2: 18, color: 0xff8a86, layer: L.fx });
    }
}

/**
 * Cancels hostile bullets within `radius` of (x, y). Cancelled bullets burst into small
 * twinkles; with `score`, each awards points (bomb and boss-break cancels).
 */
export function clearBullets(sim: Sim, x: number, y: number, radius: number, score: boolean): number {
    const { world } = sim;
    let cleared = 0;
    const r2 = radius * radius;
    sim.q.bullets.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const dx = pose.x[row]! - x,
                dy = pose.y[row]! - y;
            if (dx * dx + dy * dy > r2) continue;
            cleared++;
            if (cleared % 2 === 0 || cleared < 40)
                spawnFx(world, { kind: FX.twinkle, x: pose.x[row]!, y: pose.y[row]!, vy: -40, life: 0.35, size: 6, color: score ? 0xffe27a : 0xb2f4ff, layer: L.fx });
            world.despawn(chunk.entityAt(row));
        }
    });
    if (score && cleared > 0) addScore(sim, cleared * 10);
    return cleared;
}
