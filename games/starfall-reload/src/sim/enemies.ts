import { EF } from "../ecs/components.ts";
import { spawnBullet } from "../ecs/spawn.ts";
import { G, M, spec, type GunSpec } from "../config/enemies.ts";
import { FIELD_H, FIELD_W } from "../config/view.ts";
import { cue, type Sim } from "./context.ts";
import { rankScale } from "./rules.ts";

const DEG = Math.PI / 180;

/** Fires one volley of a gun spec from (x, y). `n` is the enemy's volley counter. */
export function fireGun(sim: Sim, g: GunSpec, x: number, y: number, n: number): void {
    const { world } = sim;
    const scale = rankScale(sim.run);
    const speed = g.speed * scale.speed;
    const aim = Math.atan2(sim.px - x, sim.py - y);
    switch (g.gun) {
        case G.aimed:
        case G.burst:
        case G.fan: {
            const count = g.count;
            const spread = g.spread * DEG;
            for (let i = 0; i < count; i++) {
                const a = count === 1 ? aim : aim - spread / 2 + (i / (count - 1)) * spread;
                spawnBullet(world, x, y, a, speed, g.bullet);
            }
            break;
        }
        case G.ring: {
            const offset = n * 0.21;
            for (let i = 0; i < g.count; i++) spawnBullet(world, x, y, offset + (i / g.count) * Math.PI * 2, speed, g.bullet);
            break;
        }
        case G.spiral: {
            const a = n * g.spread * DEG;
            for (let i = 0; i < g.count; i++) spawnBullet(world, x, y, a + (i / g.count) * Math.PI * 2, speed, g.bullet);
            break;
        }
    }
    cue(sim, "enemyShot");
}

/** Movement scripts, guns, animation timers and culling for all non-boss-controlled enemies. */
export function updateEnemies(sim: Sim, dt: number): void {
    const { world, area } = sim;
    const scale = rankScale(sim.run);
    sim.q.enemies.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const e = chunk.views.enemy;
        for (let row = 0, n = chunk.count; row < n; row++) {
            if (e.hp[row]! <= 0) continue;
            const age = (e.age[row]! += dt);
            if (e.flash[row]! > 0) e.flash[row] = Math.max(0, e.flash[row]! - dt);
            let x = pose.x[row]!,
                y = pose.y[row]!;
            const m0 = e.m0[row]!,
                m1 = e.m1[row]!,
                m2 = e.m2[row]!,
                m3 = e.m3[row]!;
            switch (e.mover[row]) {
                case M.straight:
                    x += m0 * dt;
                    y += m1 * dt;
                    break;
                case M.sine:
                    x = m0 + Math.sin(age * m2) * m1;
                    y += m3 * dt;
                    break;
                case M.dive: {
                    if (y < m1 && age < 4) y = Math.min(m1, y + m3 * dt);
                    else {
                        const hold = e.ox[row]! + dt;
                        e.ox[row] = hold;
                        if (hold > m2) {
                            const t = hold - m2;
                            if (e.oy[row] === 0) e.oy[row] = Math.sign(sim.px - x) || 1;
                            x += e.oy[row]! * Math.min(120, 40 + t * 120) * dt;
                            y += (60 + t * 320) * dt;
                        }
                    }
                    break;
                }
                case M.hover: {
                    const k = Math.min(1, dt * 2.6);
                    if (age < m2) {
                        x += (m0 - x) * k;
                        y += (m1 - y) * k;
                    } else y += m3 * dt * Math.min(1, (age - m2) * 1.5);
                    break;
                }
                case M.ground:
                    x += m0 * dt;
                    y += area.scroll * dt;
                    break;
                case M.drift:
                    x += m0 * dt;
                    y += m1 * dt;
                    e.rot[row] = e.rot[row]! + m2 * dt;
                    break;
                case M.arc: {
                    const t = age * m2;
                    if (t < Math.PI * 1.5) {
                        x = e.ox[row]! + m0 * m1 * Math.sin(t);
                        y = -16 + m1 * (1 - Math.cos(t)) + m3 * age;
                    } else y += 140 * dt;
                    break;
                }
                case M.orbit: {
                    const a = m0 + m2 * age;
                    x = e.ox[row]! + m1 * Math.sin(a);
                    y = e.oy[row]! + m3 * age - m1 * Math.cos(a);
                    break;
                }
                default:
                    continue; // scripted: boss controllers move these.
            }
            pose.x[row] = x;
            pose.y[row] = y;
            const flags = e.flags[row]!;
            if (!(flags & EF.entered) && y > 4 && x > 0 && x < FIELD_W) e.flags[row] = flags | EF.entered;
            // Turrets and crawlers track the player.
            if (flags & EF.ground) e.rot[row] = Math.atan2(sim.px - x, sim.py - y);

            const s = spec(e.kind[row]!);
            const g = s.gun;
            if (g && e.gun[row] !== G.none && e.flags[row]! & EF.entered) {
                e.fireT[row]! -= dt;
                const fair = y > 6 && y < FIELD_H * 0.7 && Math.abs(sim.py - y) > 48 && sim.playerAlive;
                if (e.fireT[row]! <= 0) {
                    if (fair) {
                        const count = e.fireN[row]!;
                        if (g.gun === G.burst) {
                            fireGun(sim, { ...g, count: 1 }, x, y, count);
                            e.fireN[row] = count + 1;
                            e.fireT[row] = (count + 1) % g.count === 0 ? g.every * scale.rate : 0.11;
                        } else {
                            fireGun(sim, g, x, y, count);
                            e.fireN[row] = count + 1;
                            e.fireT[row] = g.every * scale.rate;
                        }
                    } else e.fireT[row] = 0.2;
                }
            }
            const gone = y > FIELD_H + 48 || (age > 4 && y < -90) || x < -70 || x > FIELD_W + 70;
            if (gone) world.despawn(chunk.entityAt(row));
        }
    });
}
