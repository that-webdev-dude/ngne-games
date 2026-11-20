import { test } from "node:test";
import assert from "node:assert/strict";
import { botInput, cabinet, input } from "./helpers/harness.ts";
import { W } from "../src/config/weapons.ts";

const MAX_TICKS = 60 * 60 * 16;

/** Runs from attract through every area with an immortal, max-power bot using `weapon`. */
async function campaign(weapon: number, mode: number) {
    const h = await cabinet(`CAMPAIGN-${weapon}-${mode}`);
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    assert.equal(h.flow().mode, "play");
    const log: string[] = [];
    const bossTimes: Record<string, number> = {};
    let escapes = 0;
    let lastBoss = "";
    for (let i = 0; i < MAX_TICKS; i++) {
        const sim = h.sim();
        const flow = h.flow();
        sim.run.power = 4;
        sim.run.weapon = weapon;
        sim.run.mode = mode;
        if (sim.boss) {
            lastBoss = sim.boss.name;
            bossTimes[lastBoss] = sim.boss.t;
        }
        if (sim.feedback.banners.some((b) => b.text === "TARGET ESCAPED" || b.text === "TARGET WITHDRAWN") && !log.includes(`escape ${lastBoss}`)) {
            escapes++;
            log.push(`escape ${lastBoss}`);
        }
        if (flow.mode === "clear") {
            h.tick(input([], i % 2 ? ["Enter"] : []));
            continue;
        }
        if (flow.mode === "ending" || flow.mode === "entry" || flow.mode === "attract") break;
        h.tick(botInput(h, true));
    }
    return { mode: h.flow().mode, allClear: h.flow().allClear, escapes, log, bossTimes, score: h.sim().run.score };
}

for (const [name, weapon] of [
    ["VULCAN", W.vulcan],
    ["LANCE", W.lance],
    ["HALO", W.halo],
    ["SCATTER", W.scatter],
] as const) {
    test(`immortal bot with ${name} clears all three areas without any boss escaping`, async () => {
        const r = await campaign(weapon, 0);
        assert.equal(r.allClear, true, JSON.stringify(r));
        assert.equal(r.escapes, 0, JSON.stringify(r));
        console.log(`${name}: score ${r.score}; boss fight seconds ${JSON.stringify(Object.fromEntries(Object.entries(r.bossTimes).map(([k, v]) => [k, Math.round(v)])))}`);
    });
}

test("an idle ship (no input) is eventually shot down and reaches the continue screen", async () => {
    const h = await cabinet("IDLE");
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    let reached = false;
    for (let i = 0; i < 60 * 60 * 4 && !reached; i++) {
        h.tick();
        reached = h.flow().mode === "continue";
    }
    assert.equal(reached, true);
});
