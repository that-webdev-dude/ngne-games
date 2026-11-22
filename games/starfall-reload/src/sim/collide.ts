import type { Entity } from "@ngne/core";
import { EF, Enemy, Pose, Wall } from "../ecs/components.ts";
import { ITEM, spawnFx } from "../ecs/spawn.ts";
import { B } from "../config/enemies.ts";
import { BOMB, PLAYER } from "../config/tuning.ts";
import { FIELD_H, L } from "../config/view.ts";
import { HALO, W } from "../config/weapons.ts";
import { cue, type Sim } from "./context.ts";
import { FX, impact, sparks } from "./effects.ts";
import { clearBullets } from "./bullets.ts";
import { collectItem, damageEnemy, grazeBullet, hurtPlayer } from "./rules.ts";
import { burstShell, STYLE } from "./weapons.ts";

/** Per-tick snapshot of damageable enemies, rebuilt before probing (cheap: < 100 actors). */
interface Target {
    entity: Entity;
    index: number;
    x: number;
    y: number;
    r: number;
    flags: number;
}
const targets: Target[] = [];

export function gatherTargets(sim: Sim): readonly Target[] {
    targets.length = 0;
    sim.q.enemies.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const e = chunk.views.enemy;
        for (let row = 0, n = chunk.count; row < n; row++) {
            if (e.hp[row]! <= 0 || !(e.flags[row]! & EF.entered) || e.radius[row]! <= 1) continue;
            const entity = chunk.entityAt(row);
            targets.push({ entity, index: entity.index + 1, x: pose.x[row]!, y: pose.y[row]!, r: e.radius[row]!, flags: e.flags[row]! });
        }
    });
    return targets;
}

/** Nearest live, vulnerable target to (x, y), for homing shots. */
export function nearestTarget(x: number, y: number): { x: number; y: number } | null {
    let best: Target | null = null;
    let bestD = Infinity;
    for (const t of targets) {
        if (t.flags & EF.invulnerable || t.y < 0 || t.y > FIELD_H) continue;
        const d = (t.x - x) ** 2 + (t.y - y) ** 2;
        if (d < bestD) {
            bestD = d;
            best = t;
        }
    }
    return best;
}

