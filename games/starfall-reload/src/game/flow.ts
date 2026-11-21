import { AREAS } from "../config/areas.ts";
import { PLAYER, RANK, SCORE } from "../config/tuning.ts";
import { Bullet, Enemy, Ship } from "../ecs/components.ts";
import { insertScore, placeFor, saveScores, saveSettings, type ScoreEntry, type Settings } from "../services/storage.ts";
import { banner, cue, newArea, newRun, type Run, type Sim } from "../sim/context.ts";
import { spawnPlayer } from "../sim/player.ts";
import { addScoreRaw } from "../sim/rules.ts";
import { stepPlay } from "../sim/step.ts";

/**
 * Cabinet flow: attract → play ⇄ pause → area clear → … → ending, with continue, game over
 * and arcade name entry. Owns transitions; the simulation owns everything inside a stage.
 */
export type Mode = "attract" | "play" | "paused" | "continue" | "gameover" | "entry" | "clear" | "ending";

export interface TallyLine {
    label: string;
    value: number;
}

export interface Flow {
    mode: Mode;
    t: number;
    page: number;
    menu: number;
    count: number;
    introT: number;
    tally: TallyLine[];
    tallyShown: number;
    entry: { letters: number[]; cursor: number; place: number; done: boolean } | null;
    scores: ScoreEntry[];
    settings: Settings;
    lastEntryPlace: number;
    allClear: boolean;
    /** Attract-mode demo: the autopilot flies a short sortie. */
    demo: boolean;
    demoCount: number;
    /** Set by the browser shell until a key or click has unlocked audio. */
    audioLocked: boolean;
    /** Set by the browser shell when the window loses focus; pauses play, dropped on other screens. */
    autoPause: boolean;
}

export const ENTRY_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!? ";
/** Pause menu; restarting the area spends a credit, exactly like a continue. */
export const pauseItems = (run: Run): readonly string[] => (run.credits > 0 ? ["RESUME", "RESTART AREA · 1 CREDIT", "QUIT TO TITLE"] : ["RESUME", "QUIT TO TITLE"]);
const CONTINUE_SECONDS = 9;
const TALLY_STEP = 0.55;

export function newFlow(scores: ScoreEntry[], settings: Settings): Flow {
    return {
        mode: "attract",
        t: 0,
        page: 0,
        menu: 0,
        count: CONTINUE_SECONDS,
        introT: 0,
        tally: [],
        tallyShown: 0,
        entry: null,
        scores,
        settings,
        lastEntryPlace: -1,
        allClear: false,
        demo: false,
        demoCount: 0,
        audioLocked: false,
        autoPause: false,
    };
}

const setMode = (flow: Flow, mode: Mode): void => {
    flow.mode = mode;
    flow.t = 0;
    flow.menu = 0;
};

export const hiScore = (flow: Flow, sim: Sim): number => Math.max(flow.scores[0]?.score ?? 0, sim.run.score);

/** Removes every entity so an area starts from a clean world. */
export function clearWorld(sim: Sim): void {
    sim.world.query().each((e) => sim.world.despawn(e));
    sim.player = null;
    sim.boss = null;
    sim.bossCtl = null;
    sim.feedback.banners = [];
    sim.feedback.popups = [];
}

export function startGame(sim: Sim, flow: Flow, area = 0): void {
    flow.demo = false;
    sim.run = newRun(area);
    flow.allClear = false;
    beginArea(sim, flow, area);
    cue(sim, "coin");
}

export function beginArea(sim: Sim, flow: Flow, index: number): void {
    clearWorld(sim);
    const def = AREAS[index]!;
    sim.area = newArea(index, def.scroll);
    const run = sim.run;
    run.area = index;
    run.missesThisArea = 0;
    run.bombT = 0;
    run.chain = 0;
    run.rank = Math.max(run.rank, RANK.start[index] ?? 0);
    flow.introT = 0;
    spawnPlayer(sim);
    sim.feedback.music = def.music;
    setMode(flow, "play");
}

/** Spend a credit: fresh ships, bombs and score at the start of the current area. */
function useCredit(sim: Sim, flow: Flow): void {
    const run = sim.run;
    run.credits--;
    run.score = 0;
    run.extendIndex = 0;
    run.lives = PLAYER.lives;
    run.bombs = PLAYER.bombs;
    run.power = 0;
    run.chips = 0;
    run.grazeMeter = 0;
    run.maxChain = 0;
    run.grazeTotal = 0;
    run.rank = RANK.start[run.area] ?? 0;
    cue(sim, "coin");
    beginArea(sim, flow, run.area);
    banner(sim, "CONTINUE", `CREDITS LEFT ${run.credits}`, "info", 2);
}

