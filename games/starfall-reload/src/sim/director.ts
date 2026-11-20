import { Pose, Wall } from "../ecs/components.ts";
import { spawnEnemy } from "../ecs/spawn.ts";
import { AREAS } from "../config/areas.ts";
import { DROP, K, M } from "../config/enemies.ts";
import type { ScriptEvent } from "../config/script.ts";
import { FIELD_W } from "../config/view.ts";
import { banner, cue, type Sim } from "./context.ts";
import { runBoss, type BossController } from "./bosses/common.ts";
import { halberd } from "./bosses/halberd.ts";
import { cantor } from "./bosses/cantor.ts";
import { seraph } from "./bosses/seraph.ts";
import { bastion, lancer, lantern } from "./bosses/midbosses.ts";

export const CONTROLLERS: Record<string, BossController> = { halberd, cantor, seraph, lancer, bastion, lantern };

const WARNING_TIME = 3.2;

/**
 * Executes the current area's script against the area clock. A live mid-boss holds the clock;
 * the boss event raises a WARNING, then hands over to the boss controller. When the area boss
 * is finished (destroyed or escaped) the area is done.
 */
export function updateDirector(sim: Sim, dt: number): void {
    const area = sim.area;
    const def = AREAS[area.index]!;
    area.totalTime += dt;
    area.distance += area.scroll * dt;

    if (sim.boss && sim.bossCtl) {
        const running = runBoss(sim, sim.bossCtl, sim.boss, dt);
        if (!running) {
            const wasMidboss = sim.boss.midboss;
            sim.boss = null;
            sim.bossCtl = null;
            if (wasMidboss) area.hold = 0;
            else {
                area.done = true;
                sim.feedback.music = "clear";
            }
        }
    }
    if (area.warning > 0) {
        area.warning -= dt;
        if (area.warning <= 0 && area.pending) startBoss(sim, area.pending);
    }
    if (area.hold > 0 || area.bossStarted) return;

    area.t += dt;
    const events = def.events;
    while (area.step < events.length && events[area.step]!.at <= area.t) {
        execute(sim, events[area.step]!);
        area.step++;
    }
}

function execute(sim: Sim, e: ScriptEvent): void {
    switch (e.type) {
        case "enemy":
            spawnEnemy(sim.world, e.init);
            return;
        case "barrier":
            spawnBarrier(sim, e.y, e.gapX, e.gapW);
            return;
        case "banner":
            banner(sim, e.text, e.sub, "warning", 2.4);
            cue(sim, "warning");
            return;
        case "midboss":
            sim.area.hold = 1;
            startBoss(sim, e.id);
            return;
        case "boss":
            sim.area.bossStarted = true;
            sim.area.pending = e.id;
            sim.area.warning = WARNING_TIME;
            sim.feedback.music = "stop";
            banner(sim, "WARNING", AREAS[sim.area.index]!.target, "warning", WARNING_TIME);
            cue(sim, "warning");
            return;
    }
}

function startBoss(sim: Sim, id: string): void {
    const ctl = CONTROLLERS[id]!;
    sim.bossCtl = ctl;
    sim.boss = ctl.spawn(sim);
    sim.area.pending = null;
    if (ctl.music) sim.feedback.music = ctl.music;
}

function spawnBarrier(sim: Sim, y: number, gapX: number, gapW: number): void {
    const left = gapX - gapW / 2,
        right = gapX + gapW / 2;
    const pylon = (x: number) => spawnEnemy(sim.world, { kind: K.pylon, x, y, mover: M.ground, drop: DROP.chip });
    const wall = (a: number, b: number) => {
        if (b - a < 24) return;
        const l = pylon(a),
            r = pylon(b);
        sim.world.spawn(Pose.of({ x: (a + b) / 2, y, px: (a + b) / 2, py: y }), Wall.of({ left: l, right: r }));
    };
    wall(8, left);
    wall(right, FIELD_W - 8);
    cue(sim, "barrier");
}

/** Development aid: jump the area clock to `t` without replaying earlier events. */
export function skipTo(sim: Sim, t: number): void {
    const events = AREAS[sim.area.index]!.events;
    sim.area.t = t;
    sim.area.step = events.findIndex((e) => e.at >= t);
    if (sim.area.step < 0) sim.area.step = events.length;
}
