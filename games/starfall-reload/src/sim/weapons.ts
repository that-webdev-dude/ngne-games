import { Halo, Pose } from "../ecs/components.ts";
import { spawnShot } from "../ecs/spawn.ts";
import { FIELD_H, FIELD_W } from "../config/view.ts";
import { HALO, LANCE, SCATTER, VULCAN, W, WEAPONS } from "../config/weapons.ts";
import { cue, type Sim } from "./context.ts";
import { muzzle, sparks } from "./effects.ts";

/** Shot.style values; rendering keys off them. */
export const STYLE = { vulcan: 0, rail: 1, seek: 2, bead: 3, shell: 4, fragment: 5, twin: 6 } as const;

const DEG = Math.PI / 180;

/** Angle in degrees (0 = up, + = clockwise) to a velocity. */
const up = (deg: number, speed: number) => ({ vx: Math.sin(deg * DEG) * speed, vy: -Math.cos(deg * DEG) * speed });

/**
 * Fires the main weapon for one cadence step. Returns the interval until the next volley.
 * `vx` is the ship's current horizontal velocity (used by SCATTER STEER).
 */
export function fireWeapon(sim: Sim, x: number, y: number, vx: number): number {
    const { world, run } = sim;
    const p = run.power;
    const color = WEAPONS[run.weapon]!.color;
    switch (run.weapon) {
        case W.vulcan: {
            if (run.mode === 0) {
                const { count, half } = VULCAN.spread[p]!;
                for (let i = 0; i < count; i++) {
                    const t = count === 1 ? 0.5 : i / (count - 1);
                    const deg = half === 0 ? 0 : -half + t * half * 2;
                    const offset = half === 0 ? (i - (count - 1) / 2) * 7 : 0;
                    const v = up(deg, VULCAN.speed);
                    spawnShot(world, { x: x + offset, y: y - 10, ...v, weapon: W.vulcan, style: STYLE.vulcan, damage: VULCAN.damage, radius: 4 });
                }
            } else {
                const angles = VULCAN.wing[p]!;
                angles.forEach((deg, i) => {
                    const v = up(deg, VULCAN.speed);
                    const offset = deg === 0 ? (i % 2 === 0 ? -4 : 4) : 0;
                    spawnShot(world, { x: x + offset, y: y - 6, ...v, weapon: W.vulcan, style: STYLE.vulcan, damage: VULCAN.damage, radius: 4 });
                });
            }
            muzzle(sim, x, y - 14, color);
            cue(sim, "shot");
            return VULCAN.interval;
        }
        case W.lance: {
            if (run.mode === 0) {
                const lanes = LANCE.lanes[p]!;
                for (let i = 0; i < lanes; i++) {
                    const offset = (i - (lanes - 1) / 2) * 9;
                    spawnShot(world, {
                        x: x + offset,
                        y: y - 14,
                        vx: 0,
                        vy: -LANCE.speed,
                        weapon: W.lance,
                        style: STYLE.rail,
                        damage: LANCE.damage[p]!,
                        radius: 4,
                        pierce: true,
                        life: 0.6,
                    });
                }
                muzzle(sim, x, y - 16, color, 9);
                cue(sim, "laser");
                return LANCE.interval;
            }
            const count = LANCE.seekCount[p]!;
            for (let i = 0; i < count; i++) {
                const deg = -50 + (i / Math.max(1, count - 1)) * 100;
                const v = up(count === 1 ? 0 : deg, LANCE.seekSpeed);
                spawnShot(world, { x, y: y - 8, ...v, weapon: W.lance, style: STYLE.seek, damage: LANCE.seekDamage, radius: 4, homing: LANCE.seekTurn, life: 1.4 });
            }
            muzzle(sim, x, y - 14, color);
            cue(sim, "laser");
            return LANCE.seekInterval;
        }
        case W.halo: {
            spawnShot(world, { x: x - 4, y: y - 10, vx: 0, vy: -540, weapon: W.halo, style: STYLE.twin, damage: HALO.mainDamage, radius: 4 });
            spawnShot(world, { x: x + 4, y: y - 10, vx: 0, vy: -540, weapon: W.halo, style: STYLE.twin, damage: HALO.mainDamage, radius: 4 });
            muzzle(sim, x, y - 14, color);
            cue(sim, "halo");
            return HALO.mainInterval;
        }
        default: {
            const shells = SCATTER.shellsPerVolley[p]!;
            for (let i = 0; i < shells; i++) {
                const deg = shells === 1 ? 0 : -12 + (i / (shells - 1)) * 24;
                const v = up(deg, SCATTER.speed);
                spawnShot(world, {
                    x,
                    y: y - 12,
                    ...v,
                    weapon: W.scatter,
                    style: STYLE.shell,
                    damage: SCATTER.shellDamage,
                    radius: 5,
                    burst: run.mode === 0 ? SCATTER.fuse : SCATTER.steerFuse,
                    steer: run.mode === 1 ? SCATTER.steer : 0,
                    life: 1.2,
                });
            }
            void vx;
            muzzle(sim, x, y - 14, color, 10);
            cue(sim, "scatter");
            return SCATTER.interval;
        }
    }
}

