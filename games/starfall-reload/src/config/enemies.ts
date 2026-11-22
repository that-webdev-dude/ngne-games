import { EF } from "../ecs/components.ts";

/** Enemy kinds. Values are stored in Enemy.kind (u8). */
export const K = {
    dart: 0,
    hornet: 1,
    skiff: 2,
    turret: 3,
    crawler: 4,
    pylon: 5,
    rockL: 6,
    rockS: 7,
    sentry: 8,
    lancer: 9,
    bastion: 10,
    lantern: 11,
    halberd: 12,
    halberdPod: 13,
    cantor: 14,
    cantorTurret: 15,
    seraph: 16,
    seraphCore: 17,
    seraphWing: 18,
} as const;
export type Kind = (typeof K)[keyof typeof K];

/** Movement scripts (Enemy.mover). Parameters m0..m3 are documented per mover. */
export const M = {
    /** m0 vx, m1 vy. */
    straight: 0,
    /** m0 base x, m1 amplitude, m2 angular freq, m3 vy. */
    sine: 1,
    /** Enter to y=m1 at speed m3, pause m2 s, then dive at the player's x with acceleration. m0 unused. */
    dive: 2,
    /** Enter to (m0, m1), hold m2 s, then leave down (m3 > 0) or up (m3 < 0) at |m3| px/s. */
    hover: 3,
    /** Locked to the ground: scrolls at the area scroll speed. m0 extra vx. */
    ground: 4,
    /** m0 vx, m1 vy, m2 spin rad/s. */
    drift: 5,
    /** Arc entry: m0 side (+1 from left, -1 from right), m1 radius, m2 angular speed, m3 centre y. */
    arc: 6,
    /** Controlled by a boss controller. */
    scripted: 7,
    /**
     * Circle around a centre (ox, oy) that moves down at m3 px/s. m0 start angle (0 = top of the
     * circle), m1 radius, m2 angular speed in rad/s (positive = clockwise on screen).
     */
    orbit: 8,
} as const;

/** Gun scripts (Enemy.gun). */
export const G = {
    none: 0,
    aimed: 1,
    fan: 2,
    ring: 3,
    burst: 4,
    spiral: 5,
} as const;

/** Bullet visual/size kinds (Bullet.kind). */
export const B = {
    pink: 0,
    orange: 1,
    violet: 2,
    needle: 3,
    big: 4,
    gold: 5,
} as const;
export const BULLET_RADIUS: readonly number[] = [2.5, 2.5, 3.5, 2, 5.5, 3];

export const DROP = { none: 0, chip: 1, chips2: 2, capsule: 3, bomb: 4, oneup: 5, chips4: 6 } as const;

export interface GunSpec {
    readonly gun: number;
    /** Seconds between volleys at rank 0. */
    readonly every: number;
    /** Delay after entering before the first volley. */
    readonly first: number;
    readonly speed: number;
    readonly count: number;
    /** Total spread (deg) for fans, or spiral step (deg) for spirals. */
    readonly spread: number;
    readonly bullet: number;
}

export interface EnemySpec {
    readonly name: string;
    readonly sprite: string;
    readonly frames: number;
    readonly frameTime: number;
    readonly hp: number;
    readonly radius: number;
    readonly score: number;
    readonly flags: number;
    readonly size: "s" | "m" | "l" | "boss";
    readonly drop: number;
    readonly gun?: GunSpec;
}

const gun = (g: Partial<GunSpec> & { gun: number }): GunSpec => ({
    every: 1.5,
    first: 0.6,
    speed: 120,
    count: 1,
    spread: 0,
    bullet: B.pink,
    ...g,
});

