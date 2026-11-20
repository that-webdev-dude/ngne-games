import type { Entity } from "@ngne/core";
import { Enemy, Pose, Ship } from "../ecs/components.ts";
import { ITEM, spawnBullet, spawnItem } from "../ecs/spawn.ts";
import { B, DROP, spec } from "../config/enemies.ts";
import { BOMB, CHAIN, EXTENDS, GRAZE, PLAYER, POWER, RANK, SCORE } from "../config/tuning.ts";
import { WEAPONS } from "../config/weapons.ts";
import { banner, cue, flash, popup, shake, type Run, type Sim } from "./context.ts";
import { explosion, ring, sparks } from "./effects.ts";
import { clearBullets } from "./bullets.ts";

/** Pure rule helpers (no world access) — unit tested in tests/rules.test.ts. */
export const chainMultiplier = (chain: number): number => Math.min(CHAIN.maxMult, 1 + Math.floor(chain / CHAIN.perStep));

export const chipsForNext = (power: number): number => POWER.chipsPerLevel[power] ?? Infinity;

/** Adds chips; returns the number of levels gained. */
export function addChips(run: Run, count: number): number {
    let gained = 0;
    run.chips += count;
    while (run.power < PLAYER.maxPower && run.chips >= chipsForNext(run.power)) {
        run.chips -= chipsForNext(run.power);
        run.power++;
        gained++;
    }
    if (run.power >= PLAYER.maxPower) run.chips = 0;
    return gained;
}

/** Outcome of a hit on the player under the power-as-armour rule. */
export function armourHit(power: number): { destroyed: boolean; power: number } {
    if (power <= 0) return { destroyed: true, power: 0 };
    return { destroyed: false, power: Math.max(0, power - POWER.hitLoss) };
}

/** Score with extends. Returns true when an extend was awarded. */
export function addScoreRaw(run: Run, points: number): boolean {
    run.score += Math.round(points);
    const next = EXTENDS[run.extendIndex];
    if (next !== undefined && run.score >= next) {
        run.extendIndex++;
        run.lives++;
        return true;
    }
    return false;
}

export function addScore(sim: Sim, points: number): void {
    if (addScoreRaw(sim.run, points)) {
        cue(sim, "extend");
        banner(sim, "EXTEND", "+1 SHIP", "extend", 1.6);
    }
}

export function rankScale(run: Run): { speed: number; rate: number } {
    return { speed: 1 + run.rank * RANK.bulletSpeedPer, rate: 1 / (1 + run.rank * RANK.fireRatePer) };
}

export function adjustRank(run: Run, delta: number): void {
    run.rank = Math.max(0, Math.min(RANK.max, run.rank + delta));
}

/** Damage an enemy; kills it when hp reaches 0. Returns true on kill. */
export function damageEnemy(sim: Sim, entity: Entity, amount: number): boolean {
    const world = sim.world;
    const hp = world.read(entity, Enemy, "hp");
    const flags = world.read(entity, Enemy, "flags");
    if (hp === undefined || flags === undefined || hp <= 0) return false;
    if (flags & 2) return false; // invulnerable
    const left = hp - amount;
    world.write(entity, Enemy, "hp", left);
    world.write(entity, Enemy, "flash", 0.034);
    if (left > 0) return false;
    killEnemy(sim, entity);
    return true;
}

