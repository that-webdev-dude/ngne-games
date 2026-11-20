import type { Entity, Random, SchemaQuery, WorldAccess } from "@ngne/core";
import { Bullet, Enemy, Fx, Halo, Item, Motion, Pose, Ship, Shot, Wall } from "../ecs/components.ts";
import type { SfxId } from "../audio/synth.ts";
import { CREDITS, PLAYER, RANK } from "../config/tuning.ts";
import type { Actions } from "./actions.ts";
import type { BossController } from "./bosses/common.ts";
import type { MusicId } from "../audio/synth.ts";

/** Session data for one credit-run. Plain data so it can be inspected and tested. */
export interface Run {
    score: number;
    lives: number;
    bombs: number;
    power: number;
    chips: number;
    weapon: number;
    mode: number;
    grazeMeter: number;
    grazeTotal: number;
    chain: number;
    chainT: number;
    maxChain: number;
    rank: number;
    credits: number;
    area: number;
    extendIndex: number;
    missesThisArea: number;
    bombsUsed: number;
    kills: number;
    /** Bomb in progress: remaining seconds and ring radius. */
    bombT: number;
    bombR: number;
    bombX: number;
    bombY: number;
    cleared: boolean;
}

export function newRun(area = 0): Run {
    return {
        score: 0,
        lives: PLAYER.lives,
        bombs: PLAYER.bombs,
        power: 0,
        chips: 0,
        weapon: 0,
        mode: 0,
        grazeMeter: 0,
        grazeTotal: 0,
        chain: 0,
        chainT: 0,
        maxChain: 0,
        rank: RANK.start[area] ?? 0,
        credits: CREDITS - 1,
        area,
        extendIndex: 0,
        missesThisArea: 0,
        bombsUsed: 0,
        kills: 0,
        bombT: 0,
        bombR: 0,
        bombX: 0,
        bombY: 0,
        cleared: false,
    };
}

export type Banner = { text: string; sub: string; t: number; life: number; style: "warning" | "info" | "reload" | "extend" | "chain" };

/** Presentation requests produced by the simulation. Consumed by fx/audio/render; never read by gameplay. */
export interface Feedback {
    shake: number;
    flash: number;
    flashColor: number;
    hitstop: number;
    cues: SfxId[];
    /** Music change request: a track id, or "stop"; consumed by the audio bridge. */
    music: MusicId | "stop" | null;
    banners: Banner[];
    /** Short-lived popups (score numbers). */
    popups: { x: number; y: number; text: string; t: number; color: number }[];
}

export interface AreaState {
    index: number;
    t: number;
    scroll: number;
    /** Background scroll distance (px), drives parallax. */
    distance: number;
    step: number;
    /** While > 0, the script clock is held (mid-boss alive). */
    hold: number;
    holdT: number;
    bossStarted: boolean;
    done: boolean;
    clearT: number;
    totalTime: number;
    /** Seconds left on the boss WARNING before the pending boss spawns. */
    warning: number;
    pending: string | null;
}

export interface BossPartRef {
    readonly entity: Entity;
    readonly role: number;
}

export interface BossRuntime {
    kind: number;
    root: Entity;
    parts: BossPartRef[];
    phase: number;
    t: number;
    phaseT: number;
    timer: number;
    /** Gun clocks keyed by name. */
    clocks: Record<string, number>;
    entering: boolean;
    dying: number;
    escaped: boolean;
    name: string;
    maxHp: number;
    hp: number;
    midboss: boolean;
    /** The core is currently invulnerable (HUD greys the bar). */
    armoured: boolean;
    /** Final bosses do not escape; set once their timer has run out. */
    overtime: boolean;
}

export interface Queries {
    enemies: SchemaQuery<[typeof Pose, typeof Enemy]>;
    bullets: SchemaQuery<[typeof Pose, typeof Motion, typeof Bullet]>;
    shots: SchemaQuery<[typeof Pose, typeof Motion, typeof Shot]>;
    items: SchemaQuery<[typeof Pose, typeof Motion, typeof Item]>;
    fx: SchemaQuery<[typeof Pose, typeof Fx]>;
    movers: SchemaQuery<[typeof Pose, typeof Motion]>;
    poses: SchemaQuery<[typeof Pose]>;
    ships: SchemaQuery<[typeof Pose, typeof Ship]>;
    halos: SchemaQuery<[typeof Pose, typeof Halo]>;
    walls: SchemaQuery<[typeof Pose, typeof Wall]>;
}

export interface Sim {
    readonly world: WorldAccess;
    readonly rng: Random;
    readonly fxRng: Random;
    readonly q: Queries;
    readonly feedback: Feedback;
    run: Run;
    area: AreaState;
    boss: BossRuntime | null;
    bossCtl: BossController | null;
    input: Actions;
    player: Entity | null;
    /** Cached player position/state for aiming (updated by the player system). */
    px: number;
    py: number;
    playerAlive: boolean;
    playerInvuln: boolean;
    /** Simulation time in seconds since mount (gameplay clock, frozen in hitstop). */
    time: number;
    /** Reduced-motion preference scales shake/flash. */
    calm: boolean;
}

export function createQueries(world: WorldAccess): Queries {
    return {
        enemies: world.query(Pose, Enemy),
        bullets: world.query(Pose, Motion, Bullet),
        shots: world.query(Pose, Motion, Shot),
        items: world.query(Pose, Motion, Item),
        fx: world.query(Pose, Fx),
        movers: world.query(Pose, Motion),
        poses: world.query(Pose),
        ships: world.query(Pose, Ship),
        halos: world.query(Pose, Halo),
        walls: world.query(Pose, Wall),
    };
}

export function newFeedback(): Feedback {
    return { shake: 0, flash: 0, flashColor: 0xffffff, hitstop: 0, cues: [], music: null, banners: [], popups: [] };
}

export function newArea(index: number, scroll: number): AreaState {
    return {
        index,
        t: 0,
        scroll,
        distance: 0,
        step: 0,
        hold: 0,
        holdT: 0,
        bossStarted: false,
        done: false,
        clearT: 0,
        totalTime: 0,
        warning: 0,
        pending: null,
    };
}

export const cue = (sim: Sim, id: SfxId): void => {
    if (!sim.feedback.cues.includes(id)) sim.feedback.cues.push(id);
};

export const shake = (sim: Sim, amount: number): void => {
    sim.feedback.shake = Math.max(sim.feedback.shake, amount);
};

export const flash = (sim: Sim, amount: number, color = 0xffffff): void => {
    if (amount >= sim.feedback.flash) sim.feedback.flashColor = color;
    sim.feedback.flash = Math.max(sim.feedback.flash, amount);
};

export const hitstop = (sim: Sim, ticks: number): void => {
    sim.feedback.hitstop = Math.max(sim.feedback.hitstop, ticks);
};

export const banner = (sim: Sim, text: string, sub: string, style: Banner["style"], life = 2): void => {
    sim.feedback.banners = sim.feedback.banners.filter((b) => b.style !== style);
    sim.feedback.banners.push({ text, sub, style, t: 0, life });
};

export const popup = (sim: Sim, x: number, y: number, text: string, color = 0xffffff): void => {
    if (sim.feedback.popups.length > 24) sim.feedback.popups.shift();
    sim.feedback.popups.push({ x, y, text, t: 0, color });
};
