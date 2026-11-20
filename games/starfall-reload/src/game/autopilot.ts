import { Enemy, Pose } from "../ecs/components.ts";
import { FIELD_H, FIELD_W } from "../config/view.ts";
import { noActions, type Actions } from "../sim/actions.ts";
import type { Sim } from "../sim/context.ts";

/**
 * A pilot that re-decides only every `reactionTicks` ticks and holds that decision in between,
 * approximating human reaction time (1 = frame-perfect demo pilot).
 */
export function createPilot(reactionTicks = 1): (sim: Sim) => Actions {
    let held = noActions();
    let tick = 0;
    return (sim) => {
        if (tick++ % Math.max(1, reactionTicks) === 0) held = autopilot(sim);
        return { ...held, bombPressed: held.bombPressed && tick % Math.max(1, reactionTicks) === 1 };
    };
}

/**
 * Attract-mode demo pilot. It sees only what a player sees (positions and velocities), steers
 * towards a target lane, and is pushed away from bullets predicted ~0.2 s ahead and from enemy
 * bodies and debris. Good enough to show the game off.
 */
export function autopilot(sim: Sim): Actions {
    const a = noActions();
    a.fire = true;
    const { world } = sim;
    let tx = FIELD_W / 2;
    if (sim.boss && world.has(sim.boss.root)) {
        let best: number | null = null;
        for (const part of sim.boss.parts) {
            if (!world.has(part.entity) || ((world.read(part.entity, Enemy, "flags") ?? 2) & 2)) continue;
            best = world.read(part.entity, Pose, "x") ?? null;
            break;
        }
        tx = best ?? world.read(sim.boss.root, Pose, "x") ?? tx;
    } else {
        let bestScore = -Infinity;
        sim.q.enemies.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            for (let row = 0; row < chunk.count; row++) {
                const y = pose.y[row]!;
                if (y < 0 || y > sim.py - 40) continue;
                const score = y - Math.abs(pose.x[row]! - sim.px) * 0.6;
                if (score > bestScore) {
                    bestScore = score;
                    tx = pose.x[row]!;
                }
            }
        });
    }
    let vx = Math.max(-1, Math.min(1, (tx - sim.px) / 30));
    let vy = Math.max(-1, Math.min(1, (288 - sim.py) / 30));
    let danger = 0,
        close = 0;
    sim.q.bullets.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const m = chunk.views.motion;
        for (let row = 0; row < chunk.count; row++) {
            const fx = pose.x[row]! + m.vx[row]! * 0.2 - sim.px;
            const fy = pose.y[row]! + m.vy[row]! * 0.2 - sim.py;
            const d2 = fx * fx + fy * fy;
            if (d2 > 60 * 60) continue;
            const d = Math.sqrt(d2) + 1;
            const push = 900 / (d * d);
            vx -= (fx / d) * push;
            vy -= (fy / d) * push;
            danger += push;
            if (d < 22) close++;
        }
    });
    // Bodies and debris (anything that hurts on contact) repel within their radius plus a margin.
    sim.q.enemies.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const e = chunk.views.enemy;
        for (let row = 0; row < chunk.count; row++) {
            if (e.flags[row]! & 1 || e.radius[row]! <= 1) continue;
            const fx = pose.x[row]! - sim.px;
            const fy = pose.y[row]! - sim.py;
            const reach = e.radius[row]! + 26;
            const d = Math.hypot(fx, fy) + 1;
            if (d > reach) continue;
            const push = (reach - d) / 8;
            vx -= (fx / d) * push;
            vy -= (fy / d) * push;
        }
    });
    // Walls of the playfield push back too.
    vx += Math.max(0, 30 - sim.px) / 15 - Math.max(0, sim.px - (FIELD_W - 30)) / 15;
    vy -= Math.max(0, sim.py - (FIELD_H - 24)) / 10;
    const length = Math.hypot(vx, vy);
    if (length > 1) {
        vx /= length;
        vy /= length;
    }
    a.mx = Math.abs(vx) < 0.08 ? 0 : vx;
    a.my = Math.abs(vy) < 0.08 ? 0 : vy;
    a.focus = danger > 1.5;
    a.bombPressed = close >= 4 && sim.run.bombs > 0 && !sim.playerInvuln;
    return a;
}
