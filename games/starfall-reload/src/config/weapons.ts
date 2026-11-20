/** The four weapon families. Behaviour lives in sim/weapons.ts; this file owns names and numbers. */
export const W = { vulcan: 0, lance: 1, halo: 2, scatter: 3 } as const;
export type WeaponId = (typeof W)[keyof typeof W];

export interface WeaponSpec {
    readonly name: string;
    readonly letter: string;
    readonly modes: readonly [string, string];
    readonly color: number;
    readonly blurb: string;
}

export const WEAPONS: readonly WeaponSpec[] = [
    {
        name: "VULCAN",
        letter: "V",
        modes: ["SPREAD", "WING"],
        color: 0xffc94a,
        blurb: "WIDE FAN / SIDE AND REAR GUARD",
    },
    {
        name: "LANCE",
        letter: "L",
        modes: ["PIERCE", "SEEK"],
        color: 0x46c8ee,
        blurb: "PIERCING RAIL / TRACKING RAYS",
    },
    {
        name: "HALO",
        letter: "H",
        modes: ["ORBIT", "HOLD"],
        color: 0x9bf27a,
        blurb: "SHIELD DRONES / FREEZE FORMATION",
    },
    {
        name: "SCATTER",
        letter: "S",
        modes: ["BURST", "STEER"],
        color: 0xff7a5c,
        blurb: "SHRAPNEL SHELLS / STEERED SHELLS",
    },
];

/** Per power level 0..4. */
export const VULCAN = {
    interval: 1 / 15,
    speed: 520,
    damage: 1.15,
    /** Spread mode: half-angle (deg) and stream count per level. */
    spread: [
        { count: 2, half: 0 },
        { count: 3, half: 6 },
        { count: 5, half: 10 },
        { count: 6, half: 14 },
        { count: 7, half: 18 },
    ],
    /** Wing mode: fixed angles (deg, 0 = up, positive = clockwise). */
    wing: [
        [0, 0, 90, -90],
        [0, 0, 80, -80, 180],
        [0, 0, 75, -75, 160, -160],
        [0, 0, 4, -4, 70, -70, 155, -155],
        [0, 0, 5, -5, 60, -60, 90, -90, 150, -150],
    ],
};

export const LANCE = {
    interval: 1 / 20,
    speed: 760,
    damage: [1.0, 1.1, 1.15, 1.22, 1.32],
    lanes: [1, 1, 2, 2, 2],
    seekInterval: 1 / 11,
    seekCount: [2, 2, 3, 4, 4],
    seekDamage: 1.25,
    seekSpeed: 420,
    seekTurn: 9,
};

export const HALO = {
    count: [2, 3, 4, 5, 6],
    radius: 26,
    spin: 4.2,
    fireInterval: 1 / 7,
    shotDamage: 0.75,
    contactDps: 9,
    mainInterval: 1 / 12,
    mainDamage: 1,
    /** Hold mode: satellites lock into this forward arc (deg from up) and fire forward. */
    holdArc: 150,
};

export const SCATTER = {
    interval: 1 / 6,
    speed: 330,
    fuse: 0.32,
    shellDamage: 3.6,
    fragments: [5, 6, 8, 9, 11],
    fragmentDamage: 0.9,
    fragmentSpeed: 300,
    shellsPerVolley: [1, 1, 2, 2, 3],
    steer: 1.6,
    steerFuse: 0.5,
};
