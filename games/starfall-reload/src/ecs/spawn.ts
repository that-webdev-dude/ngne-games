import type { Entity, WorldAccess } from "@ngne/core";
import { BULLET_RADIUS, spec } from "../config/enemies.ts";
import { Bullet, Enemy, Fx, Item, Motion, Pose, Shot } from "./components.ts";

const pose = (x: number, y: number) => Pose.of({ x, y, px: x, py: y });

export interface EnemyInit {
    kind: number;
    x: number;
    y: number;
    mover: number;
    m0?: number;
    m1?: number;
    m2?: number;
    m3?: number;
    vx?: number;
    vy?: number;
    hpScale?: number;
    drop?: number;
    gun?: number;
    flags?: number;
    part?: number;
    ox?: number;
    oy?: number;
    frame?: number;
}

export function spawnEnemy(world: WorldAccess, init: EnemyInit): Entity {
    const s = spec(init.kind);
    const hp = s.hp * (init.hpScale ?? 1);
    return world.spawn(
        pose(init.x, init.y),
        Motion.of({ vx: init.vx ?? 0, vy: init.vy ?? 0 }),
        Enemy.of({
            kind: init.kind,
            hp,
            maxHp: hp,
            radius: s.radius,
            mover: init.mover,
            m0: init.m0 ?? 0,
            m1: init.m1 ?? 0,
            m2: init.m2 ?? 0,
            m3: init.m3 ?? 0,
            gun: init.gun ?? s.gun?.gun ?? 0,
            fireT: s.gun?.first ?? 0,
            flags: s.flags | (init.flags ?? 0),
            drop: init.drop ?? s.drop,
            part: init.part ?? 0,
            ox: init.ox ?? 0,
            oy: init.oy ?? 0,
            frame: init.frame ?? 0,
        }),
    );
}

export function spawnBullet(
    world: WorldAccess,
    x: number,
    y: number,
    angle: number,
    speed: number,
    kind: number,
    extra?: { delay?: number; speed2?: number; turn?: number; ax?: number; ay?: number; split?: number },
): Entity {
    // angle: radians, 0 = down (towards the player), positive = counter-clockwise on screen.
    const vx = Math.sin(angle) * speed;
    const vy = Math.cos(angle) * speed;
    return world.spawn(
        pose(x, y),
        Motion.of({ vx, vy, ax: extra?.ax ?? 0, ay: extra?.ay ?? 0 }),
        Bullet.of({
            kind,
            radius: BULLET_RADIUS[kind] ?? 2.5,
            delay: extra?.delay ?? 0,
            speed2: extra?.speed2 ?? 0,
            turn: extra?.turn ?? 0,
            split: extra?.split ?? 0,
        }),
    );
}

export interface ShotInit {
    x: number;
    y: number;
    vx: number;
    vy: number;
    weapon: number;
    style?: number;
    damage: number;
    radius?: number;
    pierce?: boolean;
    life?: number;
    homing?: number;
    burst?: number;
    steer?: number;
}

export function spawnShot(world: WorldAccess, s: ShotInit): Entity {
    return world.spawn(
        pose(s.x, s.y),
        Motion.of({ vx: s.vx, vy: s.vy }),
        Shot.of({
            weapon: s.weapon,
            style: s.style ?? 0,
            damage: s.damage,
            radius: s.radius ?? 3,
            pierce: s.pierce ? 1 : 0,
            life: s.life ?? 0.9,
            homing: s.homing ?? 0,
            burst: s.burst ?? 0,
            steer: s.steer ?? 0,
        }),
    );
}

export const ITEM = { chip: 0, capsule: 1, bomb: 2, oneup: 3 } as const;

export function spawnItem(world: WorldAccess, kind: number, x: number, y: number, vx: number, vy: number, letter = 0, magnet = false): Entity {
    return world.spawn(pose(x, y), Motion.of({ vx, vy, drag: kind === ITEM.chip ? 2.5 : 0 }), Item.of({ kind, letter, magnet: magnet ? 1 : 0 }));
}

export interface FxInit {
    kind: number;
    x: number;
    y: number;
    vx?: number;
    vy?: number;
    ax?: number;
    ay?: number;
    drag?: number;
    life: number;
    size: number;
    size2?: number;
    color?: number;
    rot?: number;
    spin?: number;
    layer?: number;
    frame?: number;
}

export function spawnFx(world: WorldAccess, f: FxInit): Entity {
    return world.spawn(
        pose(f.x, f.y),
        Fx.of({
            kind: f.kind,
            vx: f.vx ?? 0,
            vy: f.vy ?? 0,
            ax: f.ax ?? 0,
            ay: f.ay ?? 0,
            drag: f.drag ?? 0,
            life: f.life,
            size: f.size,
            size2: f.size2 ?? f.size,
            color: f.color ?? 0xffffff,
            rot: f.rot ?? 0,
            spin: f.spin ?? 0,
            layer: f.layer ?? 0,
            frame: f.frame ?? 0,
        }),
    );
}