export function collide(sim: Sim, dt: number): void {
    const { world, run } = sim;
    gatherTargets(sim);

    // Player shots against enemies.
    const bursts: { x: number; y: number }[] = [];
    sim.q.shots.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const shot = chunk.views.shot;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const sx = pose.x[row]!,
                sy = pose.y[row]!,
                sr = shot.radius[row]!;
            const pierce = shot.pierce[row] === 1;
            for (const t of targets) {
                const dx = t.x - sx,
                    dy = t.y - sy,
                    rr = t.r + sr;
                if (dx * dx + dy * dy > rr * rr) continue;
                if (pierce && shot.hit[row] === t.index && !(t.flags & EF.blocksShots)) continue;
                if (t.flags & EF.invulnerable) {
                    sparks(sim, sx, sy, 1, 120, [0xa7b8d8, 0xffffff], Math.PI, 0.8);
                    world.despawn(chunk.entityAt(row));
                    break;
                }
                const killed = damageEnemy(sim, t.entity, shot.damage[row]!);
                if (!killed) impact(sim, sx, sy - 2, shot.weapon[row] === W.lance ? 0xb2f4ff : 0xfff0b8);
                if (killed) t.flags |= EF.invulnerable;
                cue(sim, "hit");
                if (shot.style[row] === STYLE.shell) bursts.push({ x: sx, y: sy });
                if (pierce && !(t.flags & EF.blocksShots)) {
                    shot.hit[row] = t.index;
                    continue;
                }
                world.despawn(chunk.entityAt(row));
                break;
            }
        }
    });
    for (const b of bursts) burstShell(sim, b.x, b.y);

    // Bomb: expanding ring clears bullets; everything on screen takes damage while it lasts.
    if (run.bombT > 0) {
        run.bombT = Math.max(0, run.bombT - dt);
        run.bombR += BOMB.ringSpeed * dt;
        clearBullets(sim, run.bombX, run.bombY, run.bombR, true);
        for (const t of targets) {
            if (t.y < -10 || t.y > FIELD_H + 10) continue;
            const dps = t.flags & EF.boss ? BOMB.bossDamagePerSecond : BOMB.damagePerSecond;
            damageEnemy(sim, t.entity, dps * dt);
        }
    }

    const ship = sim.player;
    const vulnerable = !!ship && sim.playerAlive && !sim.playerInvuln;
    const px = sim.px,
        py = sim.py;

    // HALO satellites: absorb small bullets, grind enemies.
    if (run.weapon === W.halo && sim.playerAlive) {
        sim.q.halos.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            for (let row = 0, n = chunk.count; row < n; row++) {
                const hx = pose.x[row]!,
                    hy = pose.y[row]!;
                for (const t of targets) {
                    const rr = t.r + 6;
                    if ((t.x - hx) ** 2 + (t.y - hy) ** 2 < rr * rr && !(t.flags & EF.invulnerable)) {
                        damageEnemy(sim, t.entity, HALO.contactDps * dt);
                        if (sim.fxRng.next() < 0.3) sparks(sim, hx, hy, 1, 100, [0x9bf27a, 0xffffff]);
                    }
                }
                clearSmallBullets(sim, hx, hy, 6);
            }
        });
    }

    // Hostile bullets against the player: hit, or graze once per bullet.
    if (ship && sim.playerAlive) {
        const g2 = PLAYER.grazeRadius * PLAYER.grazeRadius;
        let hit = false;
        sim.q.bullets.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            const bullet = chunk.views.bullet;
            for (let row = 0, n = chunk.count; row < n; row++) {
                const dx = pose.x[row]! - px,
                    dy = pose.y[row]! - py;
                const d2 = dx * dx + dy * dy;
                if (d2 > g2) continue;
                const hr = bullet.radius[row]! + PLAYER.hitRadius;
                if (vulnerable && !hit && d2 < hr * hr) {
                    hit = true;
                    world.despawn(chunk.entityAt(row));
                    continue;
                }
                if (vulnerable && bullet.grazed[row] === 0) {
                    bullet.grazed[row] = 1;
                    grazeBullet(sim, pose.x[row]!, pose.y[row]!);
                }
            }
        });
        // Enemy bodies (air only).
        if (vulnerable && !hit) {
            for (const t of targets) {
                if (t.flags & (EF.ground | EF.noBodyHit)) continue;
                const rr = t.r * 0.7 + PLAYER.hitRadius;
                if ((t.x - px) ** 2 + (t.y - py) ** 2 < rr * rr) {
                    hit = true;
                    break;
                }
            }
        }
        // Barrier walls.
        if (vulnerable && !hit) hit = touchesWall(sim, px, py);
        if (hit) hurtPlayer(sim, ship);
    }

    // Items: magnetise near the ship, collect on contact.
    sim.q.items.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const motion = chunk.views.motion;
        const item = chunk.views.item;
        for (let row = 0, n = chunk.count; row < n; row++) {
            if (item.kind[row] === 255) continue;
            const age = (item.age[row]! += dt);
            const kind = item.kind[row]!;
            if (kind === ITEM.capsule) {
                if (Math.floor(age / 1.4) !== Math.floor((age - dt) / 1.4)) item.letter[row] = (item.letter[row]! + 1) % 4;
                motion.vx[row] = Math.sin(age * 2.2) * 24;
                motion.vy[row] = 32;
            } else if (kind === ITEM.chip) {
                motion.vy[row] = Math.min(70, motion.vy[row]! + 140 * dt);
            } else motion.vy[row] = 35;
            const dx = px - pose.x[row]!,
                dy = py - pose.y[row]!;
            const d = Math.hypot(dx, dy);
            if (sim.playerAlive && kind === ITEM.chip && (d < 46 || item.magnet[row])) {
                item.magnet[row] = 1;
                const pull = 360;
                motion.vx[row] = (dx / Math.max(1, d)) * pull;
                motion.vy[row] = (dy / Math.max(1, d)) * pull;
            }
            if (sim.playerAlive && d < 14) {
                item.kind[row] = 255;
                collectItem(sim, kind, item.letter[row]!, pose.x[row]!, pose.y[row]!);
                world.despawn(chunk.entityAt(row));
                continue;
            }
            if (pose.y[row]! > FIELD_H + 20) world.despawn(chunk.entityAt(row));
        }
    });
}

function clearSmallBullets(sim: Sim, x: number, y: number, r: number): void {
    sim.q.bullets.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const bullet = chunk.views.bullet;
        for (let row = 0, n = chunk.count; row < n; row++) {
            if (bullet.kind[row] === B.big || bullet.kind[row] === B.shell) continue;
            const rr = r + bullet.radius[row]!;
            if ((pose.x[row]! - x) ** 2 + (pose.y[row]! - y) ** 2 < rr * rr) {
                spawnFx(sim.world, { kind: FX.twinkle, x: pose.x[row]!, y: pose.y[row]!, life: 0.2, size: 5, color: 0x9bf27a, layer: L.fx });
                sim.world.despawn(chunk.entityAt(row));
            }
        }
    });
}

/** Active barrier segments between pylon pairs. */
function touchesWall(sim: Sim, px: number, py: number): boolean {
    let hit = false;
    const { world } = sim;
    sim.q.walls.eachChunk((chunk) => {
        const wall = chunk.views.wall;
        for (let row = 0, n = chunk.count; row < n && !hit; row++) {
            if (wall.warm[row]! < 1) continue;
            const left = wallEnd(world, chunk.entityAt(row), "left");
            const right = wallEnd(world, chunk.entityAt(row), "right");
            if (!left || !right) continue;
            if (Math.abs(py - left.y) < 3.5 && px > left.x + 6 && px < right.x - 6) hit = true;
        }
    });
    return hit;
}

function wallEnd(world: Sim["world"], wall: Entity, side: "left" | "right"): { x: number; y: number } | null {
    const end = world.read(wall, Wall, side);
    if (!end || !world.has(end)) return null;
    const x = world.read(end, Pose, "x"),
        y = world.read(end, Pose, "y");
    if (x === undefined || y === undefined || (world.read(end, Enemy, "hp") ?? 0) <= 0) return null;
    return { x, y };
}
