import { component, entityRef, f32, f64, u8, u32 } from "@ngne/core";

/** World-space position (playfield coordinates) with the previous tick's pose for interpolation. */
export const Pose = component("pose", { x: f64(), y: f64(), px: f64(), py: f64() });

/** Linear motion integrated by the motion system. */
export const Motion = component("motion", { vx: f64(), vy: f64(), ax: f64(), ay: f64(), drag: f32() });

/** The player's ship. Session-level data (power, weapon, lives) lives in the Run resource. */
export const Ship = component("ship", {
    invuln: f64(),
    fireT: f64(),
    altT: f64(),
    respawn: f64(),
    alive: u8(1),
    entering: f64(),
    vx: f32(),
});

/** Hostile actor: craft, ground unit, prop or boss part. `kind` indexes config/enemies.ts. */
export const Enemy = component("enemy", {
    kind: u8(),
    hp: f64(),
    maxHp: f64(),
    age: f64(),
    radius: f32(8),
    /** Movement script id and its parameters (config/enemies.ts Mover). */
    mover: u8(),
    m0: f64(),
    m1: f64(),
    m2: f64(),
    m3: f64(),
    /** Gun script id, its cooldown and shot counter. */
    gun: u8(),
    fireT: f64(),
    fireN: u32(),
    flash: f32(),
    /** Bit flags, see EF. */
    flags: u8(),
    drop: u8(),
    frame: u8(),
    rot: f32(),
    /** Boss part role (0 = not a part). */
    part: u8(),
    ox: f32(),
    oy: f32(),
});
export const EF = {
    ground: 1,
    invulnerable: 2,
    noBodyHit: 4,
    blocksShots: 8,
    entered: 16,
    boss: 32,
} as const;

/** Hostile projectile. `kind` indexes BULLET_LOOKS. */
export const Bullet = component("bullet", {
    kind: u8(),
    radius: f32(2.5),
    age: f64(),
    grazed: u8(),
    /** Delayed aim: after `delay` seconds the bullet re-aims at the player with speed `speed2`. */
    delay: f32(),
    speed2: f32(),
    turn: f32(),
    /** When > 0, the bullet bursts into this many pellets once `delay` elapses. */
    split: u8(),
});

/** Player projectile. */
export const Shot = component("shot", {
    weapon: u8(),
    style: u8(),
    damage: f32(1),
    radius: f32(3),
    pierce: u8(),
    age: f64(),
    life: f32(1.2),
    homing: f32(),
    burst: f32(),
    steer: f32(),
    /** Last enemy index + 1 a piercing shot damaged (one hit per enemy). */
    hit: u32(),
});

/** Collectable. */
export const Item = component("item", { kind: u8(), letter: u8(), age: f64(), magnet: u8() });

/** Halo satellite orbiting the player. */
export const Halo = component("halo", { index: u8(), angle: f64(), fireT: f64(), heldAngle: f64() });

/**
 * Energy barrier between two pylons. A fence (`on` > 0) cycles off/on instead of warming once:
 * `on` and `off` are its phase lengths in seconds, `cycle` its clock (see sim/motion.ts fencePhase).
 */
export const Wall = component("wall", { left: entityRef(), right: entityRef(), warm: f32(), age: f64(), on: f32(), off: f32(), cycle: f64() });

/** Visual-only particle. Simulated but never read by gameplay. */
export const Fx = component("fx", {
    kind: u8(),
    vx: f32(),
    vy: f32(),
    ax: f32(),
    ay: f32(),
    drag: f32(),
    age: f32(),
    life: f32(1),
    size: f32(4),
    size2: f32(),
    color: u32(0xffffff),
    rot: f32(),
    spin: f32(),
    layer: u8(),
    frame: u8(),
});