function playerOut(sim: Sim): boolean {
    if (!sim.player || sim.run.lives > 0) return false;
    const alive = sim.world.read(sim.player, Ship, "alive");
    const respawn = sim.world.read(sim.player, Ship, "respawn") ?? 0;
    return alive === 0 && respawn <= 0;
}

/** Advances the cabinet by one tick. */
export function updateFlow(sim: Sim, flow: Flow, dt: number): void {
    flow.t += dt;
    const input = sim.input;
    if (input.mutePressed) {
        flow.settings.muted = !flow.settings.muted;
        saveSettings(flow.settings);
    }
    if (input.crtPressed) {
        flow.settings.crt = !flow.settings.crt;
        saveSettings(flow.settings);
    }
    // Only play in progress pauses; a blur on another screen would otherwise pause the next game.
    if (flow.mode !== "play" || flow.demo) flow.autoPause = false;

    switch (flow.mode) {
        case "attract": {
            sim.area.distance += 30 * dt;
            sim.time += dt;
            flow.page = Math.floor(flow.t / 7) % 3;
            if (input.confirmPressed && flow.t > 0.4) startGame(sim, flow);
            else if (flow.t > 21) startDemo(sim, flow);
            return;
        }
        case "play": {
            flow.introT += dt;
            if (flow.demo) {
                if (input.confirmPressed) return startGame(sim, flow);
                stepPlay(sim, dt, true);
                if (flow.t > 32 || sim.run.lives < PLAYER.lives || sim.area.done) toAttract(sim, flow);
                return;
            }
            if (input.pausePressed || flow.autoPause) {
                flow.autoPause = false;
                setMode(flow, "paused");
                sim.feedback.cues.push("pause");
                return;
            }
            stepPlay(sim, dt, true);
            if (sim.area.done) beginTally(sim, flow);
            else if (playerOut(sim)) {
                if (sim.run.credits > 0) {
                    setMode(flow, "continue");
                    flow.count = CONTINUE_SECONDS;
                    sim.feedback.music = "stop";
                } else gameOver(sim, flow);
            }
            return;
        }
        case "paused": {
            const items = pauseItems(sim.run);
            if (input.upPressed) flow.menu = (flow.menu + items.length - 1) % items.length;
            if (input.downPressed) flow.menu = (flow.menu + 1) % items.length;
            if (input.upPressed || input.downPressed) sim.feedback.cues.push("menuMove");
            if (input.pausePressed && flow.t > 0.1) {
                flow.mode = "play";
                return;
            }
            if (input.confirmPressed && flow.t > 0.1) {
                sim.feedback.cues.push("menuSelect");
                const choice = items[flow.menu] ?? "RESUME";
                if (choice === "RESUME") flow.mode = "play";
                else if (choice.startsWith("RESTART")) useCredit(sim, flow);
                else toAttract(sim, flow);
            }
            return;
        }
        case "continue": {
            // The world keeps drifting behind the countdown.
            stepPlay(sim, dt, false, false);
            const before = Math.ceil(flow.count);
            flow.count -= dt * (input.bombPressed || input.backPressed ? 6 : 1);
            if (Math.ceil(flow.count) !== before) sim.feedback.cues.push("menuMove");
            if (input.startPressed && flow.t > 0.5) useCredit(sim, flow);
            else if (flow.count <= 0) gameOver(sim, flow);
            return;
        }
        case "clear": {
            // Victory lap: the ship can fly and fire, but cannot be hit or spend bombs.
            sim.input.bombPressed = false;
            sim.input.shiftPressed = false;
            if (sim.player) sim.world.write(sim.player, Ship, "invuln", 1);
            stepPlay(sim, dt, true, false);
            const shown = Math.min(flow.tally.length, Math.floor(flow.t / TALLY_STEP));
            while (flow.tallyShown < shown) {
                const line = flow.tally[flow.tallyShown]!;
                if (line.value > 0 && addScoreRaw(sim.run, line.value)) cue(sim, "extend");
                flow.tallyShown++;
                cue(sim, "menuSelect");
            }
            const ready = flow.t > flow.tally.length * TALLY_STEP + 2.2;
            if ((ready && input.confirmPressed) || flow.t > flow.tally.length * TALLY_STEP + 6) {
                const next = sim.run.area + 1;
                if (next < AREAS.length) beginArea(sim, flow, next);
                else {
                    flow.allClear = true;
                    clearWorld(sim);
                    sim.feedback.music = "title";
                    setMode(flow, "ending");
                }
            }
            return;
        }
        case "ending": {
            sim.area.distance += 40 * dt;
            sim.time += dt;
            if ((input.confirmPressed && flow.t > 4) || flow.t > 26) finishRun(sim, flow);
            return;
        }
        case "gameover": {
            stepPlay(sim, dt, false, false);
            if ((input.confirmPressed && flow.t > 1.5) || flow.t > 5) finishRun(sim, flow);
            return;
        }
        case "entry": {
            updateEntry(sim, flow, dt);
            return;
        }
    }
}

