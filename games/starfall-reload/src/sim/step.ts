import { Ship } from "../ecs/components.ts";
import { RANK } from "../config/tuning.ts";
import type { Sim } from "./context.ts";
import { collide, nearestTarget } from "./collide.ts";
import { updateDirector } from "./director.ts";
import { updateEnemies } from "./enemies.ts";
import { beginTick, integrate, updateWalls } from "./motion.ts";
import { updatePlayer } from "./player.ts";
import { adjustRank } from "./rules.ts";
import { updateBullets } from "./bullets.ts";
import { updateShots } from "./weapons.ts";

/**
 * One gameplay tick. Order: snapshot poses → script/bosses → player → enemies → integrate →
 * projectiles → barriers → collisions → session timers.
 */
export function stepPlay(sim: Sim, dt: number, controllable: boolean, runScript = true): void {
    sim.time += dt;
    beginTick(sim);
    if (runScript) updateDirector(sim, dt);
    updatePlayer(sim, dt, controllable);
    updateEnemies(sim, dt);
    integrate(sim, dt);
    const shipVx = sim.player ? (sim.world.read(sim.player, Ship, "vx") ?? 0) : 0;
    updateShots(sim, dt, nearestTarget, shipVx);
    updateBullets(sim, dt);
    updateWalls(sim, dt);
    collide(sim, dt);

    const run = sim.run;
    if (run.chainT > 0) {
        run.chainT -= dt;
        if (run.chainT <= 0) run.chain = 0;
    }
    if (sim.playerAlive) adjustRank(run, dt * (RANK.perSecond + Math.max(0, run.power - 2) * RANK.perPowerOver2 * 0.01));
}
