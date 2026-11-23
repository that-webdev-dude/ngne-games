import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entity } from "@ngne/core";
import { cabinet, input, type Harness } from "./helpers/harness.ts";
import { AREAS } from "../src/config/areas.ts";
import { B, ENEMIES, FENCE, K, M, MINE } from "../src/config/enemies.ts";
import type { ScriptEvent } from "../src/config/script.ts";
import { Enemy, Pose, Ship, Wall } from "../src/ecs/components.ts";
import { spawnEnemy } from "../src/ecs/spawn.ts";
import { spawnBarrier } from "../src/sim/director.ts";
import { FENCE_PHASE, fencePhase } from "../src/sim/motion.ts";
import { damageEnemy, rankScale, startBomb } from "../src/sim/rules.ts";

const TICK = 1 / 60;

/** A play session in Area 1 with the script held and the field emptied of enemies and bullets. */
async function field(seed: string): Promise<Harness> {
    const h = await cabinet(seed);
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    for (let i = 0; i < 180; i++) h.tick();
    const sim = h.sim();
    sim.area.hold = 1;
    for (const q of [sim.q.enemies, sim.q.bullets])
        q.eachChunk((chunk) => {
            for (let row = 0; row < chunk.count; row++) sim.world.despawn(chunk.entityAt(row));
        });
    h.tick();
    return h;
}

/** Keeps the ship untouchable for the next tick. */
const shield = (h: Harness) => h.sim().world.write(h.sim().player!, Ship, "invuln", 5);

/** One shielded tick, which also lands spawns made outside the simulation (they are deferred). */
function settle(h: Harness): void {
    shield(h);
    h.tick();
}

/** Lets the next tick hurt the ship at full power: no invulnerability, no pending hitstop. */
function expose(h: Harness): void {
    const sim = h.sim();
    sim.world.write(sim.player!, Ship, "invuln", 0);
    sim.run.power = 4;
    sim.feedback.hitstop = 0;
}

/** Bearings (rad, 0 = down) and speeds of the hostile bullets of `kind`. */
function rounds(h: Harness, kind: number): { x: number; y: number; angle: number; speed: number }[] {
    const list: { x: number; y: number; angle: number; speed: number }[] = [];
    h.sim().q.bullets.eachChunk((chunk) => {
        const { pose, motion, bullet } = chunk.views;
        for (let row = 0; row < chunk.count; row++)
            if (bullet.kind[row] === kind)
                list.push({ x: pose.x[row]!, y: pose.y[row]!, angle: Math.atan2(motion.vx[row]!, motion.vy[row]!), speed: Math.hypot(motion.vx[row]!, motion.vy[row]!) });
    });
    return list;
}

/** A mine held still at (x, y). */
const mine = (h: Harness, x: number, y: number, hpScale = 1): Entity => spawnEnemy(h.sim().world, { kind: K.mine, x, y, mover: M.straight, m0: 0, m1: 0, hpScale });

const angleGap = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

type Barrier = Extract<ScriptEvent, { type: "barrier" }>;
const barriers = (events: readonly ScriptEvent[]) => events.filter((e): e is Barrier => e.type === "barrier");

test("Area 3 lays 2-3 mine fields of 6-10 mines and 2-3 cycling fences in its second half; Area 2 barriers stay plain", () => {
    const events = AREAS[2]!.events;
    const fields = new Map<number, number>();
    for (const e of events) if (e.type === "enemy" && e.tag.slot === "mines") fields.set(e.tag.wave, (fields.get(e.tag.wave) ?? 0) + 1);
    assert.ok(fields.size >= 2 && fields.size <= 3, `${fields.size} mine fields`);
    for (const n of fields.values()) assert.ok(n >= 6 && n <= 10, `a field of ${n} mines`);
    assert.ok(events.every((e) => e.type !== "enemy" || e.tag.slot !== "mines" || e.init.kind === K.mine), "mine slots hold mines only");

    const boss = events.find((e) => e.type === "boss")!.at;
    const fences = barriers(events).filter((e) => e.tag.slot === "fence");
    assert.ok(fences.length >= 2 && fences.length <= 3, `${fences.length} fences`);
    for (const f of fences) {
        assert.deepEqual(f.fence, { on: FENCE.on, off: FENCE.off }, `fence at ${f.at}s cycles`);
        assert.ok(f.at >= boss / 2, `fence at ${f.at}s is in the second half`);
    }
    assert.ok(barriers(AREAS[1]!.events).every((e) => e.fence === undefined && e.tag.slot === undefined), "Area 2 barriers carry no fence cycle");
});

