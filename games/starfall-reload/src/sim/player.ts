import { Pose, Ship } from "../ecs/components.ts";
import { PLAYER } from "../config/tuning.ts";
import { FIELD_H, FIELD_W } from "../config/view.ts";
import { WEAPONS } from "../config/weapons.ts";
import { banner, cue, type Sim } from "./context.ts";
import { ring } from "./effects.ts";
import { startBomb } from "./rules.ts";
import { fireWeapon, updateHalos } from "./weapons.ts";

export function spawnPlayer(sim: Sim): void {
    const x = PLAYER.spawnX,
        y = PLAYER.enterFromY;
    sim.player = sim.world.spawn(
        Pose.of({ x, y, px: x, py: y }),
        Ship.of({ invuln: PLAYER.invulnSpawn + PLAYER.enterTime, entering: PLAYER.enterTime }),
    );
    sim.px = x;
    sim.py = y;
    sim.playerAlive = true;
}

/**
 * Crisp, authored movement: position is written directly from input (no acceleration),
 * which the contract chose for precise dodging. Fire, Shot Control and bomb act on the
 * press tick.
 */
export function updatePlayer(sim: Sim, dt: number, controllable: boolean): void {
    const ship = sim.player;
    if (!ship) return;
    const { world, input, run } = sim;
    let x = world.read(ship, Pose, "x");
    let y = world.read(ship, Pose, "y");
    if (x === undefined || y === undefined) return;
    let alive = world.read(ship, Ship, "alive") === 1;
    let invuln = Math.max(0, (world.read(ship, Ship, "invuln") ?? 0) - dt);
    let entering = world.read(ship, Ship, "entering") ?? 0;
    let vx = 0;

    if (!alive) {
        const respawn = (world.read(ship, Ship, "respawn") ?? 0) - dt;
        world.write(ship, Ship, "respawn", respawn);
        if (respawn <= 0 && run.lives > 0) {
            alive = true;
            x = PLAYER.spawnX;
            y = PLAYER.enterFromY;
            world.write(ship, Pose, "px", x);
            world.write(ship, Pose, "py", y);
            entering = PLAYER.enterTime;
            invuln = PLAYER.invulnSpawn + PLAYER.enterTime;
            run.bombs = Math.max(run.bombs, PLAYER.bombs);
            world.write(ship, Ship, "alive", 1);
        }
    } else if (entering > 0) {
        entering = Math.max(0, entering - dt);
        const t = 1 - entering / PLAYER.enterTime;
        const ease = 1 - (1 - t) * (1 - t);
        y = PLAYER.enterFromY + (PLAYER.spawnY - PLAYER.enterFromY) * ease;
        if (entering === 0) ring(sim, x, y, 4, 26, 0.25, 0x46c8ee);
    } else if (controllable) {
        const speed = input.focus ? PLAYER.focusSpeed : PLAYER.speed;
        vx = input.mx * speed;
        x += vx * dt;
        y += input.my * speed * dt;
        x = Math.max(PLAYER.marginX, Math.min(FIELD_W - PLAYER.marginX, x));
        y = Math.max(PLAYER.marginTop, Math.min(FIELD_H - PLAYER.marginBottom, y));
    }

    // Bank toward horizontal input; settles quickly for a snappy read.
    let bank = world.read(ship, Ship, "bank") ?? 0;
    const target = alive && controllable ? input.mx : 0;
    bank += (target - bank) * Math.min(1, dt * PLAYER.bankRate);
    world.write(ship, Ship, "bank", bank);

    world.write(ship, Pose, "x", x);
    world.write(ship, Pose, "y", y);
    world.write(ship, Ship, "invuln", invuln);
    world.write(ship, Ship, "entering", entering);
    world.write(ship, Ship, "vx", vx);
    sim.px = x;
    sim.py = y;
    sim.playerAlive = alive && entering === 0;
    sim.playerInvuln = invuln > 0;

    const canAct = alive && entering === 0 && controllable;
    if (canAct && input.shiftPressed) {
        run.mode = 1 - run.mode;
        cue(sim, "modeSwitch");
        const w = WEAPONS[run.weapon]!;
        banner(sim, w.modes[run.mode]!, w.name, "info", 0.8);
        ring(sim, x, y, 8, 22, 0.15, w.color);
    }
    if (canAct && input.bombPressed) startBomb(sim, ship);

    let fireT = (world.read(ship, Ship, "fireT") ?? 0) - dt;
    const firing = canAct && input.fire;
    if (firing && fireT <= 0) {
        fireT += fireWeapon(sim, x, y, vx);
        if (fireT < 0) fireT = 0;
    } else if (!firing) fireT = Math.max(fireT, 0);
    world.write(ship, Ship, "fireT", fireT);

    updateHalos(sim, dt, x, y, alive, firing);
}