function beginTally(sim: Sim, flow: Flow): void {
    const run = sim.run;
    const final = run.area === AREAS.length - 1;
    flow.tally = [
        { label: "SHIPS IN RESERVE", value: run.lives * SCORE.clearBonusPerLife * (final ? 3 : 1) },
        { label: "BOMBS IN STOCK", value: run.bombs * SCORE.clearBonusPerBomb },
        { label: run.missesThisArea === 0 ? "NO MISS" : `MISSES ${run.missesThisArea}`, value: run.missesThisArea === 0 ? SCORE.noMissBonus : 0 },
        { label: `MAX CHAIN ${run.maxChain}`, value: run.maxChain * 200 },
        { label: `GRAZE ${run.grazeTotal}`, value: run.grazeTotal * 30 },
    ];
    run.maxChain = 0;
    run.grazeTotal = 0;
    flow.tallyShown = 0;
    // Leftover popcorn and bullets leave quietly so the tally is a breather.
    sim.world.query().each((e) => {
        if (e !== sim.player && (sim.world.read(e, Enemy, "kind") !== undefined || sim.world.read(e, Bullet, "kind") !== undefined)) sim.world.despawn(e);
    });
    setMode(flow, "clear");
}

function gameOver(sim: Sim, flow: Flow): void {
    sim.feedback.music = "gameOver";
    setMode(flow, "gameover");
}

function finishRun(sim: Sim, flow: Flow): void {
    const place = placeFor(flow.scores, sim.run.score);
    if (place >= 0) {
        flow.entry = { letters: [0, 0, 0], cursor: 0, place, done: false };
        sim.feedback.music = "title";
        setMode(flow, "entry");
    } else toAttract(sim, flow);
}

function updateEntry(sim: Sim, flow: Flow, dt: number): void {
    const entry = flow.entry;
    if (!entry) return toAttract(sim, flow);
    const input = sim.input;
    void dt;
    if (entry.done) {
        if (flow.t > 2.2 || (input.confirmPressed && flow.t > 0.6)) toAttract(sim, flow);
        return;
    }
    const n = ENTRY_CHARS.length;
    const letter = entry.letters[entry.cursor]!;
    if (input.upPressed || input.rightPressed) {
        entry.letters[entry.cursor] = (letter + 1) % n;
        sim.feedback.cues.push("menuMove");
    }
    if (input.downPressed || input.leftPressed) {
        entry.letters[entry.cursor] = (letter + n - 1) % n;
        sim.feedback.cues.push("menuMove");
    }
    if (input.backPressed && entry.cursor > 0) {
        entry.cursor--;
        sim.feedback.cues.push("menuMove");
    }
    if (input.confirmPressed || flow.t > 30) {
        sim.feedback.cues.push("menuSelect");
        if (entry.cursor < 2 && flow.t <= 30) entry.cursor++;
        else {
            const name = entry.letters.map((i) => ENTRY_CHARS[i]).join("");
            flow.scores = insertScore(flow.scores, { name, score: sim.run.score, area: flow.allClear ? 4 : sim.run.area + 1 });
            saveScores(flow.scores);
            flow.lastEntryPlace = entry.place;
            entry.done = true;
            flow.t = 0;
            cue(sim, "extend");
        }
    }
}

function startDemo(sim: Sim, flow: Flow): void {
    const area = flow.demoCount++ % AREAS.length;
    sim.run = newRun(area);
    sim.run.power = 2 + area;
    sim.run.weapon = area;
    beginArea(sim, flow, area);
    flow.demo = true;
}

function toAttract(sim: Sim, flow: Flow): void {
    flow.demo = false;
    clearWorld(sim);
    sim.area = newArea(0, AREAS[0]!.scroll);
    sim.run = newRun(0);
    flow.entry = null;
    sim.feedback.music = "title";
    setMode(flow, "attract");
    // Start on the high-score page right after a name entry (pages cycle every 7 s).
    if (flow.lastEntryPlace >= 0) flow.t = 7;
}
