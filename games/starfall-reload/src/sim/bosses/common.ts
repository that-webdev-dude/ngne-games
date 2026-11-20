import type { Entity } from "@ngne/core";
import { EF, Enemy, Pose } from "../../ecs/components.ts";
import { spawnBullet, spawnEnemy } from "../../ecs/spawn.ts";
import { M, spec } from "../../config/enemies.ts";
import { FEEL, SCORE } from "../../config/tuning.ts";
import { banner, cue, flash, hitstop, popup, shake, type BossRuntime, type Sim } from "../context.ts";
import { explosion, ring, sparks } from "../effects.ts";
import { clearBullets } from "../bullets.ts";
import { addScore, dropItems, rankScale } from "../rules.ts";

export interface BossController {
    readonly id: string;
    readonly midboss: boolean;
    spawn(sim: Sim): BossRuntime;
    /** Called every tick while the boss is alive (not entering or dying). */
    update(sim: Sim, b: BossRuntime, dt: number): void;
    /** Root position for this tick. */
    move(sim: Sim, b: BossRuntime, dt: number): { x: number; y: number };
    /** Offsets for each part role relative to the root. */
    offset(role: number, b: BossRuntime): { x: number; y: number };
    /** Core health shown on the HUD bar; the boss breaks when it reaches zero. */
    health(sim: Sim, b: BossRuntime): number;
    /** Seconds before the boss withdraws (no bonus). */
    readonly limit: number;
    /** The entity whose health decides the fight. */
    core(b: BossRuntime): Entity;
    /** Final bosses override escape: called once when the timer runs out. */
    onTimeout?(sim: Sim, b: BossRuntime): void;
    readonly entryY: number;
    readonly music: "boss" | "finalBoss" | null;
}

export function newBoss(kind: number, root: Entity, name: string, midboss: boolean, maxHp: number): BossRuntime {
    return {
        kind,
        root,
        parts: [],
        phase: 0,
        t: 0,
        phaseT: 0,
        timer: 0,
        clocks: {},
        entering: true,
        dying: 0,
        escaped: false,
        name,
        maxHp,
        hp: maxHp,
        midboss,
        armoured: true,
        overtime: false,
    };
}

export function spawnRoot(sim: Sim, kind: number, x: number, y: number, hpScale = 1): Entity {
    return spawnEnemy(sim.world, { kind, x, y, mover: M.scripted, flags: EF.invulnerable | EF.entered, hpScale });
}

export function spawnPart(sim: Sim, b: BossRuntime, kind: number, role: number, x: number, y: number, extraFlags = 0): Entity {
    const entity = spawnEnemy(sim.world, { kind, x, y, mover: M.scripted, part: role, flags: EF.invulnerable | EF.entered | extraFlags });
    b.parts.push({ entity, role });
    return entity;
}

/** True once per `interval` seconds on the named clock (interval scaled by rank). */
export function every(sim: Sim, b: BossRuntime, key: string, interval: number, dt: number, offset = 0): boolean {
    const scaled = interval * rankScale(sim.run).rate;
    const clock = (b.clocks[key] ?? -offset) + dt;
    if (clock >= scaled) {
        b.clocks[key] = clock - scaled;
        return true;
    }
    b.clocks[key] = clock;
    return false;
}

export const alive = (sim: Sim, e: Entity): boolean => sim.world.has(e) && (sim.world.read(e, Enemy, "hp") ?? 0) > 0;
export const hpOf = (sim: Sim, e: Entity): number => (sim.world.has(e) ? Math.max(0, sim.world.read(e, Enemy, "hp") ?? 0) : 0);
export const posOf = (sim: Sim, e: Entity): { x: number; y: number } | null => {
    const x = sim.world.read(e, Pose, "x"),
        y = sim.world.read(e, Pose, "y");
    return x === undefined || y === undefined ? null : { x, y };
};

export function setVulnerable(sim: Sim, e: Entity, vulnerable: boolean): void {
    const flags = sim.world.read(e, Enemy, "flags");
    if (flags === undefined) return;
    sim.world.write(e, Enemy, "flags", vulnerable ? flags & ~EF.invulnerable : flags | EF.invulnerable);
}