test("a mine shot by normal fire bursts into a ring of 6 slow bullets that leaves a gap on the ship", async () => {
    const h = await field("T005-MINE-SHOT");
    const sim = h.sim();
    const at = { x: sim.px, y: sim.py - 70 };
    const target = mine(h, at.x, at.y);
    settle(h);
    assert.ok(sim.world.has(target), "the mine is on the field");
    let ring: ReturnType<typeof rounds> = [];
    const scale = { before: 1, after: 1 };
    for (let i = 0; i < 120 && sim.world.has(target); i++) {
        shield(h);
        scale.before = rankScale(sim.run).speed;
        h.tick(input(["KeyZ"]));
        scale.after = rankScale(sim.run).speed;
        ring = rounds(h, B.orange);
    }
    assert.ok(!sim.world.has(target), "the mine was shot down");
    assert.equal(ring.length, MINE.count, "ring of 6 in the tick it died");
    const slowest = Math.min(...ENEMIES.flatMap((s) => (s.gun ? [s.gun.speed] : [])));
    assert.ok(MINE.speed < slowest, `mine bullets (${MINE.speed} px/s) are slower than every gun (${slowest} px/s)`);
    // Rank can move inside the kill tick; the ring's speed is MINE.speed at the rank of that moment.
    const [low, high] = [Math.min(scale.before, scale.after), Math.max(scale.before, scale.after)];
    const bearing = Math.atan2(sim.px - at.x, sim.py - at.y);
    for (const b of ring) {
        assert.ok(b.speed >= MINE.speed * low - 1e-6 && b.speed <= MINE.speed * high + 1e-6, `bullet speed ${b.speed.toFixed(2)}`);
        assert.ok(Math.hypot(b.x - at.x, b.y - at.y) < 2, "bursts where the mine was");
        assert.ok(angleGap(b.angle, bearing) > (Math.PI / MINE.count) * 0.95, "no bullet heads straight at the ship");
    }
});

test("a mine destroyed during a bomb does not burst, even on the bomb's last tick", async () => {
    const h = await field("T005-MINE-BOMB");
    const sim = h.sim();
    sim.run.bombs = 1;
    const first = mine(h, 100, 80);
    settle(h);
    assert.ok(sim.world.has(first), "the mine is on the field");
    startBomb(sim, sim.player!);
    for (let i = 0; i < 30 && sim.world.has(first); i++) {
        settle(h);
        assert.equal(rounds(h, B.orange).length, 0, `no burst during the bomb (tick ${i})`);
    }
    assert.ok(!sim.world.has(first), "the bomb destroyed the mine");

    // A bomb with less than a tick left: its damage still lands this tick, and still suppresses the burst.
    for (let i = 0; i < 120 && sim.run.bombT > 0; i++) h.tick();
    const last = mine(h, 100, 80, 0.001);
    settle(h);
    assert.ok(sim.world.has(last), "the second mine is on the field");
    sim.run.bombT = TICK / 2;
    sim.run.bombR = 0;
    settle(h);
    assert.ok(!sim.world.has(last), "the last bomb tick destroyed the mine");
    assert.equal(sim.run.bombT, 0, "the bomb ended this tick");
    assert.equal(rounds(h, B.orange).length, 0, "no burst on the last bomb tick");
});

