import { Game, type InputSnapshot } from "@ngne/core";
import { cabinetScene, type CabinetState, type CabinetView } from "../../src/scenes/cabinet.ts";
import { Enemy, Pose, Ship } from "../../src/ecs/components.ts";
import type { Sim } from "../../src/sim/context.ts";
import type { Flow } from "../../src/game/flow.ts";

export function input(held: string[] = [], pressed: string[] = [], axes: number[] = [0, 0, 0, 0]): InputSnapshot {
    return {
        held,
        pressed,
        released: [],
        pointer: { x: 0, y: 0, active: false, dx: 0, dy: 0, completed: [] },
        wheel: 0,
        axes,
    };
}

export interface Harness {
    game: Game<CabinetState, never>;
    view: CabinetView;
    sim(): Sim;
    flow(): Flow;
    tick(i?: InputSnapshot): void;
}

/** Headless cabinet: the production scene without GPU assets, render or audio. */
export async function cabinet(seed = "TEST"): Promise<Harness> {
    const view: CabinetView = { flow: null, sim: null };
    const game = new Game<CabinetState, never>({ seed, state: {}, transition: (s) => s });
    const settings = { muted: true, crt: false, calm: false };
    await game.start(await game.prepare(cabinetScene({ settings, sound: null, view, headless: true }), { key: "cabinet" }));
    return {
        game,
        view,
        sim: () => view.sim!,
        flow: () => view.flow!,
        tick: (i = input()) => game.tick(i, { width: 640, height: 360, pixelRatio: 1 }),
    };
}

/**
 * Reachability bot: holds fire, tracks the boss (or the nearest enemy) horizontally and keeps
 * near the bottom. `immortal` re-arms invulnerability every tick; it demonstrates that content
 * is completable, not that it is easy.
 */
export function botInput(h: Harness, immortal: boolean): InputSnapshot {
    const sim = h.sim();
    const world = sim.world;
    if (immortal && sim.player && world.has(sim.player)) world.write(sim.player, Ship, "invuln", 5);
    let tx = 144;
    if (sim.boss && world.has(sim.boss.root)) {
        const parts = sim.boss.parts.filter((p) => world.has(p.entity) && (world.read(p.entity, Enemy, "hp") ?? 0) > 0 && !((world.read(p.entity, Enemy, "flags") ?? 0) & 2));
        const target = parts[0]?.entity ?? sim.boss.root;
        tx = world.read(target, Pose, "x") ?? 144;
    } else {
        let best = Infinity;
        sim.q.enemies.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            for (let row = 0; row < chunk.count; row++) {
                const d = Math.abs(pose.y[row]! - 120);
                if (pose.y[row]! > 0 && pose.y[row]! < 280 && d < best) {
                    best = d;
                    tx = pose.x[row]!;
                }
            }
        });
    }
    const held = ["KeyZ"];
    if (sim.px < tx - 4) held.push("ArrowRight");
    if (sim.px > tx + 4) held.push("ArrowLeft");
    if (sim.py < 290) held.push("ArrowDown");
    if (sim.py > 300) held.push("ArrowUp");
    return input(held);
}
