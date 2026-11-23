import type { SceneDefinition } from "@ngne/core";
import { AREAS } from "../config/areas.ts";
import { FIELD } from "../config/view.ts";
import { newFlow, startGame, updateFlow, type Flow } from "../game/flow.ts";
import { skipTo } from "../sim/director.ts";
import { createPilot } from "../game/autopilot.ts";
import { Atlas } from "../render/atlas.ts";
import { backdropAssets } from "../render/backdrops.ts";
import { drawFieldOverlays, drawPanels, drawScreens } from "../render/hud.ts";
import { Painter } from "../render/painter.ts";
import { drawBackdrop, drawWorld } from "../render/world.ts";
import type { MusicPause, Sound } from "../services/sound.ts";
import { loadScores, type Settings } from "../services/storage.ts";
import { latchEdges, noActions, readActions } from "../sim/actions.ts";
import { createQueries, newArea, newFeedback, newRun, type Sim } from "../sim/context.ts";
import { easeParallax } from "../sim/effects.ts";
import { updateFx } from "../sim/motion.ts";

/** Music pause state for a flow; `pausable` mirrors the modes in which `flow.autoPause` takes effect. */
function musicPause(flow: Flow): MusicPause {
    if (flow.mode === "paused") return "paused";
    return flow.mode === "play" && !flow.demo ? "pausable" : "none";
}

/** What the browser shell can observe (screen name, settings) without touching the world. */
export interface CabinetView {
    flow: Flow | null;
    sim: Sim | null;
}

export interface CabinetOptions {
    settings: Settings;
    sound: Sound | null;
    view: CabinetView;
    /** Headless runs skip the GPU assets. */
    headless?: boolean;
    /** Development only: start directly in an area at a script time, optionally at max power. */
    debug?: { area: number; at: number; power: number; weapon: number } | null;
    /** Development only: the demo autopilot flies every sortie. */
    pilot?: boolean;
    /** Measurement only: autopilot decision interval in ticks (default 1). */
    pilotReaction?: number;
}

/**
 * The whole game is one NGNE scene: a cabinet that owns the ECS world, the flow state machine
 * and presentation. Areas reset the world rather than re-mounting scenes, so transitions are
 * instant (arcade-style) and never wait on asset preparation.
 */
export type CabinetState = Record<string, never>;

export function cabinetScene(options: CabinetOptions): SceneDefinition<CabinetState, never> {
    const atlas = new Atlas();
    return {
        id: "starfall-reload-cabinet",
        assets: options.headless ? [] : [atlas.asset(), ...backdropAssets()],
        setup(scene) {
            const sim: Sim = {
                world: scene.world,
                rng: scene.random("gameplay"),
                fxRng: scene.random("fx"),
                q: createQueries(scene.world),
                feedback: newFeedback(),
                run: newRun(0),
                area: newArea(0, AREAS[0]!.scroll),
                boss: null,
                bossCtl: null,
                input: noActions(),
                player: null,
                px: FIELD.width / 2,
                py: 300,
                playerAlive: false,
                playerInvuln: false,
                time: 0,
                calm: options.settings.calm,
            };
            const flow = newFlow(loadScores(), options.settings);
            sim.feedback.music = "title";
            options.view.flow = flow;
            options.view.sim = sim;
            scene.defer(() => {
                options.view.flow = null;
                options.view.sim = null;
            });
            const stick = { x: 0, y: 0 };
            const painter = new Painter(atlas);
            let frozen = 0;
            const pilot = createPilot(options.pilotReaction ?? 1);
            const latched = noActions();
            scene.camera.cut(-FIELD.left, 0);

            // Ordinary tick: input → flow (which steps the simulation) → hitstop and audio.
            let debug = options.debug ?? null;
            scene.system((ctx) => {
                if (debug) {
                    startGame(sim, flow, debug.area);
                    skipTo(sim, debug.at);
                    sim.run.power = debug.power;
                    sim.run.weapon = debug.weapon;
                    flow.introT = 9;
                    debug = null;
                }
                const real = readActions(ctx.input, stick);
                latchEdges(real, latched);
                Object.assign(latched, noActions());
                const piloted = (flow.demo || options.pilot === true) && flow.mode === "play";
                sim.input = piloted
                    ? { ...pilot(sim), confirmPressed: real.confirmPressed, pausePressed: flow.demo ? false : real.pausePressed, mutePressed: real.mutePressed, crtPressed: real.crtPressed }
                    : real;
                updateFlow(sim, flow, ctx.dt);
                const fb = sim.feedback;
                if (fb.hitstop > 0) {
                    scene.freeze(fb.hitstop);
                    frozen = fb.hitstop;
                    fb.hitstop = 0;
                }
                options.sound?.update(ctx.dt, fb.cues, fb.music, musicPause(flow));
                fb.cues.length = 0;
                fb.music = null;
            });

            // Presentation tick: particles, banners, shake — keeps running through hitstop.
            scene.system(
                (ctx) => {
                    const isFrozen = frozen > 0;
                    // The ordinary system is skipped during hitstop: keep its button presses.
                    if (isFrozen) latchEdges(latched, readActions(ctx.input, stick));
                    if (frozen > 0) frozen--;
                    updateFx(sim, ctx.dt, isFrozen);
                    easeParallax(sim, ctx.dt);
                    const amount = sim.feedback.shake * (flow.settings.calm ? 0.35 : 1);
                    scene.camera.shakeX = amount > 0.2 ? Math.round((sim.fxRng.next() * 2 - 1) * amount) : 0;
                    scene.camera.shakeY = amount > 0.2 ? Math.round((sim.fxRng.next() * 2 - 1) * amount) : 0;
                    if (isFrozen && sim.feedback.cues.length) {
                        options.sound?.update(ctx.dt, sim.feedback.cues, null, musicPause(flow));
                        sim.feedback.cues.length = 0;
                    }
                },
                { runsDuringFreeze: true },
            );

            scene.resetInterpolation(() => {
                sim.q.poses.eachChunk((chunk) => {
                    const pose = chunk.views.pose;
                    for (let row = 0, n = chunk.count; row < n; row++) {
                        pose.px[row] = pose.x[row]!;
                        pose.py[row] = pose.y[row]!;
                    }
                });
            });

            if (options.headless) return;
            scene.render((frame, alpha) => {
                painter.frame = frame;
                const shadows = sim.area.index < 2;
                drawBackdrop(painter, sim, sim.area.index, sim.area.distance);
                drawWorld(painter, sim, alpha, shadows);
                drawFieldOverlays(painter, sim, flow);
                drawScreens(painter, sim, flow);
                drawPanels(painter, sim, flow);
            });
        },
    };
}