test("touching a mine is a hit", async () => {
    const h = await field("T005-MINE-TOUCH");
    const sim = h.sim();
    const touched = mine(h, sim.px, sim.py);
    settle(h);
    expose(h);
    h.tick();
    assert.ok(sim.run.power < 4, `armour hit: power ${sim.run.power}`);
    assert.ok(sim.world.has(touched), "the mine survives the contact, like debris");
});

test("fence phases: off, then a 0.3 s flicker, then on, repeating", () => {
    const at = (t: number) => fencePhase(t, FENCE.on, FENCE.off);
    assert.equal(at(0), FENCE_PHASE.off);
    assert.equal(at(FENCE.off - FENCE.flicker - 0.01), FENCE_PHASE.off);
    assert.equal(at(FENCE.off - FENCE.flicker + 0.01), FENCE_PHASE.flicker);
    assert.equal(at(FENCE.off - 0.01), FENCE_PHASE.flicker);
    assert.equal(at(FENCE.off + 0.01), FENCE_PHASE.on);
    assert.equal(at(FENCE.off + FENCE.on - 0.01), FENCE_PHASE.on);
    assert.equal(at(FENCE.off + FENCE.on + 0.01), FENCE_PHASE.off);
});

/** One sampled ordinary tick of a wall with the ship parked on its beam. */
interface Sample {
    y: number;
    phase: number;
    warm: number;
    hurt: boolean;
}

/**
 * Spawns a barrier (with `fence`, a laser fence) and parks the exposed ship on its left wall every
 * tick. Returns one sample per tick the simulation advanced, `seconds` of them (hitstop ticks are dropped).
 */
async function parkOnWall(seed: string, scroll: number, fence: boolean, seconds: number): Promise<{ h: Harness; samples: Sample[] }> {
    const h = await field(seed);
    const sim = h.sim();
    sim.area.scroll = scroll;
    spawnBarrier(sim, -16, 144, 64, fence ? { on: FENCE.on, off: FENCE.off } : undefined);
    settle(h);
    const wall = () => {
        let w: Entity | undefined;
        sim.q.walls.eachChunk((chunk) => {
            for (let row = 0; row < chunk.count; row++) if ((sim.world.read(chunk.entityAt(row), Pose, "x") ?? 0) < 144) w ??= chunk.entityAt(row);
        });
        return w!;
    };
    const samples: Sample[] = [];
    let lastY = NaN;
    for (let i = 0; i < seconds * 60 * 6 && samples.length < seconds * 60; i++) {
        const w = wall();
        const y = sim.world.read(w, Pose, "y")!;
        sim.world.write(sim.player!, Pose, "x", 60);
        sim.world.write(sim.player!, Pose, "y", Math.max(20, y + scroll * TICK));
        expose(h);
        h.tick();
        const ny = sim.world.read(w, Pose, "y")!;
        if (ny === lastY) continue;
        lastY = ny;
        const on = sim.world.read(w, Wall, "on")!;
        samples.push({
            y: ny,
            phase: on > 0 ? fencePhase(sim.world.read(w, Wall, "cycle")!, on, sim.world.read(w, Wall, "off")!) : -1,
            warm: sim.world.read(w, Wall, "warm")!,
            hurt: sim.run.power < 4,
        });
    }
    return { h, samples };
}