/** Shell detonation into a forward cone of fragments. */
export function burstShell(sim: Sim, x: number, y: number): void {
    const n = SCATTER.fragments[sim.run.power]!;
    for (let i = 0; i < n; i++) {
        const deg = -70 + (i / (n - 1)) * 140 + (sim.rng.next() - 0.5) * 8;
        const v = up(deg, SCATTER.fragmentSpeed * (0.85 + sim.rng.next() * 0.3));
        spawnShot(sim.world, { x, y, ...v, weapon: W.scatter, style: STYLE.fragment, damage: SCATTER.fragmentDamage, radius: 3, life: 0.45 });
    }
    sparks(sim, x, y, 4, 160, [0xffffff, 0xffb347, 0xff7a5c], Math.PI, 1.2);
}

/**
 * Updates player projectiles: homing (LANCE SEEK), steering and fuses (SCATTER), lifetime.
 * `target` finds the nearest enemy to a point; `shipVx` is the ship's horizontal velocity.
 */
export function updateShots(sim: Sim, dt: number, target: (x: number, y: number) => { x: number; y: number } | null, shipVx: number): void {
    const { world } = sim;
    const bursts: { x: number; y: number }[] = [];
    sim.q.shots.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const motion = chunk.views.motion;
        const shot = chunk.views.shot;
        for (let row = 0, n = chunk.count; row < n; row++) {
            shot.age[row]! += dt;
            const x = pose.x[row]!,
                y = pose.y[row]!;
            if (shot.age[row]! > shot.life[row]! || y < -30 || y > FIELD_H + 30 || x < -30 || x > FIELD_W + 30) {
                world.despawn(chunk.entityAt(row));
                continue;
            }
            const homing = shot.homing[row]!;
            if (homing > 0 && shot.age[row]! > 0.06) {
                const t = target(x, y);
                if (t) {
                    const vx = motion.vx[row]!,
                        vy = motion.vy[row]!;
                    const speed = Math.hypot(vx, vy);
                    const want = Math.atan2(t.x - x, t.y - y);
                    const have = Math.atan2(vx, vy);
                    let delta = want - have;
                    while (delta > Math.PI) delta -= Math.PI * 2;
                    while (delta < -Math.PI) delta += Math.PI * 2;
                    const step = Math.max(-homing * dt, Math.min(homing * dt, delta));
                    const a = have + step;
                    const boosted = Math.min(speed + 900 * dt, 640);
                    motion.vx[row] = Math.sin(a) * boosted;
                    motion.vy[row] = Math.cos(a) * boosted;
                }
            }
            const steer = shot.steer[row]!;
            if (steer > 0) motion.vx[row] = motion.vx[row]! + (shipVx * steer - motion.vx[row]! * 0.5) * dt * 4;
            const fuse = shot.burst[row]!;
            if (fuse > 0 && shot.age[row]! >= fuse) {
                bursts.push({ x, y });
                world.despawn(chunk.entityAt(row));
            }
        }
    });
    for (const b of bursts) burstShell(sim, b.x, b.y);
}

/** Keeps the right number of HALO satellites alive and positions them around the ship. */
export function updateHalos(sim: Sim, dt: number, x: number, y: number, active: boolean, firing: boolean): void {
    const { world, run } = sim;
    const want = active && run.weapon === W.halo ? HALO.count[run.power]! : 0;
    let have = 0;
    sim.q.halos.eachChunk((chunk) => {
        const halo = chunk.views.halo;
        for (let row = 0, n = chunk.count; row < n; row++) {
            if (halo.index[row]! >= want) world.despawn(chunk.entityAt(row));
            else have = Math.max(have, halo.index[row]! + 1);
        }
    });
    for (let i = have; i < want; i++) world.spawn(Pose.of({ x, y, px: x, py: y }), Halo.of({ index: i, angle: (i / want) * Math.PI * 2 }));
    const hold = run.mode === 1;
    sim.q.halos.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const halo = chunk.views.halo;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const i = halo.index[row]!;
            if (i >= want) continue;
            let angle: number;
            if (hold) {
                // Forward arc, evenly spread; satellites ease into place.
                const arc = (HALO.holdArc * Math.PI) / 180;
                const target = want === 1 ? Math.PI : Math.PI - arc / 2 + (i / (want - 1)) * arc;
                let d = target - halo.angle[row]!;
                while (d > Math.PI) d -= Math.PI * 2;
                while (d < -Math.PI) d += Math.PI * 2;
                angle = halo.angle[row]! + d * Math.min(1, dt * 12);
            } else {
                angle = halo.angle[row]! + HALO.spin * dt;
                // Re-space evenly when the count changes.
                const ideal = (i / want) * Math.PI * 2;
                const base = Math.round((angle - ideal) / (Math.PI * 2)) * Math.PI * 2 + ideal;
                angle += (base - angle) * Math.min(1, dt * 3);
            }
            halo.angle[row] = angle;
            const radius = hold ? HALO.radius + 4 : HALO.radius;
            pose.x[row] = x + Math.sin(angle) * radius;
            pose.y[row] = y + Math.cos(angle) * radius;
            halo.fireT[row]! -= dt;
            if (firing && halo.fireT[row]! <= 0) {
                halo.fireT[row] = HALO.fireInterval;
                spawnShot(world, { x: pose.x[row]!, y: pose.y[row]! - 4, vx: 0, vy: -480, weapon: W.halo, style: STYLE.bead, damage: HALO.shotDamage, radius: 3 });
            }
        }
    });
}