export function killEnemy(sim: Sim, entity: Entity): void {
    const world = sim.world;
    const kind = world.read(entity, Enemy, "kind") ?? 0;
    const x = world.read(entity, Pose, "x") ?? 0;
    const y = world.read(entity, Pose, "y") ?? 0;
    const drop = world.read(entity, Enemy, "drop") ?? 0;
    const flags = world.read(entity, Enemy, "flags") ?? 0;
    const s = spec(kind);
    world.write(entity, Enemy, "hp", 0);
    const run = sim.run;
    run.kills++;
    run.chain++;
    run.chainT = CHAIN.window;
    run.maxChain = Math.max(run.maxChain, run.chain);
    const mult = chainMultiplier(run.chain);
    const points = s.score * mult;
    addScore(sim, points);
    if (s.size !== "s" || mult > 1) popup(sim, x, y - 6, String(points), mult > 1 ? 0xffd25c : 0xffffff);
    if (run.chain > 0 && run.chain % CHAIN.perStep === 0 && mult > 1) banner(sim, `CHAIN ${run.chain}`, `x${mult}`, "chain", 1);
    if (s.size === "boss") {
        // Boss cores stay in the world; their controller plays the break sequence.
        world.write(entity, Enemy, "flags", flags | 2);
        return;
    }
    const hull = flags & 1 ? 0x7a4a32 : 0x4f6852;
    explosion(sim, x, y, s.size, hull);
    // Revenge bullet at high rank keeps greed honest; never at point blank.
    if (s.size === "s" && run.rank >= RANK.revengeAt && sim.playerAlive && Math.abs(sim.py - y) > 70) {
        const a = Math.atan2(sim.px - x, sim.py - y);
        spawnBullet(world, x, y, a, 95 * rankScale(run).speed, B.gold);
    }
    dropItems(sim, drop, x, y);
    world.despawn(entity);
}

export function dropItems(sim: Sim, drop: number, x: number, y: number): void {
    const world = sim.world;
    const r = sim.rng;
    const chips = drop === DROP.chip ? 1 : drop === DROP.chips2 ? 2 : drop === DROP.chips4 ? 4 : 0;
    for (let i = 0; i < chips; i++) spawnItem(world, ITEM.chip, x + (r.next() - 0.5) * 10, y, (r.next() - 0.5) * 70, -60 - r.next() * 50);
    if (drop === DROP.capsule) spawnItem(world, ITEM.capsule, x, y, 0, 30, r.int(0, 3));
    if (drop === DROP.bomb) spawnItem(world, ITEM.bomb, x, y, 0, 30);
    if (drop === DROP.oneup) spawnItem(world, ITEM.oneup, x, y, 0, 30);
}

export function collectItem(sim: Sim, kind: number, letter: number, x: number, y: number): void {
    const run = sim.run;
    if (kind === ITEM.chip) {
        addScore(sim, SCORE.chip);
        const gained = addChips(run, 1);
        cue(sim, gained ? "powerUp" : "chip");
        if (gained) powerUpFx(sim, x, y);
        return;
    }
    if (kind === ITEM.capsule) {
        if (letter === run.weapon) {
            if (run.power < PLAYER.maxPower) {
                run.power++;
                run.chips = 0;
                powerUpFx(sim, x, y);
            } else addScore(sim, SCORE.capsuleOverflow);
        } else {
            run.weapon = letter;
            run.mode = 0;
            banner(sim, WEAPONS[letter]!.name, WEAPONS[letter]!.blurb, "info", 1.4);
        }
        cue(sim, "pickup");
        ring(sim, x, y, 4, 30, 0.25, WEAPONS[letter]!.color);
        return;
    }
    if (kind === ITEM.bomb) {
        if (run.bombs < PLAYER.maxBombs) run.bombs++;
        else addScore(sim, GRAZE.overflowScore);
        cue(sim, "pickup");
        ring(sim, x, y, 4, 30, 0.25, 0xffb347);
        return;
    }
    if (kind === ITEM.oneup) {
        run.lives++;
        cue(sim, "extend");
        banner(sim, "EXTEND", "+1 SHIP", "extend", 1.6);
    }
}

function powerUpFx(sim: Sim, x: number, y: number): void {
    ring(sim, x, y, 6, 40, 0.3, 0x46c8ee);
    banner(sim, sim.run.power >= PLAYER.maxPower ? "MAX POWER" : "POWER UP", `LEVEL ${sim.run.power}`, "info", 1);
}