test("the fence hurts only while on, and flickers for 0.3 s before each switch-on", async () => {
    const { samples } = await parkOnWall("T005-FENCE", AREAS[2]!.scroll, true, 4.8);
    const ticks = (from: number, phase: number) => {
        let n = 0;
        while (from - 1 - n >= 0 && samples[from - 1 - n]!.phase === phase) n++;
        return n;
    };
    let onsets = 0;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i]!;
        if (s.y > 12) assert.equal(s.hurt, s.phase === FENCE_PHASE.on, `tick ${i} (y ${s.y.toFixed(1)}): phase ${s.phase}, hurt ${s.hurt}`);
        if (s.phase === FENCE_PHASE.on && samples[i - 1]?.phase !== FENCE_PHASE.on) {
            onsets++;
            const flicker = ticks(i, FENCE_PHASE.flicker);
            assert.ok(Math.abs(flicker * TICK - FENCE.flicker) <= TICK * 1.01, `switch-on ${onsets} after ${(flicker * TICK).toFixed(3)} s of flicker`);
            assert.ok(samples[i - flicker - 1]?.phase === FENCE_PHASE.off, "the flicker follows the off phase");
        }
    }
    assert.ok(onsets >= 2, `${onsets} switch-ons in 4.8 s`);
    const on = samples.filter((s) => s.phase === FENCE_PHASE.on).length * TICK;
    assert.ok(on > FENCE.on, `on for ${on.toFixed(2)} s in total`);
});

test("shooting a fence pylon drops its wall and idles the other pylon", async () => {
    const h = await field("T005-FENCE-PYLON");
    const sim = h.sim();
    sim.area.scroll = AREAS[2]!.scroll;
    spawnBarrier(sim, -16, 144, 64, { on: FENCE.on, off: FENCE.off });
    settle(h);
    const pylons: Entity[] = [];
    sim.q.enemies.eachChunk((chunk) => {
        for (let row = 0; row < chunk.count; row++) if (chunk.views.enemy.kind[row] === K.fencePylon) pylons.push(chunk.entityAt(row));
    });
    assert.equal(pylons.length, 4, "two walls, four fence pylons");
    const walls = () => {
        let n = 0;
        sim.q.walls.eachChunk((chunk) => (n += chunk.count));
        return n;
    };
    // Run into the first on phase, so the pylons pulse.
    for (let i = 0; i < 90; i++) settle(h);
    pylons.sort((a, b) => sim.world.read(a, Pose, "x")! - sim.world.read(b, Pose, "x")!);
    const [outer, inner] = pylons;
    assert.equal(sim.world.read(inner!, Enemy, "frame"), 1, "pylon pulses while its wall is on");
    assert.equal(walls(), 2);
    assert.ok(damageEnemy(sim, outer!, 1000), "the pylon is destroyed");
    settle(h);
    assert.equal(walls(), 1, "its wall is gone; the other wall stays");
    assert.equal(sim.world.read(inner!, Enemy, "frame"), 0, "the surviving pylon idles");
});

test("Area 2 barriers are unchanged: violet pylons, a 0.7 s warm-up, then solid until they leave", async () => {
    const scroll = AREAS[1]!.scroll;
    const { h, samples } = await parkOnWall("T005-BARRIER", scroll, false, 4);
    const sim = h.sim();
    sim.q.enemies.eachChunk((chunk) => {
        for (let row = 0; row < chunk.count; row++) assert.equal(chunk.views.enemy.kind[row], K.pylon, "Area 2 pylons");
    });
    sim.q.walls.eachChunk((chunk) => {
        for (let row = 0; row < chunk.count; row++) assert.equal(chunk.views.wall.on[row], 0, "no fence cycle");
    });
    let warmed = -1;
    for (let i = 0; i < samples.length; i++) {
        const s = samples[i]!;
        assert.equal(s.phase, -1);
        assert.equal(s.hurt, s.warm >= 1, `tick ${i}: warm ${s.warm.toFixed(3)}, hurt ${s.hurt}`);
        if (warmed < 0 && s.warm >= 1) warmed = i;
    }
    const start = samples.findIndex((s) => s.y > 10);
    assert.ok(warmed > 0 && Math.abs((warmed - start) * TICK - 0.7) <= TICK * 1.5, `warm after ${((warmed - start) * TICK).toFixed(3)} s`);
    assert.ok(samples.slice(warmed).every((s) => s.hurt), "solid from then on");
});