export function setFrame(sim: Sim, e: Entity, frame: number): void {
    if (sim.world.has(e)) sim.world.write(e, Enemy, "frame", frame);
}

/** Bullet emitters shared by the bosses. Angles in radians, 0 = down. */
export const shoot = {
    aim(sim: Sim, x: number, y: number): number {
        return Math.atan2(sim.px - x, sim.py - y);
    },
    fan(sim: Sim, x: number, y: number, center: number, count: number, spreadDeg: number, speed: number, kind: number): void {
        const s = rankScale(sim.run).speed;
        const spread = (spreadDeg * Math.PI) / 180;
        for (let i = 0; i < count; i++) {
            const a = count === 1 ? center : center - spread / 2 + (i / (count - 1)) * spread;
            spawnBullet(sim.world, x, y, a, speed * s, kind);
        }
        cue(sim, "enemyShot");
    },
    ring(sim: Sim, x: number, y: number, count: number, speed: number, kind: number, offset = 0): void {
        const s = rankScale(sim.run).speed;
        for (let i = 0; i < count; i++) spawnBullet(sim.world, x, y, offset + (i / count) * Math.PI * 2, speed * s, kind);
        cue(sim, "enemyShot");
    },
    one(sim: Sim, x: number, y: number, angle: number, speed: number, kind: number, extra?: Parameters<typeof spawnBullet>[6]): void {
        spawnBullet(sim.world, x, y, angle, speed * rankScale(sim.run).speed, kind, extra);
    },
};

/**
 * Runs a boss: entry, part placement, controller update, health tracking, time limit,
 * escape and the break (death) sequence. Returns false when the boss is finished.
 */
export function runBoss(sim: Sim, c: BossController, b: BossRuntime, dt: number): boolean {
    const { world } = sim;
    b.t += dt;
    const root = posOf(sim, b.root);
    if (!root) return b.t < 0.2; // pending spawn on the first tick; otherwise the root is gone
    const at = b.escaped
        ? { x: root.x, y: root.y - 130 * dt }
        : b.dying > 0
          ? { x: root.x + (sim.fxRng.next() - 0.5) * 1.5, y: root.y + 10 * dt }
          : c.move(sim, b, dt);
    world.write(b.root, Pose, "x", at.x);
    world.write(b.root, Pose, "y", at.y);
    for (const part of b.parts) {
        if (!world.has(part.entity)) continue;
        const o = c.offset(part.role, b);
        world.write(part.entity, Pose, "x", at.x + o.x);
        world.write(part.entity, Pose, "y", at.y + o.y);
        const flash = world.read(part.entity, Enemy, "flash") ?? 0;
        if (flash > 0) world.write(part.entity, Enemy, "flash", Math.max(0, flash - dt));
    }
    const rootFlash = world.read(b.root, Enemy, "flash") ?? 0;
    if (rootFlash > 0) world.write(b.root, Enemy, "flash", Math.max(0, rootFlash - dt));
    b.hp = c.health(sim, b);
    b.armoured = ((sim.world.read(c.core(b), Enemy, "flags") ?? 2) & EF.invulnerable) !== 0;

    if (b.dying > 0) return breakSequence(sim, c, b, at.x, at.y, dt);
    if (b.escaped) {
        if (at.y < -140) {
            despawnBoss(sim, b);
            return false;
        }
        return true;
    }
    if (b.entering) {
        if (Math.abs(at.y - c.entryY) < 1.5) {
            b.entering = false;
            b.phaseT = 0;
        }
        return true;
    }
    const limit = c.limit;
    if (b.t > limit + 4 && c.onTimeout) {
        if (!b.overtime) {
            b.overtime = true;
            c.onTimeout(sim, b);
        }
    } else if (b.t > limit + 4) {
        b.escaped = true;
        banner(sim, c.midboss ? "TARGET WITHDRAWN" : "TARGET ESCAPED", "NO BONUS", "warning", 2);
        clearBullets(sim, at.x, at.y, 600, false);
        return true;
    }
    b.phaseT += dt;
    c.update(sim, b, dt);
    if (b.hp <= 0) startBreak(sim, c, b, at.x, at.y, limit);
    return true;
}

