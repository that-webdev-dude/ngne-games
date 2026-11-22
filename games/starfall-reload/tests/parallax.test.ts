import { test } from "node:test";
import assert from "node:assert/strict";
import { PLAYER } from "../src/config/tuning.ts";
import { FIELD_W } from "../src/config/view.ts";
import { PARALLAX, parallaxShift } from "../src/render/backdrops.ts";
import { newFeedback, type Sim } from "../src/sim/context.ts";
import { easeParallax } from "../src/sim/effects.ts";

const LEFT = PLAYER.marginX;
const RIGHT = FIELD_W - PLAYER.marginX;
const CENTRE = FIELD_W / 2;
/** Vertical factors of the shifted layers and their edge shifts at the starting strength. */
const EDGE = [
    ["Cirrus ocean", 0.3, 2],
    ["Cirrus clouds", 1, 7],
    ["Cirrus wisps", 2.4, 16],
    ["Aurora stars", 0.12, 1],
    ["Aurora Earth", 0.5, 3],
] as const;

test("layers shift against the ship, nearer layers more, by the ticket's edge amounts", () => {
    for (const [name, factor, px] of EDGE) {
        assert.equal(parallaxShift(LEFT, factor, PARALLAX.strength, false), px, `${name} left`);
        assert.equal(parallaxShift(RIGHT, factor, PARALLAX.strength, false), -px, `${name} right`);
        assert.equal(parallaxShift(CENTRE, factor, PARALLAX.strength, false), 0, `${name} centre`);
    }
});

test("shifts are whole pixels, symmetric about the centre and monotonic in depth", () => {
    for (let x = 0; x <= FIELD_W; x += 0.37) {
        let previous = 0;
        for (const factor of [0.12, 0.3, 0.5, 1, 2.4]) {
            const s = parallaxShift(x, factor, PARALLAX.strength, false);
            assert.ok(Number.isInteger(s) && !Object.is(s, -0), `x ${x} factor ${factor}: ${s}`);
            assert.equal(parallaxShift(FIELD_W - x, factor, PARALLAX.strength, false), -s || 0);
            assert.ok(Math.abs(s) >= Math.abs(previous));
            previous = s;
        }
    }
});

test("reduced motion removes the sideways shift", () => {
    for (const x of [0, LEFT, CENTRE, RIGHT, FIELD_W]) for (const [, factor] of EDGE) assert.equal(parallaxShift(x, factor, PARALLAX.strength, true), 0);
});

test("the parallax anchor eases to the live ship in about 0.25 s and back to centre without one", () => {
    const sim = { feedback: newFeedback(), player: 1, playerAlive: true, px: LEFT } as unknown as Sim;
    assert.equal(sim.feedback.parallaxX, CENTRE);
    const run = (seconds: number) => {
        for (let i = 0; i < Math.round(seconds * 60); i++) easeParallax(sim, 1 / 60);
    };
    run(0.05);
    const early = sim.feedback.parallaxX;
    assert.ok(early < CENTRE && early > LEFT + (CENTRE - LEFT) * 0.3, `eases, not snaps: ${early}`);
    run(0.2);
    assert.ok(Math.abs(sim.feedback.parallaxX - LEFT) < (CENTRE - LEFT) * 0.06, `settled: ${sim.feedback.parallaxX}`);
    sim.playerAlive = false;
    run(0.5);
    assert.ok(Math.abs(sim.feedback.parallaxX - CENTRE) < 1, `dead ship: ${sim.feedback.parallaxX}`);
    sim.playerAlive = true;
    sim.px = RIGHT;
    run(0.5);
    (sim as { player: unknown }).player = null;
    run(0.5);
    assert.ok(Math.abs(sim.feedback.parallaxX - CENTRE) < 1, `no ship: ${sim.feedback.parallaxX}`);
});
