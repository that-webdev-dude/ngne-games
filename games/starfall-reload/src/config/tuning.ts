import { HUD } from "./view.ts";

/** Gameplay tuning. All values are provisional slice values (contract P1). Units: px, seconds. */

/** Half the player sprite's height (24×28 sheet): keeps its edges out of the HUD rows. */
const SHIP_HALF_H = 14;

export const PLAYER = {
    speed: 170,
    focusSpeed: 85,
    hitRadius: 2.5,
    grazeRadius: 15,
    /** Body keeps this far inside the playfield edges. */
    marginX: 10,
    marginTop: HUD.top + SHIP_HALF_H,
    marginBottom: HUD.bottom + SHIP_HALF_H,
    spawnX: 144,
    spawnY: 312,
    enterFromY: 400,
    enterTime: 0.75,
    invulnSpawn: 2.6,
    invulnHit: 1.8,
    respawnDelay: 1.2,
    lives: 3,
    bombs: 2,
    maxBombs: 5,
    maxPower: 4,
    deadZone: 0.18,
    fullTilt: 0.9,
    bankRate: 9,
} as const;

export const POWER = {
    /** Chips needed to go from level N to N+1. */
    chipsPerLevel: [3, 5, 8, 12] as readonly number[],
    hitLoss: 2,
    armorPulseRadius: 70,
    deathChips: 4,
} as const;

export const BOMB = {
    duration: 1.1,
    damagePerSecond: 70,
    bossDamagePerSecond: 22,
    invuln: 2.2,
    ringSpeed: 1700,
    hitstopTicks: 3,
} as const;

export const GRAZE = { perBomb: 45, score: 20, overflowScore: 5000 } as const;
export const CHAIN = { window: 1.25, perStep: 8, maxMult: 8 } as const;
export const EXTENDS = [60_000, 200_000, 500_000] as const;

export const RANK = {
    max: 7,
    start: [0.5, 2.5, 3.5] as readonly number[],
    perSecond: 0.007,
    perPowerOver2: 0.25,
    deathLoss: 1.6,
    bombLoss: 0.25,
    bulletSpeedPer: 0.04,
    fireRatePer: 0.05,
    /** Rank at or above which popcorn releases a revenge bullet. */
    revengeAt: 4.5,
} as const;

export const CREDITS = 3;

export const SCORE = {
    bossTimeBonusPerSecond: 1000,
    clearBonusPerLife: 10_000,
    clearBonusPerBomb: 3_000,
    noMissBonus: 50_000,
    capsuleOverflow: 2_000,
    chip: 100,
} as const;

/** Feedback timing (ticks at 60 Hz) and amplitudes. Presentation only. */
export const FEEL = {
    hitFlashTicks: 2,
    killHitstopLarge: 3,
    bossBreakTicks: 22,
    shakeSmall: 1.5,
    shakeLarge: 4,
    shakeBoss: 7,
    shakeDecay: 10,
} as const;