export function grazeBullet(sim: Sim, x: number, y: number): void {
    const run = sim.run;
    run.grazeTotal++;
    run.grazeMeter++;
    addScore(sim, GRAZE.score * (1 + Math.floor(run.rank)));
    cue(sim, "graze");
    sparks(sim, x, y, 1, 90, [0xffffff, 0xb2f4ff], Math.PI, Math.PI);
    if (run.grazeMeter >= GRAZE.perBomb) {
        run.grazeMeter = 0;
        if (run.bombs < PLAYER.maxBombs) {
            run.bombs++;
            cue(sim, "reload");
            banner(sim, "RELOAD", "BOMB +1", "reload", 1.4);
        } else addScore(sim, GRAZE.overflowScore);
    }
}

/** Player struck by a bullet, body or wall. */
export function hurtPlayer(sim: Sim, ship: Entity): void {
    const world = sim.world;
    if ((world.read(ship, Ship, "invuln") ?? 0) > 0 || !world.read(ship, Ship, "alive")) return;
    const run = sim.run;
    const x = world.read(ship, Pose, "x") ?? 0;
    const y = world.read(ship, Pose, "y") ?? 0;
    const outcome = armourHit(run.power);
    run.chain = 0;
    if (!outcome.destroyed) {
        run.power = outcome.power;
        run.chips = 0;
        world.write(ship, Ship, "invuln", PLAYER.invulnHit);
        clearBullets(sim, x, y, 70, false);
        ring(sim, x, y, 4, 70, 0.35, 0x46c8ee);
        sparks(sim, x, y, 14, 220, [0xffffff, 0xb2f4ff, 0x46c8ee]);
        flash(sim, 0.35, 0x46c8ee);
        shake(sim, 3);
        cue(sim, "armorHit");
        sim.feedback.hitstop = Math.max(sim.feedback.hitstop, 4);
        banner(sim, "ARMOUR BREAK", `POWER ${run.power}`, "warning", 1);
        return;
    }
    // Ship destroyed.
    run.missesThisArea++;
    run.lives--;
    adjustRank(run, -RANK.deathLoss);
    world.write(ship, Ship, "alive", 0);
    world.write(ship, Ship, "respawn", PLAYER.respawnDelay);
    explosion(sim, x, y, "l", 0xa7b8d8);
    flash(sim, 0.6, 0xff8a86);
    cue(sim, "playerDie");
    clearBullets(sim, x, y, 400, false);
    const r = sim.rng;
    // Death chips launch high and home in after the respawn, so a recovery is reliable.
    for (let i = 0; i < POWER.deathChips; i++) spawnItem(world, ITEM.chip, x, y, (r.next() - 0.5) * 140, -160 - r.next() * 70, 0, true);
    run.power = 0;
    run.chips = 0;
}

export function startBomb(sim: Sim, ship: Entity): void {
    const run = sim.run;
    if (run.bombs <= 0 || run.bombT > 0) return;
    run.bombs--;
    run.bombsUsed++;
    run.bombT = BOMB.duration;
    run.bombR = 0;
    run.bombX = sim.px;
    run.bombY = sim.py;
    adjustRank(run, -RANK.bombLoss);
    sim.world.write(ship, Ship, "invuln", Math.max(sim.world.read(ship, Ship, "invuln") ?? 0, BOMB.invuln));
    cue(sim, "bomb");
    flash(sim, 0.8, 0xfff0b8);
    shake(sim, 5);
    sim.feedback.hitstop = Math.max(sim.feedback.hitstop, BOMB.hitstopTicks);
    ring(sim, sim.px, sim.py, 6, 440, 0.3, 0xffffff);
    ring(sim, sim.px, sim.py, 4, 420, 0.55, 0xffb347);
    ring(sim, sim.px, sim.py, 2, 260, BOMB.duration, 0xff7a5c);
}