export const ENEMIES: readonly EnemySpec[] = [
    { name: "DART", sprite: "dart", frames: 2, frameTime: 0.1, hp: 2, radius: 7, score: 100, flags: 0, size: "s", drop: DROP.none },
    {
        name: "HORNET",
        sprite: "hornet",
        frames: 2,
        frameTime: 0.12,
        hp: 9,
        radius: 8,
        score: 300,
        flags: 0,
        size: "s",
        drop: DROP.chip,
        gun: gun({ gun: G.aimed, every: 1.6, first: 0.45, speed: 135, bullet: B.pink }),
    },
    {
        name: "SKIFF",
        sprite: "skiff",
        frames: 2,
        frameTime: 0.15,
        hp: 34,
        radius: 12,
        score: 800,
        flags: 0,
        size: "m",
        drop: DROP.capsule,
        gun: gun({ gun: G.fan, every: 2.2, first: 0.9, speed: 105, count: 3, spread: 40, bullet: B.orange }),
    },
    {
        name: "TURRET",
        sprite: "turret-base",
        frames: 1,
        frameTime: 1,
        hp: 18,
        radius: 9,
        score: 500,
        flags: EF.ground,
        size: "s",
        drop: DROP.chip,
        gun: gun({ gun: G.burst, every: 1.7, first: 0.7, speed: 150, count: 4, bullet: B.needle }),
    },
    {
        name: "CRAWLER",
        sprite: "crawler",
        frames: 2,
        frameTime: 0.12,
        hp: 26,
        radius: 10,
        score: 600,
        flags: EF.ground,
        size: "m",
        drop: DROP.chips2,
        gun: gun({ gun: G.fan, every: 2.4, first: 0.8, speed: 115, count: 5, spread: 60, bullet: B.orange }),
    },
    {
        name: "PYLON",
        sprite: "pylon",
        frames: 2,
        frameTime: 0.25,
        hp: 20,
        radius: 7,
        score: 400,
        flags: EF.ground,
        size: "s",
        drop: DROP.chip,
    },
    {
        name: "DEBRIS",
        sprite: "rock-large",
        frames: 2,
        frameTime: 0,
        hp: 26,
        radius: 13,
        score: 300,
        flags: EF.blocksShots,
        size: "m",
        drop: DROP.chip,
    },
    {
        name: "SHARD",
        sprite: "rock-small",
        frames: 2,
        frameTime: 0,
        hp: 5,
        radius: 6,
        score: 80,
        flags: EF.blocksShots,
        size: "s",
        drop: DROP.none,
    },
    {
        name: "SENTRY",
        sprite: "sentry",
        frames: 2,
        frameTime: 0.2,
        hp: 7,
        radius: 7,
        score: 200,
        flags: 0,
        size: "s",
        drop: DROP.none,
        gun: gun({ gun: G.ring, every: 2.6, first: 1.0, speed: 85, count: 8, bullet: B.violet }),
    },
    {
        name: "LANCER",
        sprite: "lancer",
        frames: 1,
        frameTime: 1,
        hp: 420,
        radius: 22,
        score: 10_000,
        flags: 0,
        size: "boss",
        drop: DROP.bomb,
    },
    {
        name: "BASTION",
        sprite: "bastion",
        frames: 1,
        frameTime: 1,
        hp: 560,
        radius: 24,
        score: 15_000,
        flags: 0,
        size: "boss",
        drop: DROP.bomb,
    },
    {
        name: "LANTERN",
        sprite: "lantern",
        frames: 1,
        frameTime: 1,
        hp: 680,
        radius: 24,
        score: 20_000,
        flags: 0,
        size: "boss",
        drop: DROP.oneup,
    },
    { name: "HALBERD", sprite: "halberd", frames: 1, frameTime: 1, hp: 950, radius: 20, score: 40_000, flags: EF.boss, size: "boss", drop: DROP.none },
    { name: "HALBERD POD", sprite: "halberd-pod", frames: 2, frameTime: 0, hp: 190, radius: 13, score: 5_000, flags: EF.boss, size: "m", drop: DROP.chips2 },
    { name: "CANTOR", sprite: "cantor", frames: 1, frameTime: 1, hp: 1150, radius: 18, score: 60_000, flags: EF.boss | EF.ground, size: "boss", drop: DROP.none },
    { name: "CANTOR TURRET", sprite: "cantor-turret", frames: 2, frameTime: 0, hp: 150, radius: 11, score: 4_000, flags: EF.boss | EF.ground, size: "m", drop: DROP.chip },
    { name: "SERAPH", sprite: "seraph", frames: 1, frameTime: 1, hp: 1, radius: 1, score: 0, flags: EF.boss | EF.invulnerable | EF.noBodyHit, size: "boss", drop: DROP.none },
    { name: "SERAPH CORE", sprite: "seraph-core", frames: 2, frameTime: 0, hp: 1800, radius: 16, score: 120_000, flags: EF.boss, size: "boss", drop: DROP.none },
    { name: "SERAPH BLADE", sprite: "seraph-wing", frames: 1, frameTime: 1, hp: 290, radius: 16, score: 8_000, flags: EF.boss, size: "l", drop: DROP.chips2 },
];

export const spec = (kind: number): EnemySpec => ENEMIES[kind]!;
