import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entity } from "@ngne/core";
import { cabinet, input, type Harness } from "./helpers/harness.ts";
import { B, K, M, SHELL, spec } from "../src/config/enemies.ts";
import { Script } from "../src/config/script.ts";
import { FIELD_H, FIELD_W } from "../src/config/view.ts";
import { W } from "../src/config/weapons.ts";
import { Pose, Ship } from "../src/ecs/components.ts";
import { spawnBullet, spawnEnemy, type EnemyInit } from "../src/ecs/spawn.ts";
import { killEnemy } from "../src/sim/rules.ts";

const TICK = 1 / 60;

/** A play session with the script held, nothing on the field and an untouchable ship at rest. */
async function arena(seed: string): Promise<Harness & { step(): void }> {
    const h = await cabinet(seed);
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    for (let i = 0; i < 180; i++) h.tick();
    h.sim().area.hold = 1;
    clear(h);
    const step = () => {
        const s = h.sim();
        if (s.player) s.world.write(s.player, Ship, "invuln", 5);
        h.tick();
    };
    step();
    return { ...h, step };
}

const key = (e: Entity) => `${e.index}:${e.generation}`;

function clear(h: Harness): void {
    const sim = h.sim();
    for (const q of [sim.q.enemies, sim.q.bullets])
        q.eachChunk((chunk) => {
            for (let row = 0; row < chunk.count; row++) sim.world.despawn(chunk.entityAt(row));
        });
}

/** Ids of the live enemies of `kind`. */
function idsOf(h: Harness, kind: number): string[] {
    const ids: string[] = [];
    h.sim().q.enemies.eachChunk((chunk) => {
        for (let row = 0; row < chunk.count; row++) if (chunk.views.enemy.kind[row] === kind) ids.push(key(chunk.entityAt(row)));
    });
    return ids;
}

/** The ids not yet in `seen`, which are added to it. */
function unseen(seen: Set<string>, ids: readonly string[]): string[] {
    const fresh = ids.filter((id) => !seen.has(id));
    for (const id of fresh) seen.add(id);
    return fresh;
}

/** A hostile bullet's state after a tick. */
interface Round {
    id: string;
    kind: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    age: number;
    delay: number;
    split: number;
}

function bullets(h: Harness): Round[] {
    const list: Round[] = [];
    h.sim().q.bullets.eachChunk((chunk) => {
        const { pose, motion, bullet } = chunk.views;
        for (let row = 0; row < chunk.count; row++)
            list.push({
                id: key(chunk.entityAt(row)),
                kind: bullet.kind[row]!,
                x: pose.x[row]!,
                y: pose.y[row]!,
                vx: motion.vx[row]!,
                vy: motion.vy[row]!,
                age: bullet.age[row]!,
                delay: bullet.delay[row]!,
                split: bullet.split[row]!,
            });
    });
    return list;
}

test("gunship launches dart pairs only while it holds station, and killing it stops the stream", async () => {
    const h = await arena("T004-GUNSHIP");
    const hold = 5;
    spawnEnemy(h.sim().world, { kind: K.gunship, x: 144, y: -24, mover: M.hover, m0: 144, m1: 62, m2: hold, m3: -50 });
    const seen = new Set<string>();
    const launches: { t: number; count: number }[] = [];
    let t = 0;
    const watch = (seconds: number) => {
        for (let i = 0; i < seconds * 60; i++) {
            h.step();
            t += TICK;
            const fresh = unseen(seen, idsOf(h, K.dart));
            if (fresh.length) launches.push({ t, count: fresh.length });
        }
    };
    watch(hold + 2);
    assert.ok(launches.length >= 2, `launched ${launches.length} times while holding`);
    for (const l of launches) assert.equal(l.count, spec(K.gunship).gun!.count, `a pair at ${l.t.toFixed(2)}s`);
    assert.ok(launches.every((l) => l.t <= hold + 2 * TICK), `no launch after the hold ends: ${launches.map((l) => l.t.toFixed(2)).join(", ")}`);

    // A second gunship with a long hold, killed while on station.
    const second = spawnEnemy(h.sim().world, { kind: K.gunship, x: 144, y: -24, mover: M.hover, m0: 144, m1: 62, m2: 30, m3: -50 });
    launches.length = 0;
    watch(3);
    assert.ok(launches.length >= 1, "the second gunship launched before it was killed");
    killEnemy(h.sim(), second);
    launches.length = 0;
    watch(6);
    assert.equal(launches.length, 0, "no darts after the kill");
});