function startBreak(sim: Sim, c: BossController, b: BossRuntime, x: number, y: number, limit: number): void {
    b.dying = 0.0001;
    for (const part of b.parts) setVulnerable(sim, part.entity, false);
    setVulnerable(sim, b.root, false);
    const cleared = clearBullets(sim, x, y, 700, true);
    const remaining = Math.max(0, Math.round(limit - b.t + 4));
    const bonus = c.midboss ? remaining * 300 : remaining * SCORE.bossTimeBonusPerSecond;
    addScore(sim, bonus);
    popup(sim, x, y + 20, `TIME BONUS ${bonus}`, 0xffd25c);
    if (cleared > 0) popup(sim, x, y + 32, `CANCEL ${cleared * 10}`, 0xb2f4ff);
    hitstop(sim, c.midboss ? 6 : FEEL.bossBreakTicks);
    flash(sim, 1, 0xffffff);
    shake(sim, FEEL.shakeBoss);
    cue(sim, c.midboss ? "explodeL" : "bossBreak");
}

function breakSequence(sim: Sim, c: BossController, b: BossRuntime, x: number, y: number, dt: number): boolean {
    const duration = c.midboss ? 1.0 : 2.6;
    const before = b.dying;
    b.dying += dt;
    const r = sim.fxRng;
    const w = c.midboss ? 26 : 70,
        h = c.midboss ? 20 : 40;
    // Rolling explosions across the hull, accelerating towards the end.
    const rate = c.midboss ? 0.09 : Math.max(0.05, 0.16 - b.dying * 0.04);
    if (Math.floor(b.dying / rate) !== Math.floor(before / rate)) {
        explosion(sim, x + (r.next() - 0.5) * w * 2, y + (r.next() - 0.5) * h * 2, c.midboss ? "m" : "l");
        shake(sim, 3);
    }
    if (b.dying >= duration) {
        explosion(sim, x, y, "boss");
        ring(sim, x, y, 10, 300, 0.7, 0xffffff);
        ring(sim, x, y, 4, 200, 0.9, 0xffb347);
        sparks(sim, x, y, 40, 380);
        flash(sim, 1, 0xffffff);
        shake(sim, 10);
        hitstop(sim, 8);
        const drop = spec(b.kind).drop;
        if (drop) dropItems(sim, drop, x, y);
        despawnBoss(sim, b);
        if (!c.midboss) banner(sim, "TARGET DESTROYED", b.name, "info", 2.4);
        return false;
    }
    return true;
}

export function despawnBoss(sim: Sim, b: BossRuntime): void {
    for (const part of b.parts) sim.world.despawn(part.entity);
    sim.world.despawn(b.root);
}

/** Root eases towards a target point. */
export function ease(current: number, target: number, rate: number, dt: number): number {
    return current + (target - current) * Math.min(1, rate * dt);
}

/**
 * Phase change: cancel the field (for score), reset gun clocks and give the player a short
 * breather before the new pattern starts (callers skip firing while phaseT < PHASE_PAUSE).
 */
export const PHASE_PAUSE = 0.8;
export function changePhase(sim: Sim, b: BossRuntime, phase: number, x: number, y: number): void {
    b.phase = phase;
    b.phaseT = 0;
    b.clocks = {};
    clearBullets(sim, x, y, 600, true);
}

/**
 * Keeps a core at or above `fraction` of `max` health. Used so burst damage cannot skip a
 * phase: each phase plays for a minimum time before its health threshold can be crossed.
 */
export function holdHp(sim: Sim, e: Entity, max: number, fraction: number): void {
    const hp = sim.world.read(e, Enemy, "hp");
    if (hp !== undefined && hp > 0 && hp < max * fraction) sim.world.write(e, Enemy, "hp", max * fraction);
}