test("mortar shell lands where the ship was when it fired and bursts into a ring there", async () => {
    const h = await arena("T004-MORTAR");
    h.sim().area.scroll = 0;
    spawnEnemy(h.sim().world, { kind: K.mortar, x: 100, y: 40, mover: M.ground });
    let shell: Round | undefined;
    for (let i = 0; i < 4 * 60 && !shell; i++) {
        h.step();
        shell = bullets(h).find((b) => b.kind === B.shell);
    }
    assert.ok(shell, "the mortar fired");
    // The player system runs before the enemies in a tick, so the ship's cached position is the one the mortar aimed at.
    const aim = { x: h.sim().px, y: h.sim().py };
    assert.ok(shell.delay >= SHELL.minFlight - 1e-6 && shell.delay <= SHELL.maxFlight + 1e-6, `flight ${shell.delay.toFixed(2)}s`);
    assert.equal(shell.split, spec(K.mortar).gun!.count);
    const landing = { x: shell.x + shell.vx * (shell.delay - shell.age), y: shell.y + shell.vy * (shell.delay - shell.age) };
    assert.ok(Math.hypot(landing.x - aim.x, landing.y - aim.y) < 1, `aimed at (${aim.x.toFixed(1)}, ${aim.y.toFixed(1)}), lands at (${landing.x.toFixed(1)}, ${landing.y.toFixed(1)})`);

    // Move the ship away; the marker point (position + velocity × remaining flight) stays put for the whole flight.
    const ship = h.sim().player!;
    h.sim().world.write(ship, Pose, "x", aim.x + 80);
    const id = shell.id;
    let pellets: Round[] = [];
    for (let i = 0; i < 4 * 60; i++) {
        h.step();
        const live = bullets(h);
        const s = live.find((b) => b.id === id);
        if (s) {
            const mark = { x: s.x + s.vx * (s.delay - s.age), y: s.y + s.vy * (s.delay - s.age) };
            assert.ok(Math.hypot(mark.x - landing.x, mark.y - landing.y) < 0.01, "marker holds still in flight");
            continue;
        }
        pellets = live.filter((b) => b.kind === B.pink);
        break;
    }
    assert.equal(pellets.length, spec(K.mortar).gun!.count, "the shell burst into its ring");
    for (const p of pellets) assert.ok(Math.hypot(p.x - landing.x, p.y - landing.y) < 4, `pellet at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) near the landing point`);
});

test("HALO satellites absorb small bullets but not mortar shells", async () => {
    const h = await arena("T004-HALO");
    const sim = h.sim();
    sim.run.weapon = W.halo;
    for (let i = 0; i < 10; i++) h.step();
    const satellite = () => {
        let at: { x: number; y: number } | undefined;
        sim.q.halos.eachChunk((chunk) => (at ??= chunk.count > 0 ? { x: chunk.views.pose.x[0]!, y: chunk.views.pose.y[0]! } : undefined));
        return at;
    };
    assert.ok(satellite(), "HALO satellites exist");
    // Both bullets sit still; each tick they are moved onto the first satellite.
    const shell = key(spawnBullet(sim.world, 0, 0, 0, 0, B.shell, { delay: 60, split: 6, speed2: 75 }));
    const pellet = key(spawnBullet(sim.world, 0, 0, 0, 0, B.pink));
    let pelletGone = false;
    for (let i = 0; i < 30; i++) {
        const at = satellite()!;
        sim.q.bullets.eachChunk((chunk) => {
            for (let row = 0; row < chunk.count; row++) {
                chunk.views.pose.x[row] = at.x;
                chunk.views.pose.y[row] = at.y;
            }
        });
        h.step();
        const ids = bullets(h).map((b) => b.id);
        assert.ok(ids.includes(shell), `the mortar shell survives the satellite (tick ${i})`);
        pelletGone ||= !ids.includes(pellet);
    }
    assert.ok(pelletGone, "a small bullet on a satellite is absorbed");
});

test("interceptor enters from a side, fires exactly one volley at its turn, and leaves", async () => {
    const h = await arena("T004-INTERCEPTOR");
    for (const side of [1, -1] as const) {
        const event = new Script().interceptor(0, side, 1).build()[0]!;
        assert.equal(event.type, "enemy");
        const init = (event as { init: EnemyInit }).init;
        assert.ok(side > 0 ? init.x < 0 : init.x > FIELD_W, "spawns beyond a side edge");
        const craft = spawnEnemy(h.sim().world, init);
        const seen = new Set<string>();
        const volleys: { x: number; y: number; count: number }[] = [];
        let gone = false;
        let lastY = init.y;
        for (let i = 0; i < 5 * 60; i++) {
            h.step();
            if (!h.sim().world.has(craft)) {
                gone = true;
                break;
            }
            const x = h.sim().world.read(craft, Pose, "x")!;
            lastY = h.sim().world.read(craft, Pose, "y")!;
            const fresh = unseen(
                seen,
                bullets(h)
                    .filter((b) => b.kind === B.needle)
                    .map((b) => b.id),
            );
            if (fresh.length) volleys.push({ x, y: lastY, count: fresh.length });
        }
        assert.equal(volleys.length, 1, `side ${side}: one volley`);
        assert.equal(volleys[0]!.count, spec(K.interceptor).gun!.count);
        assert.ok(Math.abs(volleys[0]!.x - init.m1!) < init.m2! * TICK * 1.5, `side ${side}: fired at the turn (x ${volleys[0]!.x.toFixed(1)} vs ${init.m1})`);
        assert.ok(volleys[0]!.y > 6 && volleys[0]!.y < FIELD_H * 0.7, "inside the gun window");
        assert.ok(gone && lastY > FIELD_H, `side ${side}: left through the bottom`);
        clear(h);
    }
});
